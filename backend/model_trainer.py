"""
Gamefowl Disease Detector - CNN Model Trainer
Uses MobileNetV2 transfer learning for efficient, lightweight classification.
Dynamically handles any number of disease classes.

Improvements:
  - Subject isolation via GrabCut + saliency to focus on chicken even with
    cluttered backgrounds (e.g. laptop screen showing a chicken image)
  - Faster, cached ImageNet screener with stricter gamefowl thresholds
  - Full DIP pipeline: resize → normalize → denoise → CLAHE → augment
"""

import os
import json
import numpy as np
from PIL import Image
import io
import cv2


IMG_SIZE      = (224, 224)
BATCH_SIZE    = 16
EPOCHS_FAST   = 10
EPOCHS_FULL   = 20
MIN_IMAGES_PER_CLASS = 3   # lowered for demo; real use needs 50+

SYMPTOM_LABELS = {
    "watery_eyes":       "Watery / Teary Eyes",
    "swollen_eyes":      "Swollen Eyes",
    "nasal_discharge":   "Nasal Discharge",
    "facial_swelling":   "Facial Swelling",
    "eye_lesions":       "Eye Lesions",
    "cloudy_eye":        "Cloudy / Opaque Eye",
    "skin_lesions":      "Skin Lesions",
    "scabs":             "Scabs on Skin",
    "drooping_wings":    "Drooping Wings",
    "severe_droop":      "Severe Wing Droop",
    "wing_weakness":     "Wing Weakness",
    "twisted_neck":      "Twisted Neck (Torticollis)",
    "lethargic_stance":  "Lethargic Stance",
    "imbalance":         "Loss of Balance",
    "normal_eye":        "Clear, Healthy Eyes",
    "normal_posture":    "Normal Upright Posture",
    "symmetrical_wings": "Symmetrical Wing Position"
}


# ─── Lazy TF import ───────────────────────────────────────────────────────────


# ─── Lazy TF import ───────────────────────────────────────────────────────────
def _load_tf():
    import tensorflow as tf
    from tensorflow.keras import layers, Model  # type: ignore
    from tensorflow.keras.applications import MobileNetV2  # type: ignore
    from tensorflow.keras.preprocessing.image import ImageDataGenerator  # type: ignore
    return tf, layers, Model, MobileNetV2, ImageDataGenerator


# ─── Automatic Image Restoration & Enhancement ──────────────────────────────
def restore_and_enhance_image(img_cv: np.ndarray) -> np.ndarray:
    """
    Automatic quality restoration for gamefowl images:
      1. Preserves aspect-ratio via center-square crop before resizing to 224x224 px.
      2. Adaptive lighting/gamma correction: lifts dark/underexposed ('ngitngit')
         shots without blowing out bright regions.
      3. Bilateral filter: edge-preserving smoothing that eliminates laptop/screen
         pixel grid moiré, sensor grain, and softens cage wire mesh.
    """
    h, w = img_cv.shape[:2]

    # ── 1. Aspect-ratio preserving center square crop ─────────────────────────
    min_dim = min(h, w)
    crop_x = (w - min_dim) // 2
    crop_y = (h - min_dim) // 2
    square = img_cv[crop_y:crop_y + min_dim, crop_x:crop_x + min_dim]

    # Resize to 224x224
    img_resized = cv2.resize(square, IMG_SIZE, interpolation=cv2.INTER_AREA)

    # ── 2. Adaptive Lighting Correction (Dark / "Ngitngit" or Glare Restoration)
    # Check luminance in LAB space
    lab = cv2.cvtColor(img_resized, cv2.COLOR_BGR2LAB)
    mean_l = float(np.mean(lab[:, :, 0]))

    # Dark / underexposed recovery (mean_l < 115)
    if mean_l < 115:
        # Non-linear gamma expansion: lifts dark shadows while protecting highlights
        gamma = float(np.log(128.0 / 255.0) / np.log(max(mean_l, 15.0) / 255.0))
        gamma = float(np.clip(gamma, 0.35, 1.0))
        lut = np.array([((i / 255.0) ** gamma) * 255 for i in range(256)]).astype(np.uint8)
        img_resized = cv2.LUT(img_resized, lut)
    elif mean_l > 220:
        # Overexposed glare recovery
        lut = np.array([((i / 255.0) ** 1.15) * 255 for i in range(256)]).astype(np.uint8)
        img_resized = cv2.LUT(img_resized, lut)

    # ── 3. Anti-Moiré / Screen Raster & Cage Noise Reduction ───────────────────
    # Bilateral filter smooths high-frequency screen grids & cage mesh noise while preserving sharp eye/feather edges
    img_filtered = cv2.bilateralFilter(img_resized, d=5, sigmaColor=30, sigmaSpace=30)

    return img_filtered


