"""
Gamefowl Disease Detector - CNN Model Trainer
Uses MobileNetV2 transfer learning for efficient, lightweight classification.
Dynamically handles any number of disease classes.
"""

import os
import json
import numpy as np
from PIL import Image
import io
import cv2


IMG_SIZE = (224, 224)
BATCH_SIZE = 16
EPOCHS_FAST = 10
EPOCHS_FULL = 20
MIN_IMAGES_PER_CLASS = 3  # lowered for demo; real use needs 50+


def _load_tf():
    """Lazy import TensorFlow to avoid slow startup."""
    import tensorflow as tf
    from tensorflow.keras import layers, Model
    from tensorflow.keras.applications import MobileNetV2
    from tensorflow.keras.preprocessing.image import ImageDataGenerator
    return tf, layers, Model, MobileNetV2, ImageDataGenerator


def apply_dip_pipeline(img: Image.Image, is_training: bool = False) -> np.ndarray:
    """
    Full Digital Image Processing (DIP) pipeline using OpenCV.
    As described in the research paper:
      1. Resize to standard input size (224x224)
      2. Color normalization — minimize lighting inconsistencies
      3. Gaussian blur — noise reduction
      4. Histogram equalization — contrast enhancement (CLAHE)
      5. MobileNetV2 normalization (range [-1, 1])

    During training, augmentation is also applied:
      6. Random rotation
      7. Horizontal flip
      8. Brightness/contrast jitter
      9. Zoom (crop + resize)
    """
    # Convert PIL → OpenCV (BGR)
    img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

    # ── Step 1: Resize ────────────────────────────────────────────────────────
    img_cv = cv2.resize(img_cv, IMG_SIZE, interpolation=cv2.INTER_AREA)

    # ── Step 2: Color normalization (per-channel mean subtraction) ────────────
    # Converts to float, normalizes each channel to reduce lighting variance
    img_float = img_cv.astype(np.float32)
    for c in range(3):
        ch = img_float[:, :, c]
        mean, std = ch.mean(), ch.std()
        if std > 0:
            img_float[:, :, c] = (ch - mean) / std
    # Scale back to [0, 255] for subsequent OpenCV operations
    img_norm = cv2.normalize(img_float, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

    # ── Step 3: Gaussian blur — noise reduction ───────────────────────────────
    img_blur = cv2.GaussianBlur(img_norm, (3, 3), sigmaX=0.8)

    # ── Step 4: CLAHE histogram equalization — contrast enhancement ───────────
    # Applied per channel in LAB color space to avoid color distortion
    lab = cv2.cvtColor(img_blur, cv2.COLOR_BGR2LAB)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    lab[:, :, 0] = clahe.apply(lab[:, :, 0])   # only L (lightness) channel
    img_clahe = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

    # ── Step 5 (Training only): Augmentation ─────────────────────────────────
    if is_training:
        # Random horizontal flip
        if np.random.rand() > 0.5:
            img_clahe = cv2.flip(img_clahe, 1)

        # Random rotation ±20°
        angle = np.random.uniform(-20, 20)
        h, w = img_clahe.shape[:2]
        M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
        img_clahe = cv2.warpAffine(img_clahe, M, (w, h),
                                    borderMode=cv2.BORDER_REFLECT)

        # Random brightness/contrast jitter
        alpha = np.random.uniform(0.75, 1.25)   # contrast
        beta  = np.random.uniform(-25, 25)       # brightness
        img_clahe = cv2.convertScaleAbs(img_clahe, alpha=alpha, beta=beta)

        # Random zoom (crop center 80–100%, then resize back)
        zoom = np.random.uniform(0.80, 1.0)
        ch, cw = int(h * zoom), int(w * zoom)
        y0 = (h - ch) // 2
        x0 = (w - cw) // 2
        img_clahe = img_clahe[y0:y0+ch, x0:x0+cw]
        img_clahe = cv2.resize(img_clahe, IMG_SIZE, interpolation=cv2.INTER_AREA)

    # ── Step 6: MobileNetV2 normalization → [-1, 1] ───────────────────────────
    img_rgb = cv2.cvtColor(img_clahe, cv2.COLOR_BGR2RGB)
    arr = img_rgb.astype(np.float32) / 127.5 - 1.0
    return arr


def preprocess_image(img: Image.Image) -> np.ndarray:
    """Inference-time DIP pipeline (no augmentation). Returns batch-ready array."""
    arr = apply_dip_pipeline(img, is_training=False)
    return np.expand_dims(arr, 0)


def build_model(num_classes: int):
    tf, layers, Model, MobileNetV2, _ = _load_tf()

    base = MobileNetV2(
        input_shape=(224, 224, 3),
        include_top=False,
        weights='imagenet'
    )
    base.trainable = False  # freeze base for fast training

    x = base.output
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dropout(0.3)(x)
    x = layers.Dense(128, activation='relu')(x)
    x = layers.Dropout(0.2)(x)
    outputs = layers.Dense(num_classes, activation='softmax')(x)

    model = Model(inputs=base.input, outputs=outputs)
    model.compile(
        optimizer='adam',
        loss='categorical_crossentropy',
        metrics=['accuracy']
    )
    return model, base


def train(datasets_dir: str, models_dir: str, diseases_config: dict) -> dict:
    tf, layers, Model, MobileNetV2, ImageDataGenerator = _load_tf()

    # Collect valid classes (disease folders with enough images)
    diseases = diseases_config['diseases']
    valid_classes = []
    skipped = []

    for d in diseases:
        disease_dir = os.path.join(datasets_dir, d['id'])
        if not os.path.exists(disease_dir):
            skipped.append(f"{d['name']} (no folder)")
            continue
        images = [f for f in os.listdir(disease_dir)
                  if f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp', '.webp'))]
        if len(images) < MIN_IMAGES_PER_CLASS:
            skipped.append(f"{d['name']} (only {len(images)} images, need {MIN_IMAGES_PER_CLASS}+)")
            continue
        valid_classes.append(d['id'])

    if len(valid_classes) < 2:
        return {
            "success": False,
            "error": f"Need at least 2 disease classes with {MIN_IMAGES_PER_CLASS}+ images each.",
            "skipped": skipped,
            "valid_classes": valid_classes
        }

    # Save label map
    label_map = {i: cls for i, cls in enumerate(valid_classes)}
    label_path = os.path.join(models_dir, 'labels.json')
    with open(label_path, 'w') as f:
        json.dump(label_map, f, indent=2)

    # Data generators
    train_gen = ImageDataGenerator(
        rescale=1./127.5,
        preprocessing_function=lambda x: x - 1.0,
        rotation_range=20,
        horizontal_flip=True,
        brightness_range=[0.7, 1.3],
        zoom_range=0.2,
        validation_split=0.2
    )

    # We need to build a filtered dataset directory reference
    # by temporarily symlinking or just loading manually
    all_data, all_labels = [], []
    for cls_idx, cls_id in enumerate(valid_classes):
        cls_dir = os.path.join(datasets_dir, cls_id)
        for fname in os.listdir(cls_dir):
            if not fname.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp', '.webp')):
                continue
            try:
                img = Image.open(os.path.join(cls_dir, fname)).convert('RGB')
                # ── DIP Pipeline (no augmentation) — base image ──────────────
                arr_base = apply_dip_pipeline(img, is_training=False)
                all_data.append(arr_base)
                all_labels.append(cls_idx)
                # ── DIP Pipeline with augmentation — 2 extra copies ──────────
                # This artificially expands the dataset with varied versions
                for _ in range(2):
                    arr_aug = apply_dip_pipeline(img, is_training=True)
                    all_data.append(arr_aug)
                    all_labels.append(cls_idx)
            except Exception:
                continue

    all_data = np.array(all_data)
    all_labels = np.array(all_labels)

    # One-hot encode
    num_classes = len(valid_classes)
    one_hot = np.zeros((len(all_labels), num_classes))
    for i, l in enumerate(all_labels):
        one_hot[i, l] = 1

    # Shuffle
    idx = np.random.permutation(len(all_data))
    all_data, one_hot = all_data[idx], one_hot[idx]

    split = int(0.8 * len(all_data))
    X_train, X_val = all_data[:split], all_data[split:]
    y_train, y_val = one_hot[:split], one_hot[split:]

    # Build and train model
    model, base = build_model(num_classes)

    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val) if len(X_val) > 0 else None,
        epochs=EPOCHS_FAST,
        batch_size=BATCH_SIZE,
        verbose=0
    )

    # Fine-tune: unfreeze last 20 layers
    base.trainable = True
    for layer in base.layers[:-20]:
        layer.trainable = False

    model.compile(
        optimizer=tf.keras.optimizers.Adam(1e-5),
        loss='categorical_crossentropy',
        metrics=['accuracy']
    )
    model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val) if len(X_val) > 0 else None,
        epochs=5,
        batch_size=BATCH_SIZE,
        verbose=0
    )

    # Save
    model_path = os.path.join(models_dir, 'gamefowl_model.h5')
    model.save(model_path)

    final_acc = float(history.history['accuracy'][-1])
    val_acc = float(history.history.get('val_accuracy', [0])[-1]) if len(X_val) > 0 else None

    return {
        "success": True,
        "classes_trained": valid_classes,
        "skipped": skipped,
        "total_images": len(all_data),
        "train_accuracy": round(final_acc * 100, 2),
        "val_accuracy": round(val_acc * 100, 2) if val_acc else None,
        "model_path": model_path
    }


