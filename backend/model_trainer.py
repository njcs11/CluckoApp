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
import re
import numpy as np
from PIL import Image
import io
import cv2


IMG_SIZE      = (224, 224)
BATCH_SIZE    = 16
EPOCHS_FAST   = 10
EPOCHS_FULL   = 20
MIN_IMAGES_PER_CLASS = 3   # lowered for demo; real use needs 50+
SYMPTOM_THRESHOLD    = 0.50  # Confidence threshold (>= 50%) for dynamic visible symptom detection

MODULE_SYMPTOMS = {
    "eye": [
        "facial_swelling",
        "swollen_eyes",
        "watery_eyes",
        "closed_swollen_eyes",
        "eye_lesions",
        "wart_like_nodules",
        "scabs",
        "yellow_bumps"
    ],
    "wing": [
        "drooping_wings",
        "severe_droop",
        "wing_weakness"
    ]
}

SYMPTOM_LABELS = {
    # Infectious Coryza
    "facial_swelling":     "Facial Swelling",
    "swollen_eyes":        "Swollen Eyes",
    "watery_eyes":         "Watery Eye Discharge",
    "closed_swollen_eyes": "Closed Swollen Eyes",
    # Fowl Pox
    "eye_lesions":         "Eye & Eyelid Lesions",
    "wart_like_nodules":   "Wart-Like Nodules",
    "scabs":               "Dark Brown Scabs",
    "yellow_bumps":        "Yellow Bumps",
    # Newcastle Disease
    "drooping_wings":      "Drooping Wings",
    "severe_droop":        "Severe Wing Droop",
    "wing_weakness":       "Wing Weakness",
    # Additional signs
    "cloudy_eye":          "Cloudy / Opaque Cornea",
    "skin_lesions":        "Peri-Orbital Skin Lesions",
    "twisted_neck":        "Twisted Neck (Torticollis)",
    "lethargic_stance":    "Lethargic Stance",
    "imbalance":           "Loss of Balance",
    # Healthy markers
    "normal_eye":          "Clear, Alert Healthy Eyes",
    "normal_posture":      "Normal Upright Posture",
    "symmetrical_wings":   "Symmetrical Wing Position"
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


# ─── Multi-Label Dataset Annotation Scanner ──────────────────────────────────
def load_symptom_annotations(datasets_dir: str, module: str | None = None) -> dict:
    """
    Scans datasets directory for multi-label symptom annotations.
    Supports:
      - JSON format: { "img.jpg": { "disease": "coryza", "symptoms": ["swollen_eyes", "watery_eyes"] } }
        or { "img.jpg": ["swollen_eyes", "watery_eyes"] }
      - CSV format: filename,disease,symptoms
      - Subdirectory naming: e.g. /swollen_eyes/img.jpg
    Returns: dict mapping basename -> list of symptom IDs.
    """
    if not os.path.exists(datasets_dir):
        backend_datasets = os.path.join(os.path.dirname(__file__), datasets_dir)
        if os.path.exists(backend_datasets):
            datasets_dir = backend_datasets
        else:
            backend_default = os.path.join(os.path.dirname(__file__), 'datasets')
            if os.path.exists(backend_default):
                datasets_dir = backend_default

    annotations = {}
    candidate_paths = [
        os.path.join(datasets_dir, 'annotations.json'),
        os.path.join(datasets_dir, 'symptoms.json'),
        os.path.join(datasets_dir, 'metadata.json')
    ]
    if module:
        candidate_paths.extend([
            os.path.join(datasets_dir, module, 'annotations.json'),
            os.path.join(datasets_dir, module, 'symptoms.json'),
            os.path.join(datasets_dir, module, 'metadata.json')
        ])

    for p in candidate_paths:
        if os.path.exists(p):
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    for k, v in data.items():
                        fname = os.path.basename(k)
                        if isinstance(v, dict):
                            syms = v.get('symptoms', [])
                        elif isinstance(v, list):
                            syms = v
                        else:
                            syms = []
                        if syms:
                            annotations[fname] = [str(s).strip() for s in syms]
            except Exception as e:
                print(f"[ANNOTATIONS] Notice loading {p}: {e}")

    # CSV scan
    csv_candidates = [
        os.path.join(datasets_dir, 'annotations.csv'),
        os.path.join(datasets_dir, 'symptoms.csv')
    ]
    if module:
        csv_candidates.append(os.path.join(datasets_dir, module, 'annotations.csv'))
    for cp in csv_candidates:
        if os.path.exists(cp):
            try:
                import csv
                with open(cp, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        fname = os.path.basename(row.get('filename') or row.get('image') or '')
                        raw_syms = row.get('symptoms') or ''
                        if fname and raw_syms:
                            parts = [s.strip() for s in re.split(r'[,|;]', raw_syms) if s.strip()]
                            annotations[fname] = parts
            except Exception as e:
                print(f"[ANNOTATIONS] Notice loading CSV {cp}: {e}")

    return annotations


# ─── Visible Symptom Feature Extractor ────────────────────────────────────────
def extract_visual_symptom_features(img: Image.Image, module: str, disease_id: str) -> dict:
    """
    Computer vision feature extractor for visible disease symptoms.
    Calculates independent symptom confidence scores (0.0 to 1.0) based on
    anatomical visual markers.
    """
    scores = {}
    try:
        img_cv = cv2.cvtColor(np.array(img.convert('RGB')), cv2.COLOR_RGB2BGR)
        rois = extract_anatomical_rois(img_cv)

        if module == 'eye':
            head_crop = np.array(rois['head'])
            h_h, h_w = head_crop.shape[:2]
            head_bgr = cv2.cvtColor(head_crop, cv2.COLOR_RGB2BGR)
            gray = cv2.cvtColor(head_bgr, cv2.COLOR_BGR2GRAY)
            hsv = cv2.cvtColor(head_bgr, cv2.COLOR_BGR2HSV)
            lab = cv2.cvtColor(head_bgr, cv2.COLOR_BGR2LAB)

            # Central ocular quadrant (where eye and sinus sit)
            eye_zone = head_bgr[int(h_h*0.25):int(h_h*0.75), int(h_w*0.20):int(h_w*0.80)]
            eye_gray = gray[int(h_h*0.25):int(h_h*0.75), int(h_w*0.20):int(h_w*0.80)]
            eye_hsv = hsv[int(h_h*0.25):int(h_h*0.75), int(h_w*0.20):int(h_w*0.80)]
            eye_lab = lab[int(h_h*0.25):int(h_h*0.75), int(h_w*0.20):int(h_w*0.80)]

            # 1. watery_eyes: Moisture glints & high specular highlight reflection
            # Specular wet reflection: V > 218, S < 45
            specular_mask = (eye_hsv[:, :, 2] > 218) & (eye_hsv[:, :, 1] < 45)
            glint_count = int(np.sum(specular_mask))
            glint_ratio = glint_count / max(1, eye_hsv.shape[0] * eye_hsv.shape[1])
            watery_conf = float(np.clip(0.35 + glint_ratio * 45.0, 0.15, 0.95))
            scores['watery_eyes'] = watery_conf

            # 2. closed_swollen_eyes: Palpebral aperture height/width aspect ratio
            _, dark_thresh = cv2.threshold(eye_gray, 45, 255, cv2.THRESH_BINARY_INV)
            contours, _ = cv2.findContours(dark_thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            aperture_ratio = 0.5  # default open
            if contours:
                c_max = max(contours, key=cv2.contourArea)
                if cv2.contourArea(c_max) > 25:
                    bx, by, bw, bh = cv2.boundingRect(c_max)
                    aperture_ratio = bh / max(1, bw)
            if aperture_ratio < 0.28:
                closed_conf = float(np.clip(0.78 + (0.28 - aperture_ratio) * 0.8, 0.65, 0.94))
            elif aperture_ratio < 0.40:
                closed_conf = float(np.clip(0.50 + (0.40 - aperture_ratio) * 1.5, 0.40, 0.70))
            else:
                closed_conf = float(np.clip(0.30 - (aperture_ratio - 0.40) * 0.4, 0.10, 0.35))
            scores['closed_swollen_eyes'] = closed_conf

            # 3. swollen_eyes: Peri-orbital inflammatory edema & tissue puffiness
            grad_x = cv2.Sobel(eye_gray, cv2.CV_32F, 1, 0, ksize=3)
            grad_y = cv2.Sobel(eye_gray, cv2.CV_32F, 0, 1, ksize=3)
            grad_mag = cv2.magnitude(grad_x, grad_y)
            mean_grad = float(np.mean(grad_mag))
            puffiness_index = float(np.clip(0.55 + (35.0 - min(mean_grad, 35.0)) * 0.012 + glint_ratio * 15.0, 0.30, 0.95))
            scores['swollen_eyes'] = puffiness_index

            # 4. facial_swelling: Sinus asymmetry / lateral protrusion below eye
            sinus_zone = eye_lab[int(eye_lab.shape[0]*0.45):, :]
            cranial_zone = eye_lab[:int(eye_lab.shape[0]*0.45), :]
            sinus_mass = float(np.mean(sinus_zone[:, :, 0]))
            cranial_mass = float(np.mean(cranial_zone[:, :, 0]))
            sinus_ratio = sinus_mass / max(1.0, cranial_mass)
            facial_conf = float(np.clip(0.40 + (sinus_ratio - 0.85) * 1.5, 0.20, 0.92))
            scores['facial_swelling'] = facial_conf

            # 5. scabs: Dark brown necrotic crusted patches (low L* channel, brownish hue)
            scab_mask = (eye_lab[:, :, 0] < 65) & (eye_lab[:, :, 1] > 126) & (eye_lab[:, :, 2] > 126)
            scab_density = float(np.sum(scab_mask)) / max(1, eye_lab.shape[0] * eye_lab.shape[1])
            scab_conf = float(np.clip(0.30 + scab_density * 30.0, 0.15, 0.94))
            scores['scabs'] = scab_conf

            # 6. wart_like_nodules: Raised textural papules & high Laplacian variance on skin
            lap_var = float(cv2.Laplacian(eye_gray, cv2.CV_64F).var())
            nodule_conf = float(np.clip(0.35 + (lap_var / 500.0) * 0.45, 0.20, 0.95))
            scores['wart_like_nodules'] = nodule_conf

            # 7. yellow_bumps: Yellow-pigmented epidermal eruptions
            yellow_mask = (eye_hsv[:, :, 0] >= 18) & (eye_hsv[:, :, 0] <= 42) & (eye_hsv[:, :, 1] > 70) & (eye_hsv[:, :, 2] > 100)
            yellow_density = float(np.sum(yellow_mask)) / max(1, eye_hsv.shape[0] * eye_hsv.shape[1])
            yellow_conf = float(np.clip(0.28 + yellow_density * 22.0, 0.15, 0.92))
            scores['yellow_bumps'] = yellow_conf

            # 8. eye_lesions: Peri-orbital margin erosion & irregular boundary
            scores['eye_lesions'] = float(np.clip(0.45 * scab_conf + 0.55 * nodule_conf, 0.20, 0.95))

        elif module == 'wing':
            wing_crop = np.array(rois['wing'])
            w_h, w_w = wing_crop.shape[:2]
            wing_bgr = cv2.cvtColor(wing_crop, cv2.COLOR_RGB2BGR)
            gray = cv2.cvtColor(wing_bgr, cv2.COLOR_BGR2GRAY)

            edges = cv2.Canny(gray, 40, 130)
            lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=40, minLineLength=int(w_w*0.25), maxLineGap=15)
            downward_angles = []
            if lines is not None:
                for line in lines:
                    x1, y1, x2, y2 = line[0]
                    dx, dy = x2 - x1, y2 - y1
                    if dx != 0:
                        angle_deg = np.degrees(np.arctan2(abs(dy), abs(dx)))
                        if dy > 0:
                            downward_angles.append(angle_deg)
            mean_angle = float(np.mean(downward_angles)) if downward_angles else 20.0

            # Drooping wings: downward inclination > 25°
            droop_conf = float(np.clip(0.42 + (mean_angle - 20.0) * 0.022, 0.25, 0.96))
            scores['drooping_wings'] = droop_conf

            # Severe droop: wing contour reaching lower 15% of frame
            y_pts, _ = np.where(edges > 0)
            max_y = float(np.max(y_pts)) / max(1.0, float(w_h)) if len(y_pts) > 0 else 0.5
            severe_conf = float(np.clip(0.30 + (max_y - 0.75) * 2.5, 0.15, 0.93))
            scores['severe_droop'] = severe_conf

            # Wing weakness: slack drape
            scores['wing_weakness'] = float(np.clip(0.60 * droop_conf + 0.40 * severe_conf, 0.20, 0.92))

    except Exception as e:
        print(f"[VISUAL SYMPTOMS] Notice extracting features: {e}")

    return scores



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

    # Create multi-output gradient model: model.inputs -> [target_layer.output, disease_output]
    disease_output = model.output[0] if isinstance(model.output, (list, tuple)) else model.output
    grad_model = tf.keras.models.Model(
        inputs=model.inputs,
        outputs=[target_layer.output, disease_output]
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


# ─── Model builder (Multi-task Disease + Multi-Label Symptom) ────────────────
def build_model(num_classes: int, num_symptoms: int = 0, learning_rate: float = 1e-4):
    """
    Builds MobileNetV2 architecture with:
      - Disease output head: Softmax activation (mutually exclusive disease class)
      - Symptom output head (if num_symptoms > 0): Sigmoid activation units (multi-label
        independent probabilities for co-occurring visual signs).
    """
    tf, layers, Model, MobileNetV2, _ = _load_tf()

    base = MobileNetV2(input_shape=(224, 224, 3), include_top=False, weights='imagenet')
    base.trainable = False

    x = base.output
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dropout(0.3)(x)
    shared = layers.Dense(128, activation='relu', name='shared_features')(x)
    shared = layers.Dropout(0.2)(shared)

    disease_out = layers.Dense(num_classes, activation='softmax', name='disease_output')(shared)

    if num_symptoms > 0:
        # Multi-Label Output Head (Sigmoid Activation & BinaryCrossentropy)
        symptom_out = layers.Dense(num_symptoms, activation='sigmoid', name='symptom_output')(shared)
        model = Model(inputs=base.input, outputs=[disease_out, symptom_out])
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate),
            loss={
                'disease_output': 'categorical_crossentropy',
                'symptom_output': 'binary_crossentropy'
            },
            loss_weights={
                'disease_output': 1.0,
                'symptom_output': 1.0
            },
            metrics={
                'disease_output': ['accuracy'],
                'symptom_output': ['binary_accuracy']
            }
        )
    else:
        model = Model(inputs=base.input, outputs=disease_out)
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
                    acc = round(float(logs.get('disease_output_accuracy', logs.get('accuracy', 0))) * 100, 1)
                    val_acc = round(float(logs.get('val_disease_output_accuracy', logs.get('val_accuracy', 0))) * 100, 1) if ('val_accuracy' in logs or 'val_disease_output_accuracy' in logs) else None
                    sym_acc = round(float(logs.get('symptom_output_binary_accuracy', 0)) * 100, 1) if 'symptom_output_binary_accuracy' in logs else None
                    loss = round(float(logs.get('loss', 0)), 4)
                    val_str = f" | Val Acc: {val_acc}%" if val_acc is not None else ""
                    sym_str = f" | Sym Acc: {sym_acc}%" if sym_acc is not None else ""
                    msg = f"[{outer.stage_name}] Epoch {epoch+1}/{outer.total_epochs} — Loss: {loss} | Acc: {acc}%{val_str}{sym_str}"
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
    with open(label_path, 'w', encoding='utf-8') as f:
        json.dump(label_map, f, indent=2)

    # ── Discover module symptoms and setup symptom label map ─────────────────
    module_symptoms = []
    for d in diseases:
        if 'healthy' in d['id'].lower() or d.get('severity') == 'none':
            continue
        for s in d.get('symptoms', []):
            if s not in module_symptoms and s in SYMPTOM_LABELS:
                module_symptoms.append(s)

    symptom_map = {i: sym for i, sym in enumerate(module_symptoms)}
    symptom_label_path = os.path.join(models_dir, f'symptom_labels_{module}.json')
    with open(symptom_label_path, 'w', encoding='utf-8') as f:
        json.dump(symptom_map, f, indent=2)

    annotations = load_symptom_annotations(datasets_dir, module)

    notify(18, f"Processing and augmenting images for {len(valid_classes)} classes and {len(module_symptoms)} symptom indicators...", "Preprocessing")
    all_data, all_labels, all_symptoms = [], [], []
    for cls_idx, cls_id in enumerate(valid_classes):
        cls_dir = os.path.join(datasets_dir, module, cls_id)
        d_info = next((d for d in diseases if d['id'] == cls_id), {})
        d_syms = d_info.get('symptoms', [])
        is_healthy = ('healthy' in cls_id.lower()) or (d_info.get('severity') == 'none')

        for fname in os.listdir(cls_dir):
            if not fname.lower().endswith(IMAGE_EXTS):
                continue
            try:
                img      = Image.open(os.path.join(cls_dir, fname)).convert('RGB')
                arr_base = apply_dip_pipeline(img, is_training=False)

                # Determine binary multi-label symptom vector
                s_vec = np.zeros(len(module_symptoms), dtype=np.float32)
                annotated_syms = annotations.get(fname, [])
                if annotated_syms:
                    for s in annotated_syms:
                        if s in module_symptoms:
                            s_vec[module_symptoms.index(s)] = 1.0
                elif not is_healthy:
                    # Feature-based visual estimation for unannotated images
                    vis_scores = extract_visual_symptom_features(img, module, cls_id)
                    for s_idx, s_id in enumerate(module_symptoms):
                        if s_id in d_syms and vis_scores.get(s_id, 0.0) >= 0.45:
                            s_vec[s_idx] = 1.0

                all_data.append(arr_base)
                all_labels.append(cls_idx)
                all_symptoms.append(s_vec)

                for _ in range(2):
                    arr_aug = apply_dip_pipeline(img, is_training=True)
                    all_data.append(arr_aug)
                    all_labels.append(cls_idx)
                    all_symptoms.append(s_vec)
            except Exception:
                continue

    all_data     = np.array(all_data)
    all_labels   = np.array(all_labels)
    all_symptoms = np.array(all_symptoms)

    num_classes  = len(valid_classes)
    num_symptoms = len(module_symptoms)
    one_hot      = np.zeros((len(all_labels), num_classes))
    for i, l in enumerate(all_labels):
        one_hot[i, l] = 1

    idx = np.random.permutation(len(all_data))
    all_data     = all_data[idx]
    one_hot      = one_hot[idx]
    all_symptoms = all_symptoms[idx]

    train_split = int(0.7 * len(all_data))
    val_split   = int(0.9 * len(all_data))  # 70% train, 20% val, 10% test
    X_train = all_data[:train_split]
    X_val   = all_data[train_split:val_split]
    X_test  = all_data[val_split:]

    if num_symptoms > 0:
        y_train = {'disease_output': one_hot[:train_split], 'symptom_output': all_symptoms[:train_split]}
        y_val   = {'disease_output': one_hot[train_split:val_split], 'symptom_output': all_symptoms[train_split:val_split]} if len(X_val) > 0 else None
    else:
        y_train = one_hot[:train_split]
        y_val   = one_hot[train_split:val_split] if len(X_val) > 0 else None

    y_test_disease = one_hot[val_split:]

    notify(30, f"Built dataset: {len(X_train)} training, {len(X_val)} validation, {len(X_test)} test samples.", "Model Setup")
    model, base = build_model(num_classes, num_symptoms=num_symptoms, learning_rate=learning_rate)

    # Phase 1: Transfer learning (Base frozen)
    fast_epochs = max(3, int(epochs * 0.65))
    fine_epochs = max(2, epochs - fast_epochs)

    notify(35, f"Phase 1: Training top classification layers ({fast_epochs} epochs, batch_size={batch_size})...", "Phase 1: Transfer")
    cb1 = KerasProgressCallback(35, 70, fast_epochs, "Phase 1", progress_cb).get_keras_callback()
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val) if (X_val is not None and len(X_val) > 0) else None,
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

    if num_symptoms > 0:
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate * 0.1),
            loss={'disease_output': 'categorical_crossentropy', 'symptom_output': 'binary_crossentropy'},
            loss_weights={'disease_output': 1.0, 'symptom_output': 1.0},
            metrics={'disease_output': ['accuracy'], 'symptom_output': ['binary_accuracy']}
        )
    else:
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate * 0.1),
            loss='categorical_crossentropy',
            metrics=['accuracy']
        )

    cb2 = KerasProgressCallback(70, 88, fine_epochs, "Phase 2", progress_cb).get_keras_callback()
    model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val) if (X_val is not None and len(X_val) > 0) else None,
        epochs=fine_epochs,
        batch_size=batch_size,
        callbacks=[cb2],
        verbose=0
    )

    notify(88, "Saving model weights and architecture...", "Saving")
    model_path = os.path.join(models_dir, f'gamefowl_model_{module}.h5')
    model.save(model_path)

    hist_keys = history.history.keys()
    acc_key = 'disease_output_accuracy' if 'disease_output_accuracy' in hist_keys else 'accuracy'
    val_acc_key = 'val_disease_output_accuracy' if 'val_disease_output_accuracy' in hist_keys else 'val_accuracy'
    final_acc = float(history.history[acc_key][-1])
    val_acc   = float(history.history.get(val_acc_key, [0])[-1]) if len(X_val) > 0 else None

    # ── Evaluation on unseen test set (Task 2 & Task 3) ──────────────────────
    notify(92, "Running model evaluation on test partition...", "Evaluating")
    eval_X = X_test if len(X_test) > 0 else (X_val if len(X_val) > 0 else None)
    eval_y = y_test_disease if len(X_test) > 0 else (one_hot[train_split:val_split] if len(X_val) > 0 else None)

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
        disease_eval_preds = preds_eval[0] if isinstance(preds_eval, (list, tuple)) else preds_eval
        y_pred = np.argmax(disease_eval_preds, axis=1)
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
    """Classification only — evaluates disease head and multi-label visible symptoms."""
    tf, *_ = _load_tf()

    model_path = os.path.join(models_dir, f'gamefowl_model_{module}.h5')
    label_path = os.path.join(models_dir, f'labels_{module}.json')
    symptom_label_path = os.path.join(models_dir, f'symptom_labels_{module}.json')

    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model for '{module}' module not trained yet")

    model = tf.keras.models.load_model(model_path)
    with open(label_path, 'r', encoding='utf-8') as f:
        label_map = json.load(f)

    symptom_map = {}
    if os.path.exists(symptom_label_path):
        try:
            with open(symptom_label_path, 'r', encoding='utf-8') as f:
                symptom_map = json.load(f)
        except Exception:
            symptom_map = {}

    if not symptom_map and module in MODULE_SYMPTOMS:
        symptom_map = {str(i): sym for i, sym in enumerate(MODULE_SYMPTOMS[module])}

    arr = preprocess_image(img)
    raw_preds = model.predict(arr, verbose=0)

    # Check for multi-head output: [disease_output, symptom_output]
    symptom_scores_raw = None
    if isinstance(raw_preds, (list, tuple)) and len(raw_preds) >= 2:
        preds = raw_preds[0][0]
        symptom_scores_raw = raw_preds[1][0]
    elif isinstance(raw_preds, (list, tuple)):
        preds = raw_preds[0][0]
    else:
        preds = raw_preds[0]

    entropy           = -np.sum(preds * np.log(preds + 1e-9))
    max_entropy        = np.log(len(preds))
    uncertainty_ratio  = entropy / max_entropy

    disease_lookup = {d['id']: d for d in diseases_config['diseases'] if d.get('module') == module}
    results = []
    for idx, prob in enumerate(preds):
        cls_id = label_map.get(str(idx))
        if not cls_id:
            continue
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

    # Fallback if indices had no matches in label_map
    if not results and label_map:
        for idx, (k, cls_id) in enumerate(label_map.items()):
            prob = preds[idx] if idx < len(preds) else 0.0
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

    # Re-normalize confidences among valid classes
    total_conf = sum(r['confidence'] for r in results)
    if total_conf > 0:
        for r in results:
            r['confidence'] = round((r['confidence'] / total_conf) * 100, 2)

    results.sort(key=lambda x: x['confidence'], reverse=True)
    top_pred = results[0]
    top_disease_id = top_pred['disease_id']

    # ── Multi-label Dynamic Visible Symptom Detection ──────────────────────────
    is_healthy = ('healthy' in top_disease_id.lower()) or (top_pred.get('severity') == 'none')
    detected_symptoms = []

    if not is_healthy:
        # Extract visual symptoms via computer vision feature analysis
        vis_scores = extract_visual_symptom_features(img, module, top_disease_id)

        # Candidate symptoms for the diagnosed condition
        candidate_symptoms = top_pred.get('symptoms', [])
        all_candidate_syms = list(dict.fromkeys(candidate_symptoms + MODULE_SYMPTOMS.get(module, [])))

        symptom_probs = {}
        for s_idx_str, s_id in symptom_map.items():
            if s_id not in all_candidate_syms:
                continue
            idx = int(s_idx_str)
            if symptom_scores_raw is not None and idx < len(symptom_scores_raw):
                model_sigmoid = float(symptom_scores_raw[idx])
                vis_score = vis_scores.get(s_id, model_sigmoid)
                combined = 0.65 * model_sigmoid + 0.35 * vis_score
            else:
                combined = vis_scores.get(s_id, 0.35)

            # Weight calibrated against top disease confidence
            if s_id in candidate_symptoms:
                calibrated = float(np.clip(combined * (0.6 + 0.4 * (top_pred['confidence'] / 100.0)), 0.05, 0.99))
            else:
                calibrated = float(np.clip(combined * 0.4, 0.0, 0.48))

            symptom_probs[s_id] = calibrated

        for s_id in candidate_symptoms:
            if s_id not in symptom_probs:
                v_score = vis_scores.get(s_id, 0.35)
                symptom_probs[s_id] = float(np.clip(v_score * (0.6 + 0.4 * (top_pred['confidence'] / 100.0)), 0.05, 0.99))

        # Filter symptoms using confidence threshold (>= 0.50)
        # Only symptoms actually visible in that specific chicken's photo appear!
        for s_id, s_prob in symptom_probs.items():
            conf_pct = round(s_prob * 100.0, 1)
            if s_prob >= SYMPTOM_THRESHOLD:
                detected_symptoms.append({
                    "id": s_id,
                    "label": SYMPTOM_LABELS.get(s_id, s_id.replace('_', ' ').title()),
                    "confidence": conf_pct
                })

        detected_symptoms.sort(key=lambda s: s['confidence'], reverse=True)

        # Fallback guarantee: if disease confidence >= 65% but no symptom passed 50%,
        # present the most prominent visible symptom above 38%
        if not detected_symptoms and symptom_probs and top_pred['confidence'] >= 65.0:
            best_s_id = max(symptom_probs, key=symptom_probs.get)
            if symptom_probs[best_s_id] >= 0.38:
                detected_symptoms.append({
                    "id": best_s_id,
                    "label": SYMPTOM_LABELS.get(best_s_id, best_s_id.replace('_', ' ').title()),
                    "confidence": round(symptom_probs[best_s_id] * 100.0, 1)
                })

    return {
        "module":            module,
        "uncertainty_ratio": float(uncertainty_ratio),
        "top_prediction":    results[0],
        "all_predictions":   results,
        "detected_symptoms": detected_symptoms,
    }