# ─── Subject isolation (Cage & Background Wire De-emphasis) ───────────────────
def isolate_subject(img_cv: np.ndarray) -> np.ndarray:
    """
    Isolate the chicken subject while smoothly de-emphasizing background
    and cage wires.
    Uses morphological closing to bridge gaps caused by cage wires so the chicken
    remains a single, solid foreground entity.
    Soft feathered blending avoids artificial hard borders.
    """
    h, w = img_cv.shape[:2]

    # GrabCut rect = 15% inset from each edge
    margin_x = int(w * 0.15)
    margin_y = int(h * 0.15)
    rect = (margin_x, margin_y, w - 2 * margin_x, h - 2 * margin_y)

    mask = np.zeros((h, w), np.uint8)
    bgd  = np.zeros((1, 65), np.float64)
    fgd  = np.zeros((1, 65), np.float64)

    try:
        cv2.grabCut(img_cv, mask, rect, bgd, fgd, 4, cv2.GC_INIT_WITH_RECT)
        fg_mask = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)
        coverage = fg_mask.mean()
        if coverage < 0.15 or coverage > 0.85:
            raise ValueError(f"GrabCut degenerate coverage={coverage:.2f}")
    except Exception:
        # Fallback: edge-density + thresholding
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 40, 120)
        edges_dilated = cv2.dilate(edges, np.ones((7, 7), np.uint8), iterations=2)
        _, fg_mask = cv2.threshold(edges_dilated, 0, 1, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # ── Morphological closing to bridge cage wire gaps ────────────────────────
    kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel_close)
    kernel_dilate = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_DILATE, kernel_dilate, iterations=1)

    # ── Soft Feathered Background De-emphasis ─────────────────────────────────
    # Instead of harsh solid gray (128,128,128) which creates artificial edges,
    # softly blur and dim background by 40% with a feathered transition.
    # The chicken stays 100% sharp and focused; cage wires outside are blurred away.
    alpha = cv2.GaussianBlur(fg_mask.astype(np.float32), (15, 15), 5.0)
    alpha = np.clip(alpha, 0.0, 1.0)[:, :, np.newaxis]

    blurred_bg = cv2.GaussianBlur(img_cv, (21, 21), 8.0).astype(np.float32) * 0.6
    combined = (img_cv.astype(np.float32) * alpha + blurred_bg * (1.0 - alpha))
    return np.clip(combined, 0, 255).astype(np.uint8)


# ─── Anatomical ROI Extraction (Head/Eye & Wing/Body Zoom) ────────────────────
def extract_anatomical_rois(img_cv: np.ndarray) -> dict:
    """
    Extracts anatomical regions of interest (ROIs) from a chicken photo:
      1. 'head': Zoomed crop focusing on the head, comb, and eye region.
      2. 'wing': Zoomed crop focusing on the wing and body torso.
      3. 'full': The full square-cropped chicken.
    """
    h, w = img_cv.shape[:2]
    min_dim = min(h, w)
    crop_x = (w - min_dim) // 2
    crop_y = (h - min_dim) // 2
    square = img_cv[crop_y:crop_y + min_dim, crop_x:crop_x + min_dim]
    sq_h, sq_w = square.shape[:2]

    # Find comb (red hue in HSV) to locate the head accurately
    hsv = cv2.cvtColor(square, cv2.COLOR_BGR2HSV)
    h_chan, s_chan, v_chan = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    comb_mask = ((h_chan < 15) | (h_chan > 165)) & (s_chan > 60) & (v_chan > 50)

    # If comb pixels detected, find their centroid
    comb_pts = np.argwhere(comb_mask)
    if len(comb_pts) >= 50:
        comb_y, comb_x = comb_pts.mean(axis=0)
    else:
        # Default: head is in the top-center 35% of the frame
        comb_y, comb_x = sq_h * 0.28, sq_w * 0.50

    # ── Head / Eye ROI Crop ──
    # Square box around the head, roughly 48% of min_dim
    box_size = int(sq_h * 0.48)
    head_y1 = max(0, int(comb_y - box_size * 0.35))
    head_y2 = min(sq_h, head_y1 + box_size)
    if head_y2 - head_y1 < box_size:
        head_y1 = max(0, head_y2 - box_size)

    head_x1 = max(0, int(comb_x - box_size * 0.50))
    head_x2 = min(sq_w, head_x1 + box_size)
    if head_x2 - head_x1 < box_size:
        head_x1 = max(0, head_x2 - box_size)

    head_crop = square[head_y1:head_y2, head_x1:head_x2]
    if head_crop.size == 0 or head_crop.shape[0] < 40:
        head_crop = square

    # ── Wing / Torso ROI Crop ──
    # The wing is situated mid-body below the neck, roughly from 30% to 85% height
    wing_box_size = int(sq_h * 0.65)
    wing_y1 = max(0, int(sq_h * 0.30))
    wing_y2 = min(sq_h, wing_y1 + wing_box_size)
    wing_x1 = max(0, int(sq_w * 0.15))
    wing_x2 = min(sq_w, wing_x1 + wing_box_size)
    wing_crop = square[wing_y1:wing_y2, wing_x1:wing_x2]
    if wing_crop.size == 0 or wing_crop.shape[0] < 40:
        wing_crop = square

    return {
        "full": Image.fromarray(cv2.cvtColor(square, cv2.COLOR_BGR2RGB)),
        "head": Image.fromarray(cv2.cvtColor(head_crop, cv2.COLOR_BGR2RGB)),
        "wing": Image.fromarray(cv2.cvtColor(wing_crop, cv2.COLOR_BGR2RGB)),
    }