def _is_likely_chicken(img: Image.Image) -> tuple[bool, float, str]:
    """
    Pre-screen the image using MobileNetV2 pretrained on ImageNet.
    Returns (is_chicken, score, reason).
    Chicken-related ImageNet class indices (gallus/bird/fowl classes):
      7=cock, 8=hen, 9=ostrich, 10=brambling, 11=goldfinch, 12=house finch,
      80=black grouse, 81=ptarmigan, 82=ruffed grouse, 83=prairie chicken,
      84=peacock, 85=quail, 86=partridge, 87=grey parrot, 88=macaw,
      89=sulphur-crested cockatoo, 90=lorikeet, 127=white stork, 128=black stork,
      129=spoonbill, 130=flamingo, 131=little blue heron, 132=great egret,
      133=bittern, 134=crane bird, 135=limpkin, 136=European gallinule,
      137=American coot, 138=bustard, 139=ruddy turnstone, 140=dunlin,
      141=common redshank, 142=dowitcher, 143=oystercatcher
    We focus tightly on actual chicken/fowl classes: 7, 8, 83, 84, 85, 86.
    """
    import tensorflow as tf
    from tensorflow.keras.applications.mobilenet_v2 import MobileNetV2, preprocess_input, decode_predictions

    # Load a shared screener model (cached on module level)
    if not hasattr(_is_likely_chicken, '_screener'):
        _is_likely_chicken._screener = MobileNetV2(weights='imagenet', include_top=True)

    screener = _is_likely_chicken._screener

    # Preprocess for ImageNet screener
    img_resized = img.resize((224, 224))
    arr = np.array(img_resized, dtype=np.float32)
    arr = preprocess_input(arr)
    arr = np.expand_dims(arr, 0)

    preds = screener.predict(arr, verbose=0)
    decoded = decode_predictions(preds, top=5)[0]  # [(class_id, label, prob), ...]

    # ImageNet indices for chicken/fowl/bird classes we accept
    CHICKEN_CLASS_IDS = {
        'cock', 'hen', 'prairie_chicken', 'quail', 'partridge',
        'peacock', 'grey_parrot', 'macaw', 'lorikeet',
        'brambling', 'goldfinch', 'house_finch',
        'black_grouse', 'ptarmigan', 'ruffed_grouse',
        'sulphur-crested_cockatoo', 'junco', 'indigo_bunting',
        'robin', 'bulbul', 'jay', 'magpie', 'chickadee',
        'water_ouzel', 'kite', 'bald_eagle', 'vulture',
        'great_grey_owl', 'European_fire_salamander'  # keep broad bird net
    }

    # Strictly chicken classes (high confidence path)
    STRICT_CHICKEN = {'cock', 'hen', 'prairie_chicken'}

    top_label = decoded[0][1].lower().replace(' ', '_')
    top_prob = float(decoded[0][2])

    # Accumulate bird/poultry confidence across top-5
    bird_score = sum(float(p) for _, lbl, p in decoded if lbl.lower().replace(' ', '_') in CHICKEN_CLASS_IDS)
    strict_score = sum(float(p) for _, lbl, p in decoded if lbl.lower().replace(' ', '_') in STRICT_CHICKEN)

    # Decision logic:
    # 1. Top prediction is strictly a chicken with decent confidence → accept
    if strict_score >= 0.10:
        return True, strict_score, f"Detected as chicken (score: {strict_score:.2f})"

    # 2. Broad bird score is high enough → accept (covers unusual angles/breeds)
    if bird_score >= 0.15:
        return True, bird_score, f"Detected as bird/fowl (score: {bird_score:.2f})"

    # 3. Top prediction is a person/human → reject immediately
    HUMAN_LABELS = {'person', 'man', 'woman', 'boy', 'girl', 'face', 'suit',
                    'lab_coat', 'military_uniform', 'academic_gown', 'cowboy_hat'}
    if any(lbl.lower().replace(' ', '_') in HUMAN_LABELS for _, lbl, _ in decoded[:3]):
        return False, 0.0, f"Human detected (top: {decoded[0][1]}, {top_prob:.0%})"

    # 4. Otherwise reject — not a chicken
    top_labels_str = ', '.join(f"{lbl}({p:.0%})" for _, lbl, p in decoded[:3])
    return False, bird_score, f"Not a chicken — detected: {top_labels_str}"