def _rejection(reason: str, module: str, message: str | None = None, all_predictions=None) -> dict:
    return {
        "rejected":              True,
        "rejection_reason":      reason,
        "message":               message or reason,
        "disease_name":          None,
        "confidence":            0.0,
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
    detected_symptoms = cls.get('detected_symptoms', [])

    # Alert threshold: if top confidence >= 80% AND disease detected (not healthy)
    is_disease = (top.get('severity') != 'none') and ('healthy' not in top.get('disease_id', '').lower())
    high_confidence_alert = bool(top['confidence'] >= 80.0 and is_disease)

    return {
        "rejected":              False,
        "module":                module,
        "disease_name":          top['disease_name'],
        "confidence":            top['confidence'],
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
    if module == 'eye':
        roi_target = rois['head']
    elif module == 'wing':
        roi_target = rois['wing']
    elif module in ('comb', 'head', 'beak', 'face'):
        roi_target = rois.get('head', rois['full'])
    else:
        roi_target = rois.get(module, rois['full'])
    candidates.append(_classify(roi_target, models_dir, diseases_config, module))
    candidates.append(_classify(rois['full'], models_dir, diseases_config, module))

    cls = max(candidates, key=lambda c: c['top_prediction']['confidence'])

    # Check anatomical prominence to detect module mismatch and improve accuracy
    hsv_roi = cv2.cvtColor(img_cv, cv2.COLOR_BGR2HSV)
    comb_mask = ((hsv_roi[:, :, 0] < 15) | (hsv_roi[:, :, 0] > 165)) & (hsv_roi[:, :, 1] > 60) & (hsv_roi[:, :, 2] > 50)
    comb_ratio = float(comb_mask.mean())

    detected_module = module
    module_mismatch = False
    module_notice = None


    if cls['uncertainty_ratio'] > 0.88:
        return _rejection(
            f"Model too uncertain (entropy={cls['uncertainty_ratio']:.2f})", detected_module,
            message="Image unclear or outside diagnostic scope. Try better lighting or a closer angle focusing strictly on the " + detected_module + "."
        )

    top = cls['top_prediction']
    preds_list = cls.get('all_predictions', [])
    margin = (preds_list[0]['confidence'] - preds_list[1]['confidence']) if len(preds_list) > 1 else 100.0

    # Detection threshold & scope validation
    if top['confidence'] < 52.0 or (top['confidence'] < 60.0 and margin < 8.0):
        return _rejection(
            f"Confidence too low ({top['confidence']}%)", detected_module,
            message=f"Detection confidence too low ({top['confidence']}%). Could not reliably diagnose within our verified disease scope for {detected_module}. Try a clearer photo focusing on the {detected_module}.",
            all_predictions=cls['all_predictions']
        )

    res = _build_success(cls, detected_module)
    res['module_mismatch'] = module_mismatch
    res['original_module'] = module
    res['detected_module'] = detected_module
    res['module_notice'] = module_notice

    # Attach Grad-CAM heatmap visualization
    try:
        model_path = os.path.join(models_dir, f'gamefowl_model_{detected_module}.h5')
        if os.path.exists(model_path):
            tf, *_ = _load_tf()
            loaded_model = tf.keras.models.load_model(model_path)
            res['gradcam_image'] = generate_gradcam(img, loaded_model)
    except Exception as e:
        print(f"Grad-CAM generation notice: {e}")
        res['gradcam_image'] = None

    return res


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

    # Attach Grad-CAM heatmap visualization
    try:
        chosen_module = chosen['module']
        model_path = os.path.join(models_dir, f'gamefowl_model_{chosen_module}.h5')
        if os.path.exists(model_path):
            tf, *_ = _load_tf()
            loaded_model = tf.keras.models.load_model(model_path)
            result['gradcam_image'] = generate_gradcam(img, loaded_model)
    except Exception as e:
        print(f"Grad-CAM generation notice: {e}")
        result['gradcam_image'] = None

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
    NON_POULTRY_LABELS = {
        'mouse', 'keyboard', 'space_bar', 'cellular_telephone', 'dial_telephone', 'telephone',
        'ipod', 'modem', 'printer', 'remote_control', 'desk', 'dining_table', 'table_lamp',
        'coffee_table', 'chair', 'folding_chair', 'rocking_chair', 'bookcase', 'binder',
        'envelope', 'packet', 'carton', 'box', 'coffee_mug', 'cup', 'water_bottle', 'pill_bottle',
        'car', 'automobile', 'minivan', 'truck', 'bicycle', 'motorcycle', 'wardrobe',
        'tabby', 'tiger_cat', 'persian_cat', 'siamese_cat', 'egyptian_cat', 'cat',
        'golden_retriever', 'labrador_retriever', 'german_shepherd', 'beagle', 'dog',
        'horse', 'hog', 'pig', 'cow', 'ox', 'sheep', 'goat', 'rabbit'
    }

    def norm(lbl): return lbl.lower().replace(' ', '_').replace('-', '_')

    strict_score = sum(float(p) for _, lbl, p in decoded if norm(lbl) in STRICT_CHICKEN)
    broad_score  = sum(float(p) for _, lbl, p in decoded if norm(lbl) in BROAD_BIRD)
    human_score  = sum(float(p) for _, lbl, p in decoded[:3] if norm(lbl) in HUMAN_LABELS)
    screen_score = sum(float(p) for _, lbl, p in decoded[:5] if norm(lbl) in SCREEN_LABELS)
    cage_score   = sum(float(p) for _, lbl, p in decoded[:5] if norm(lbl) in POULTRY_ENV_LABELS)
    non_poultry_score = sum(float(p) for _, lbl, p in decoded[:5] if norm(lbl) in NON_POULTRY_LABELS)

    top_labels = ', '.join(f"{lbl}({p:.0%})" for _, lbl, p in decoded[:3])
    top_label_norm = norm(decoded[0][1]) if decoded else ''

    # ── Texture & Color Analysis ──────────────────────────────────────────────
    feather_score = _feather_texture_score(img_enhanced)
    color_score   = _gamefowl_color_score(img_enhanced)

    # ── Strict rejection: Laptop / Screen / Non-Chicken Everyday Objects ──────
    # If the camera is aimed at a laptop, monitor, keyboard, desk, or domestic pet:
    # Do NOT pass it into disease classification! Reject immediately.
    if screen_score >= 0.10 or top_label_norm in SCREEN_LABELS:
        if strict_score < 0.15 and broad_score < 0.15:
            return False, 0.0, f"Laptop/screen detected ({top_labels}). Please photograph an actual live gamefowl."

    if non_poultry_score >= 0.20 or top_label_norm in NON_POULTRY_LABELS:
        if strict_score < 0.12 and broad_score < 0.12:
            return False, 0.0, f"Non-chicken object detected ({top_labels}). Please photograph a gamefowl."

    # ── Reject: human face/body (unless clear chicken in frame) ───────────────
    if human_score >= 0.25 and strict_score < 0.08:
        return False, 0.0, f"Human detected ({top_labels})"

    # ── Accept: strict chicken ────────────────────────────────────────────────
    if strict_score >= 0.05:
        return True, strict_score, f"Chicken confirmed (score={strict_score:.2f})"

    # ── Accept: broad bird + texture heuristic ────────────────────────────────
    if broad_score >= 0.08 and feather_score > 0.28:
        return True, broad_score, f"Bird/fowl + feather texture (bird={broad_score:.2f}, feather={feather_score:.2f})"

    # ── Chicken inside cage/coop ──────────────────────────────────────────────
    # Cage/crate wire detected around chicken — accept if plumage/bird features exist
    if cage_score >= 0.08:
        if strict_score >= 0.03 or broad_score >= 0.05 or (feather_score > 0.35 and color_score > 0.25):
            return True, max(strict_score, broad_score, feather_score), f"Caged chicken confirmed (cage={cage_score:.2f}, feather={feather_score:.2f})"

    # ── Stage 2 fallback: pure texture + color heuristic ─────────────────────
    # Only allowed if NOT recognized as an inanimate object or screen
    if screen_score < 0.05 and non_poultry_score < 0.10 and human_score < 0.15:
        combined = feather_score * 0.6 + color_score * 0.4
        if combined > 0.45 and feather_score > 0.38 and color_score > 0.30:
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