# ─── DIP Pipeline ─────────────────────────────────────────────────────────────
def apply_dip_pipeline(img: Image.Image, is_training: bool = False) -> np.ndarray:
    """
    Full Digital Image Processing pipeline:
      1. Center-square crop & Resize 224×224 px (Aspect-ratio preservation)
      2. Quality restoration (Adaptive lighting & anti-moiré bilateral filtering)
      3. Subject isolation & cage wire de-emphasis (GrabCut + morphological bridge)
      4. Per-channel color normalization
      5. Gaussian blur (micro-smoothing)
      6. CLAHE contrast enhancement (LAB L-channel histogram equalization)
      7. [Training only] Augmentation: flip, rotate, brightness, zoom
      8. MobileNetV2 normalization → [-1, 1]
    """
    img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

    # ── 1 & 2. Square Crop, Resize 224x224 & Quality Restoration ──────────────
    img_cv = restore_and_enhance_image(img_cv)

    # ── 3. Subject isolation & Cage wire de-emphasis ───────────────────────────
    img_cv = isolate_subject(img_cv)

    # ── 4. Per-channel color normalization ────────────────────────────────────
    img_float = img_cv.astype(np.float32)
    for c in range(3):
        ch = img_float[:, :, c]
        mean, std = ch.mean(), ch.std()
        if std > 0:
            img_float[:, :, c] = (ch - mean) / std
    img_norm = cv2.normalize(img_float, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)  # type: ignore

    # ── 5. Gaussian blur ──────────────────────────────────────────────────────
    img_blur = cv2.GaussianBlur(img_norm, (3, 3), sigmaX=0.8)

    # ── 6. CLAHE (LAB L-channel histogram equalization) ───────────────────────
    lab   = cv2.cvtColor(img_blur, cv2.COLOR_BGR2LAB)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    lab[:, :, 0] = clahe.apply(lab[:, :, 0])
    img_clahe = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

    # ── 7. Augmentation (training only) ───────────────────────────────────────
    if is_training:
        if np.random.rand() > 0.5:
            img_clahe = cv2.flip(img_clahe, 1)

        angle = np.random.uniform(-20, 20)
        h, w  = img_clahe.shape[:2]
        M     = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
        img_clahe = cv2.warpAffine(img_clahe, M, (w, h), borderMode=cv2.BORDER_REFLECT)

        alpha = np.random.uniform(0.75, 1.25)
        beta  = np.random.uniform(-25, 25)
        img_clahe = cv2.convertScaleAbs(img_clahe, alpha=alpha, beta=beta)

        zoom  = np.random.uniform(0.80, 1.0)
        ch2, cw2 = int(h * zoom), int(w * zoom)
        y0, x0   = (h - ch2) // 2, (w - cw2) // 2
        img_clahe = img_clahe[y0:y0+ch2, x0:x0+cw2]
        img_clahe = cv2.resize(img_clahe, IMG_SIZE, interpolation=cv2.INTER_AREA)

    # ── 8. MobileNetV2 normalization → [-1, 1] ────────────────────────────────
    img_rgb = cv2.cvtColor(img_clahe, cv2.COLOR_BGR2RGB)
    arr     = img_rgb.astype(np.float32) / 127.5 - 1.0
    return arr


def preprocess_image(img: Image.Image) -> np.ndarray:
    """Inference-time DIP pipeline (no augmentation). Returns batch-ready array."""
    arr = apply_dip_pipeline(img, is_training=False)
    return np.expand_dims(arr, 0)


# ─── Grad-CAM Visualization ──────────────────────────────────────────────────
def generate_gradcam(img: Image.Image, model, layer_name: str | None = None) -> str:
    """
    Computes Grad-CAM heatmap for the predicted class of the input image,
    superimposes it over the original image, and returns a base64-encoded JPEG string.

    If layer_name is None, automatically finds the last convolutional layer.
    """
    import base64
    tf, *_ = _load_tf()

    # Apply the DIP preprocessing pipeline (same as inference)
    arr = preprocess_image(img)

    # Automatically find the last convolutional layer if not specified
    if layer_name is None:
        target_layer = None
        for layer in reversed(model.layers):
            if isinstance(layer, (tf.keras.layers.Conv2D, tf.keras.layers.DepthwiseConv2D)):  # type: ignore
                target_layer = layer
                break
        if target_layer is None:
            for layer in reversed(model.layers):
                if 'Conv' in layer.__class__.__name__ or 'conv' in layer.name.lower():
                    target_layer = layer
                    break
        if target_layer is None:
            raise ValueError("No convolutional layer found in model for Grad-CAM.")
    else:
        target_layer = model.get_layer(layer_name)

    # Create multi-output gradient model: model.inputs -> [target_layer.output, model.output]
    grad_model = tf.keras.models.Model(
        inputs=model.inputs,
        outputs=[target_layer.output, model.output]
    )

    with tf.GradientTape() as tape:
        conv_outputs, predictions = grad_model(arr)
        pred_index = tf.argmax(predictions[0])
        class_channel = predictions[:, pred_index]

    grads = tape.gradient(class_channel, conv_outputs)
    pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))

    conv_outputs = conv_outputs[0]
    heatmap = conv_outputs @ pooled_grads[..., tf.newaxis]
    heatmap = tf.squeeze(heatmap)

    # Apply ReLU: keep only positive features that contribute to the class
    heatmap = tf.maximum(heatmap, 0.0)
    max_val = tf.math.reduce_max(heatmap)
    if max_val > 0:
        heatmap = heatmap / max_val
    heatmap = heatmap.numpy()

    # Superimpose heatmap over the original image
    orig_cv = np.array(img.convert('RGB'))
    h, w = orig_cv.shape[:2]

    heatmap_resized = cv2.resize(heatmap, (w, h))
    heatmap_uint8   = (255 * heatmap_resized).astype(np.uint8)
    heatmap_colored = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)  # type: ignore
    heatmap_colored = cv2.cvtColor(heatmap_colored, cv2.COLOR_BGR2RGB)

    # Blend: 60% original image + 40% heatmap
    superimposed = cv2.addWeighted(orig_cv, 0.6, heatmap_colored, 0.4, 0)

    # Return base64-encoded JPEG
    pil_overlay = Image.fromarray(superimposed)
    buf = io.BytesIO()
    pil_overlay.save(buf, format='JPEG', quality=90)
    return base64.b64encode(buf.getvalue()).decode('utf-8')