def predict(img: Image.Image, models_dir: str, diseases_config: dict) -> dict:
    tf, *_ = _load_tf()

    model_path = os.path.join(models_dir, 'gamefowl_model.h5')
    label_path = os.path.join(models_dir, 'labels.json')

    if not os.path.exists(model_path):
        raise FileNotFoundError("Model not trained yet")

    # ── Step 1: Pre-screen — is this actually a chicken? ──────────────────────
    is_chicken, screen_score, screen_reason = _is_likely_chicken(img)
    if not is_chicken:
        return {
            "rejected": True,
            "rejection_reason": screen_reason,
            "message": "No chicken detected in the image. Please capture or upload a clear photo of a gamefowl chicken.",
            "top_prediction": None,
            "all_predictions": [],
            "detected_symptoms": [],
            "flagged_disease": None,
            "confidence_level": None
        }

    # ── Step 2: Run disease detection model ───────────────────────────────────
    model = tf.keras.models.load_model(model_path)
    with open(label_path) as f:
        label_map = json.load(f)  # {"0": "infectious_coryza", ...}

    arr = preprocess_image(img)
    preds = model.predict(arr, verbose=0)[0]

    # ── Step 3: Check overall confidence (entropy-based uncertainty) ──────────
    # If the model is very uncertain (predictions spread evenly), reject
    entropy = -np.sum(preds * np.log(preds + 1e-9))
    max_entropy = np.log(len(preds))
    uncertainty_ratio = entropy / max_entropy  # 0=certain, 1=totally uncertain

    UNCERTAINTY_THRESHOLD = 0.92  # reject if model is >92% uncertain
    if uncertainty_ratio > UNCERTAINTY_THRESHOLD:
        return {
            "rejected": True,
            "rejection_reason": f"Model too uncertain (entropy ratio: {uncertainty_ratio:.2f})",
            "message": "The image is unclear or the chicken is not visible enough for reliable detection. Try better lighting or a clearer angle.",
            "top_prediction": None,
            "all_predictions": [],
            "detected_symptoms": [],
            "flagged_disease": None,
            "confidence_level": None
        }

    # ── Step 4: Build results ─────────────────────────────────────────────────
    disease_lookup = {d['id']: d for d in diseases_config['diseases']}
    results = []
    for idx, prob in enumerate(preds):
        cls_id = label_map[str(idx)]
        disease = disease_lookup.get(cls_id, {})
        results.append({
            "disease_id": cls_id,
            "disease_name": disease.get('name', cls_id),
            "confidence": round(float(prob) * 100, 2),
            "symptoms": disease.get('symptoms', []),
            "severity": disease.get('severity', 'unknown'),
            "color": disease.get('color', '#6366f1'),
            "description": disease.get('description', '')
        })

    results.sort(key=lambda x: x['confidence'], reverse=True)
    top = results[0]

    # ── Step 5: Minimum confidence threshold ──────────────────────────────────
    MIN_CONFIDENCE = 30.0  # below this, result is unreliable
    if top['confidence'] < MIN_CONFIDENCE:
        return {
            "rejected": True,
            "rejection_reason": f"Top confidence too low ({top['confidence']}%)",
            "message": f"Detection confidence is too low ({top['confidence']}%). Try a clearer, well-lit image focusing on the chicken's eye or wing area.",
            "top_prediction": None,
            "all_predictions": results,
            "detected_symptoms": [],
            "flagged_disease": None,
            "confidence_level": "Too Low"
        }

    # ── Step 6: Map symptoms to human-readable labels ─────────────────────────
    symptom_labels = {
        "watery_eyes": "Watery / Teary Eyes",
        "swollen_eyes": "Swollen Eyes",
        "nasal_discharge": "Nasal Discharge",
        "facial_swelling": "Facial Swelling",
        "eye_lesions": "Eye Lesions",
        "cloudy_eye": "Cloudy / Opaque Eye",
        "skin_lesions": "Skin Lesions",
        "scabs": "Scabs on Skin",
        "drooping_wings": "Drooping Wings",
        "severe_droop": "Severe Wing Droop",
        "wing_weakness": "Wing Weakness",
        "twisted_neck": "Twisted Neck (Torticollis)",
        "normal_eye": "Clear, Healthy Eyes",
        "normal_posture": "Normal Upright Posture",
        "symmetrical_wings": "Symmetrical Wing Position"
    }

    detected_symptoms = [
        {"id": s, "label": symptom_labels.get(s, s.replace('_', ' ').title())}
        for s in top.get('symptoms', [])
    ]

    return {
        "rejected": False,
        "top_prediction": top,
        "all_predictions": results,
        "detected_symptoms": detected_symptoms,
        "flagged_disease": top['disease_name'],
        "confidence_level": (
            "High" if top['confidence'] >= 70 else
            "Moderate" if top['confidence'] >= 45 else
            "Low"
        )
    }