# ─── Model builder ────────────────────────────────────────────────────────────
def build_model(num_classes: int, learning_rate: float = 1e-4):
    tf, layers, Model, MobileNetV2, _ = _load_tf()

    base = MobileNetV2(input_shape=(224, 224, 3), include_top=False, weights='imagenet')
    base.trainable = False

    x = base.output
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dropout(0.3)(x)
    x = layers.Dense(128, activation='relu')(x)
    x = layers.Dropout(0.2)(x)
    outputs = layers.Dense(num_classes, activation='softmax')(x)

    model = Model(inputs=base.input, outputs=outputs)
    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate), loss='categorical_crossentropy', metrics=['accuracy'])
    return model, base


class KerasProgressCallback:
    def __init__(self, start_pct, end_pct, total_epochs, stage_name, cb):
        self.start_pct = start_pct
        self.end_pct = end_pct
        self.total_epochs = total_epochs
        self.stage_name = stage_name
        self.cb = cb

    def get_keras_callback(self):
        tf, *_ = _load_tf()
        outer = self
        class _Callback(tf.keras.callbacks.Callback):
            def on_epoch_end(self, epoch, logs=None):
                if outer.cb and logs:
                    pct = int(outer.start_pct + ((epoch + 1) / max(1, outer.total_epochs)) * (outer.end_pct - outer.start_pct))
                    acc = round(float(logs.get('accuracy', 0)) * 100, 1)
                    val_acc = round(float(logs.get('val_accuracy', 0)) * 100, 1) if 'val_accuracy' in logs else None
                    loss = round(float(logs.get('loss', 0)), 4)
                    val_str = f" | Val Acc: {val_acc}%" if val_acc is not None else ""
                    msg = f"[{outer.stage_name}] Epoch {epoch+1}/{outer.total_epochs} — Loss: {loss} | Acc: {acc}%{val_str}"
                    outer.cb(pct, msg, outer.stage_name)
        return _Callback()


# ─── Training (per module) ────────────────────────────────────────────────────
def train(
    datasets_dir: str,
    models_dir: str,
    diseases_config: dict,
    module: str,
    epochs: int = 10,
    batch_size: int = 16,
    learning_rate: float = 1e-4,
    progress_cb = None
) -> dict:
    """
    module: 'eye' or 'wing'
    Trains only on diseases tagged with this module.
    Supports dynamic hyperparameters (epochs, batch_size, learning_rate) and real-time progress callbacks.
    """
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except Exception:
        pass

    IMAGE_EXTS = ('.jpg', '.jpeg', '.png', '.bmp', '.webp', '.heic', '.heif')

    def notify(pct, msg, stage="Training"):
        if progress_cb:
            try:
                progress_cb(pct, msg, stage)
            except Exception:
                pass

    notify(5, f"Initializing {module} model training pipeline...", "Initializing")
    tf, layers, Model, MobileNetV2, ImageDataGenerator = _load_tf()

    diseases      = [d for d in diseases_config['diseases'] if d.get('module') == module]
    valid_classes = []
    skipped       = []

    if not diseases:
        return {"success": False, "error": f"No diseases configured for module '{module}'"}

    notify(10, f"Scanning dataset folders for {len(diseases)} classes...", "Scanning")
    for d in diseases:
        disease_dir = os.path.join(datasets_dir, module, d['id'])
        if not os.path.exists(disease_dir):
            skipped.append(f"{d['name']} (no folder)")
            continue
        images = [f for f in os.listdir(disease_dir)
                  if f.lower().endswith(IMAGE_EXTS)]
        if len(images) < MIN_IMAGES_PER_CLASS:
            skipped.append(f"{d['name']} (only {len(images)} images, need {MIN_IMAGES_PER_CLASS}+)")
            continue
        valid_classes.append(d['id'])

    if len(valid_classes) < 2:
        return {
            "success": False,
            "error": f"Need at least 2 classes with {MIN_IMAGES_PER_CLASS}+ images each for '{module}' module.",
            "skipped": skipped,
            "valid_classes": valid_classes
        }

    label_map  = {i: cls for i, cls in enumerate(valid_classes)}
    label_path = os.path.join(models_dir, f'labels_{module}.json')
    with open(label_path, 'w') as f:
        json.dump(label_map, f, indent=2)

    notify(18, f"Processing and augmenting images for classes: {', '.join(valid_classes)}...", "Preprocessing")
    all_data, all_labels = [], []
    for cls_idx, cls_id in enumerate(valid_classes):
        cls_dir = os.path.join(datasets_dir, module, cls_id)
        for fname in os.listdir(cls_dir):
            if not fname.lower().endswith(IMAGE_EXTS):
                continue
            try:
                img      = Image.open(os.path.join(cls_dir, fname)).convert('RGB')
                arr_base = apply_dip_pipeline(img, is_training=False)
                all_data.append(arr_base)
                all_labels.append(cls_idx)
                for _ in range(2):
                    arr_aug = apply_dip_pipeline(img, is_training=True)
                    all_data.append(arr_aug)
                    all_labels.append(cls_idx)
            except Exception:
                continue

    all_data   = np.array(all_data)
    all_labels = np.array(all_labels)

    num_classes = len(valid_classes)
    one_hot     = np.zeros((len(all_labels), num_classes))
    for i, l in enumerate(all_labels):
        one_hot[i, l] = 1

    idx = np.random.permutation(len(all_data))
    all_data, one_hot = all_data[idx], one_hot[idx]

    train_split = int(0.7 * len(all_data))
    val_split   = int(0.9 * len(all_data))  # 70% train, 20% val, 10% test
    X_train = all_data[:train_split]
    X_val   = all_data[train_split:val_split]
    X_test  = all_data[val_split:]
    y_train = one_hot[:train_split]
    y_val   = one_hot[train_split:val_split]
    y_test  = one_hot[val_split:]

    notify(30, f"Built dataset: {len(X_train)} training, {len(X_val)} validation, {len(X_test)} test samples.", "Model Setup")
    model, base = build_model(num_classes, learning_rate=learning_rate)

    # Phase 1: Transfer learning (Base frozen)
    fast_epochs = max(3, int(epochs * 0.65))
    fine_epochs = max(2, epochs - fast_epochs)

    notify(35, f"Phase 1: Training top classification layers ({fast_epochs} epochs, batch_size={batch_size})...", "Phase 1: Transfer")
    cb1 = KerasProgressCallback(35, 70, fast_epochs, "Phase 1", progress_cb).get_keras_callback()
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val) if len(X_val) > 0 else None,
        epochs=fast_epochs,
        batch_size=batch_size,
        callbacks=[cb1],
        verbose=0
    )

    # Phase 2: Fine-tuning top MobileNetV2 layers
    notify(70, f"Phase 2: Fine-tuning top 20 MobileNet layers ({fine_epochs} epochs)...", "Phase 2: Fine-Tuning")
    base.trainable = True
    for layer in base.layers[:-20]:
        layer.trainable = False
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate * 0.1),
        loss='categorical_crossentropy',
        metrics=['accuracy']
    )
    cb2 = KerasProgressCallback(70, 88, fine_epochs, "Phase 2", progress_cb).get_keras_callback()
    model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val) if len(X_val) > 0 else None,
        epochs=fine_epochs,
        batch_size=batch_size,
        callbacks=[cb2],
        verbose=0
    )

    notify(88, "Saving model weights and architecture...", "Saving")
    model_path = os.path.join(models_dir, f'gamefowl_model_{module}.h5')
    model.save(model_path)

    final_acc = float(history.history['accuracy'][-1])
    val_acc   = float(history.history.get('val_accuracy', [0])[-1]) if len(X_val) > 0 else None

    # ── Evaluation on unseen test set (Task 2 & Task 3) ──────────────────────
    notify(92, "Running model evaluation on test partition...", "Evaluating")
    eval_X = X_test if len(X_test) > 0 else (X_val if len(X_val) > 0 else None)
    eval_y = y_test if len(X_test) > 0 else (y_val if len(X_val) > 0 else None)

    precision = None
    recall    = None
    f1        = None
    cm        = None
    report    = None

    if eval_X is not None and eval_y is not None and len(eval_X) > 0:
        from sklearn.metrics import (
            accuracy_score,
            precision_score,
            recall_score,
            f1_score,
            confusion_matrix,
            classification_report
        )
        preds_eval = model.predict(eval_X, verbose=0)
        y_pred = np.argmax(preds_eval, axis=1)
        y_true = np.argmax(eval_y, axis=1)

        precision = float(precision_score(y_true, y_pred, average='weighted', zero_division=0))  # type: ignore
        recall    = float(recall_score(y_true, y_pred, average='weighted', zero_division=0))     # type: ignore
        f1        = float(f1_score(y_true, y_pred, average='weighted', zero_division=0))         # type: ignore
        cm        = confusion_matrix(y_true, y_pred, labels=list(range(num_classes))).tolist()
        target_names = [label_map.get(i, f"class_{i}") for i in range(num_classes)]
        report    = classification_report(
            y_true, y_pred,
            labels=list(range(num_classes)),
            target_names=target_names,
            zero_division=0  # type: ignore
        )

    notify(100, f"Training finished successfully! Final Accuracy: {round(final_acc * 100, 1)}%", "Completed")

    return {
        "success":               True,
        "module":                module,
        "classes_trained":       valid_classes,
        "skipped":               skipped,
        "total_images":          len(all_data),
        "train_accuracy":        round(final_acc * 100, 2),
        "val_accuracy":          round(val_acc * 100, 2) if val_acc is not None else None,
        "precision":             round(precision * 100, 2) if precision is not None else None,
        "recall":                round(recall * 100, 2) if recall is not None else None,
        "f1_score":              round(f1 * 100, 2) if f1 is not None else None,
        "confusion_matrix":      cm,
        "classification_report": report,
        "model_path":            model_path
    }


# ─── Prediction (per module) ──────────────────────────────────────────────────
def _classify(img: Image.Image, models_dir: str, diseases_config: dict, module: str) -> dict:
    """Classification only — no chicken screening. Raises FileNotFoundError
    if the module's model hasn't been trained yet."""
    tf, *_ = _load_tf()

    model_path = os.path.join(models_dir, f'gamefowl_model_{module}.h5')
    label_path = os.path.join(models_dir, f'labels_{module}.json')

    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model for '{module}' module not trained yet")

    model = tf.keras.models.load_model(model_path)
    with open(label_path) as f:
        label_map = json.load(f)

    arr   = preprocess_image(img)
    preds = model.predict(arr, verbose=0)[0]

    entropy           = -np.sum(preds * np.log(preds + 1e-9))
    max_entropy        = np.log(len(preds))
    uncertainty_ratio  = entropy / max_entropy

    disease_lookup = {d['id']: d for d in diseases_config['diseases'] if d.get('module') == module}
    results = []
    for idx, prob in enumerate(preds):
        cls_id  = label_map[str(idx)]
        disease = disease_lookup.get(cls_id, {})
        results.append({
            "disease_id":   cls_id,
            "disease_name": disease.get('name', cls_id),
            "confidence":   round(float(prob) * 100, 2),
            "symptoms":     disease.get('symptoms', []),
            "severity":     disease.get('severity', 'unknown'),
            "color":        disease.get('color', '#6366f1'),
            "description":  disease.get('description', '')
        })
    results.sort(key=lambda x: x['confidence'], reverse=True)

    return {
        "module":            module,
        "uncertainty_ratio": float(uncertainty_ratio),
        "top_prediction":    results[0],
        "all_predictions":   results,
    }


def _rejection(reason: str, module: str, message: str | None = None, all_predictions=None) -> dict:
    return {
        "rejected":              True,
        "rejection_reason":      reason,
        "message":               message or reason,
        "top_prediction":        None,
        "all_predictions":       all_predictions or [],
        "detected_symptoms":     [],
        "flagged_disease":       None,
        "confidence_level":      None,
        "high_confidence_alert": False,
        "module":                module
    }


def _build_success(cls: dict, module: str) -> dict:
    top = cls['top_prediction']
    detected_symptoms = [
        {"id": s, "label": SYMPTOM_LABELS.get(s, s.replace('_', ' ').title())}
        for s in top.get('symptoms', [])
    ]
    # Alert threshold: if top confidence >= 80% AND disease detected (not healthy)
    is_disease = (top.get('severity') != 'none') and ('healthy' not in top.get('disease_id', '').lower())
    high_confidence_alert = bool(top['confidence'] >= 80.0 and is_disease)

    return {
        "rejected":              False,
        "module":                module,
        "top_prediction":        top,
        "all_predictions":       cls['all_predictions'],
        "detected_symptoms":     detected_symptoms,
        "flagged_disease":       top['disease_name'],
        "high_confidence_alert": high_confidence_alert,
        "confidence_level":  (
            "High"     if top['confidence'] >= 70 else
            "Moderate" if top['confidence'] >= 45 else
            "Low"
        )
    }


def predict(img: Image.Image, models_dir: str, diseases_config: dict, module: str) -> dict:
    """module: 'eye' or 'wing' — determines which trained model to use."""
    is_chicken, screen_score, screen_reason = _is_likely_chicken(img)
    if not is_chicken:
        return _rejection(
            screen_reason, module,
            message="No chicken detected. Please capture a clear photo of a live gamefowl."
        )

    img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    rois   = extract_anatomical_rois(img_cv)

    # Test both the zoomed anatomical region and the full frame, selecting highest confidence
    candidates = []
    roi_target = rois['head'] if module == 'eye' else rois['wing']
    candidates.append(_classify(roi_target, models_dir, diseases_config, module))
    candidates.append(_classify(rois['full'], models_dir, diseases_config, module))

    cls = max(candidates, key=lambda c: c['top_prediction']['confidence'])

    if cls['uncertainty_ratio'] > 0.92:
        return _rejection(
            f"Model too uncertain (entropy={cls['uncertainty_ratio']:.2f})", module,
            message="Image unclear. Try better lighting or a closer angle."
        )

    top = cls['top_prediction']
    # Two-tier threshold: Detection threshold < 50% rejected as too uncertain
    if top['confidence'] < 50.0:
        return _rejection(
            f"Confidence too low ({top['confidence']}%)", module,
            message=f"Detection confidence too low ({top['confidence']}%). Try a clearer image of the {module}.",
            all_predictions=cls['all_predictions']
        )

    return _build_success(cls, module)


def predict_auto(img: Image.Image, models_dir: str, diseases_config: dict) -> dict:
    """
    Automatic multi-stage gamefowl disease detection:
      1. Verifies input is a gamefowl/chicken (accepts live, caged, or screen photos).
      2. Extracts anatomical ROIs (head/eye zoom, wing/body zoom, full body).
      3. Quality-restores and enhances each ROI.
      4. Evaluates both the 'eye' and 'wing' models across full and focused ROIs.
      5. Automatically prioritizes any detected disease or highest-confidence health status.
    """
    is_chicken, screen_score, screen_reason = _is_likely_chicken(img)
    if not is_chicken:
        return _rejection(
            screen_reason, 'auto',
            message="No chicken detected. Please ensure the camera is aimed at a gamefowl chicken."
        )

    img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    rois   = extract_anatomical_rois(img_cv)

    eye_candidates = []
    wing_candidates = []

    # Evaluate eye model on zoomed head/eye and full frame
    try:
        cls_head = _classify(rois['head'], models_dir, diseases_config, 'eye')
        cls_full_eye = _classify(rois['full'], models_dir, diseases_config, 'eye')
        eye_candidates.extend([cls_head, cls_full_eye])
    except FileNotFoundError:
        pass

    # Evaluate wing model on zoomed wing/torso and full frame
    try:
        cls_wing = _classify(rois['wing'], models_dir, diseases_config, 'wing')
        cls_full_wing = _classify(rois['full'], models_dir, diseases_config, 'wing')
        wing_candidates.extend([cls_wing, cls_full_wing])
    except FileNotFoundError:
        pass

    all_candidates = eye_candidates + wing_candidates
    if not all_candidates:
        return _rejection("No trained models available", 'auto',
                          message="The disease detection models haven't been trained yet.")

    # Find the top candidate for eye and wing modules
    best_eye = max(eye_candidates, key=lambda c: c['top_prediction']['confidence']) if eye_candidates else None
    best_wing = max(wing_candidates, key=lambda c: c['top_prediction']['confidence']) if wing_candidates else None

    # Check if either module detected a disease condition
    eye_disease = bool(best_eye and (best_eye['top_prediction'].get('severity') != 'none') and ('healthy' not in best_eye['top_prediction'].get('disease_id', '').lower()))
    wing_disease = bool(best_wing and (best_wing['top_prediction'].get('severity') != 'none') and ('healthy' not in best_wing['top_prediction'].get('disease_id', '').lower()))

    # Calculate head/comb prominence to determine natural anatomical focus
    hsv_roi = cv2.cvtColor(img_cv, cv2.COLOR_BGR2HSV)
    comb_mask = ((hsv_roi[:, :, 0] < 15) | (hsv_roi[:, :, 0] > 165)) & (hsv_roi[:, :, 1] > 60) & (hsv_roi[:, :, 2] > 50)
    comb_ratio = float(comb_mask.mean())

    # Anatomical gating: If head/comb features are clearly prominent (>= 1.2% red pixels),
    # the image is focused on the head/eye region. The wing model is out-of-distribution
    # for head crops and must not falsely predict Newcastle Disease!
    if comb_ratio >= 0.012 and best_eye:
        chosen = best_eye
    elif comb_ratio < 0.005 and best_wing:
        # Body/wing features dominant — focus on Wing module
        chosen = best_wing
    elif eye_disease and not wing_disease and best_eye:
        chosen = best_eye
    elif wing_disease and not eye_disease and best_wing:
        if comb_ratio < 0.012:
            chosen = best_wing
        else:
            chosen = best_eye or best_wing
    elif eye_disease and wing_disease and best_eye and best_wing:
        if comb_ratio >= 0.010:
            chosen = best_eye
        else:
            chosen = max([best_eye, best_wing], key=lambda c: c['top_prediction']['confidence'])
    else:
        chosen = best_eye if (comb_ratio >= 0.010 and best_eye) else max(all_candidates, key=lambda c: c['top_prediction']['confidence'])

    # Two-tier threshold: Detection threshold < 50% rejected as too uncertain
    if chosen['top_prediction']['confidence'] < 50.0:
        return _rejection(
            f"Confidence too low ({chosen['top_prediction']['confidence']}%)", 'auto',
            message="Detection confidence too low. Try taking a photo closer to the chicken with better lighting.",
            all_predictions=chosen['all_predictions']
        )

    result = _build_success(chosen, chosen['module'])
    result['modules_checked'] = {}
    if best_eye:
        result['modules_checked']['eye'] = best_eye['top_prediction']
    if best_wing:
        result['modules_checked']['wing'] = best_wing['top_prediction']
    return result


# ─── Chicken screener (cached) ────────────────────────────────────────────────
_screener_model = None

def _get_screener():
    """Load ImageNet MobileNetV2 screener once and cache it."""
    global _screener_model
    if _screener_model is None:
        import tensorflow as tf
        from tensorflow.keras.applications.mobilenet_v2 import MobileNetV2  # type: ignore
        _screener_model = MobileNetV2(weights='imagenet', include_top=True)
    return _screener_model


def _is_likely_chicken(img: Image.Image) -> tuple:
    """
    Two-stage chicken verification:
      Stage 1 — ImageNet screener on pre-enhanced image.
        Accepts gamefowl, birds, poultry environment (cages, coops, wire mesh),
        and screen/laptop captures of chickens.
      Stage 2 — Texture (Gabor feather response) + Gamefowl plumage color analysis.
    """
    from tensorflow.keras.applications.mobilenet_v2 import preprocess_input, decode_predictions  # type: ignore

    screener = _get_screener()

    # Pre-enhance and isolate subject
    img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    img_enhanced = restore_and_enhance_image(img_cv)
    img_isolated = isolate_subject(img_enhanced)
    img_pil = Image.fromarray(cv2.cvtColor(img_isolated, cv2.COLOR_BGR2RGB))

    arr = np.array(img_pil, dtype=np.float32)
    arr = preprocess_input(arr)
    arr = np.expand_dims(arr, 0)

    preds   = screener.predict(arr, verbose=0)
    decoded = decode_predictions(preds, top=10)[0]

    # Strict gamefowl/poultry classes
    STRICT_CHICKEN = {
        'cock', 'hen', 'prairie_chicken', 'partridge',
        'black_grouse', 'ptarmigan', 'ruffed_grouse', 'quail'
    }
    # Broader bird classes (gamefowl at various angles can resemble these)
    BROAD_BIRD = {
        'peacock', 'grey_parrot', 'macaw', 'lorikeet',
        'brambling', 'goldfinch', 'house_finch',
        'sulphur-crested_cockatoo', 'junco', 'indigo_bunting',
        'robin', 'bulbul', 'jay', 'magpie', 'chickadee',
        'water_ouzel', 'kite', 'vulture', 'great_grey_owl'
    }
    HUMAN_LABELS = {
        'person', 'man', 'woman', 'boy', 'girl', 'face',
        'suit', 'lab_coat', 'military_uniform', 'academic_gown'
    }
    SCREEN_LABELS = {
        'monitor', 'screen', 'television', 'laptop', 'notebook',
        'computer', 'desktop_computer', 'hand-held_computer',
        'display', 'crt_screen'
    }
    POULTRY_ENV_LABELS = {
        'coop', 'aviary', 'crate', 'wire_fence', 'mesh',
        'chainlink_fence', 'fence', 'barn', 'henhouse', 'birdhouse'
    }

    def norm(lbl): return lbl.lower().replace(' ', '_').replace('-', '_')

    strict_score = sum(float(p) for _, lbl, p in decoded if norm(lbl) in STRICT_CHICKEN)
    broad_score  = sum(float(p) for _, lbl, p in decoded if norm(lbl) in BROAD_BIRD)
    human_score  = sum(float(p) for _, lbl, p in decoded[:3] if norm(lbl) in HUMAN_LABELS)
    screen_score = sum(float(p) for _, lbl, p in decoded[:5] if norm(lbl) in SCREEN_LABELS)
    cage_score   = sum(float(p) for _, lbl, p in decoded[:5] if norm(lbl) in POULTRY_ENV_LABELS)

    top_labels = ', '.join(f"{lbl}({p:.0%})" for _, lbl, p in decoded[:3])

    # ── Texture & Color Analysis ──────────────────────────────────────────────
    feather_score = _feather_texture_score(img_enhanced)
    color_score   = _gamefowl_color_score(img_enhanced)

    # ── Screen/laptop capture: NEVER reject! ──────────────────────────────────
    # When user photographs a laptop or monitor displaying a chicken,
    # evaluate the displayed chicken's feather texture and plumage colors.
    if screen_score >= 0.05:
        if strict_score >= 0.02 or broad_score >= 0.04 or feather_score > 0.28 or color_score > 0.18:
            return True, max(strict_score, broad_score, feather_score), f"Screen photo of chicken accepted (screen={screen_score:.2f}, feather={feather_score:.2f})"

    # ── Chicken inside cage/coop ──────────────────────────────────────────────
    # Cage/crate wire detected around chicken — accept if plumage/bird features exist
    if cage_score >= 0.05:
        if strict_score >= 0.02 or broad_score >= 0.04 or feather_score > 0.28 or color_score > 0.18:
            return True, max(strict_score, broad_score, feather_score), f"Caged chicken confirmed (cage={cage_score:.2f}, feather={feather_score:.2f})"

    # ── Reject: human face/body (unless clear chicken in frame) ───────────────
    if human_score >= 0.35 and strict_score < 0.05:
        return False, 0.0, f"Human detected ({top_labels})"

    # ── Accept: strict chicken ────────────────────────────────────────────────
    if strict_score >= 0.05:
        return True, strict_score, f"Chicken confirmed (score={strict_score:.2f})"

    # ── Accept: broad bird + texture heuristic ────────────────────────────────
    if broad_score >= 0.08:
        if feather_score > 0.28:
            return True, broad_score, f"Bird/fowl + feather texture (bird={broad_score:.2f}, feather={feather_score:.2f})"

    # ── Stage 2 fallback: pure texture + color heuristic ─────────────────────
    combined = feather_score * 0.6 + color_score * 0.4
    if combined > 0.38:
        return True, combined, f"Texture/color heuristic passed (feather={feather_score:.2f}, color={color_score:.2f})"

    return False, 0.0, f"Not a chicken — detected: {top_labels}"


def _feather_texture_score(img_cv: np.ndarray) -> float:
    """
    Score how 'feathery' the image is using Gabor filter bank.
    Feathers produce strong oriented texture responses across multiple angles.
    Returns score in [0, 1].
    """
    gray     = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY).astype(np.float32)
    responses = []
    for theta in np.linspace(0, np.pi, 6):
        kernel = cv2.getGaborKernel((21, 21), sigma=4.0, theta=theta,
                                     lambd=10.0, gamma=0.5, psi=0)
        resp   = cv2.filter2D(gray, cv2.CV_32F, kernel)
        responses.append(np.abs(resp).mean())
    # Normalize: strong, multi-directional response → high score
    max_r   = max(responses) if max(responses) > 0 else 1.0
    normed  = [r / max_r for r in responses]
    # Score = mean response × directional consistency (low variance = consistent)
    variance   = np.var(normed)
    mean_resp  = np.mean(normed)
    score      = mean_resp * (1.0 - min(variance * 4, 1.0))
    return float(np.clip(score, 0, 1))


def _gamefowl_color_score(img_cv: np.ndarray) -> float:
    """
    Score how likely the dominant colors match gamefowl plumage.
    Gamefowl typically have warm reds, oranges, blacks, and iridescent greens.
    Uses HSV color histogram analysis.
    Returns score in [0, 1].
    """
    hsv = cv2.cvtColor(img_cv, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[:,:,0], hsv[:,:,1], hsv[:,:,2]

    # Only consider sufficiently saturated pixels (not background gray)
    sat_mask = (s > 40)  # type: ignore

    if sat_mask.sum() < 100:
        return 0.0

    h_vals = h[sat_mask].astype(np.float32)

    # Gamefowl hue ranges in OpenCV HSV (0-180):
    # Red/orange: 0-20 and 160-180
    # Yellow/gold: 20-35
    # Green/iridescent: 35-85
    # Black feathers → low value; white feathers → high value, low sat
    red_orange = ((h_vals < 20) | (h_vals > 160)).mean()
    yellow_gold = ((h_vals >= 20) & (h_vals < 35)).mean()
    iridescent  = ((h_vals >= 35) & (h_vals < 85)).mean()

    score = red_orange * 0.5 + yellow_gold * 0.3 + iridescent * 0.2
    return float(np.clip(score * 2.5, 0, 1))  # scale up since these are partial ratios
