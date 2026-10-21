"""
Clucko Gamefowl AI - Detection and Diagnostics Routes
Defines POST /api/detect and POST /api/gradcam
Features:
  - Multi-label dynamic visible symptom detection
  - Multi-module support ('eye', 'wing', 'auto')
  - Grad-CAM visual heatmaps
  - Statutory veterinary disclaimer (Philippine RA 9286)
"""

import os
import io
import json
import base64
import traceback
import numpy as np
from PIL import Image
from flask import request, jsonify

from app import app, MODELS_DIR, load_diseases, get_valid_module_ids
from model_trainer import (
    predict,
    predict_auto,
    generate_gradcam,
    preprocess_image,
    SYMPTOM_LABELS,
    MODULE_SYMPTOMS
)

LEGAL_DISCLAIMER_TEXT = (
    "Clucko AI provides automated screening estimates for poultry flock decision support. "
    "It does not provide clinical veterinary diagnoses under the Philippine Veterinary Medicine Act "
    "(RA 9286). Consult a licensed veterinarian."
)


# ─── Dynamic Visible Symptom Detection API ─────────────────────────────────────
@app.route('/api/detect', methods=['POST'])
def detect():
    """
    POST /api/detect
    Payload: { "image": "<base64_string>", "module": "eye" | "wing" | "auto" }
    Returns:
      {
        "disease_name": "Infectious Coryza",
        "confidence": 94.2,
        "detected_symptoms": [
          { "id": "swollen_eyes", "label": "Swollen Eyes", "confidence": 91.5 },
          { "id": "watery_eyes", "label": "Watery Eye Discharge", "confidence": 84.0 }
        ],
        "top_prediction": { ... },
        "all_predictions": [ ... ],
        "legal_disclaimer": "..."
      }
    """
    data = request.json or {}
    image_b64 = data.get('image')
    module    = data.get('module', 'auto')

    if not image_b64:
        return jsonify({"error": "No image provided"}), 400

    try:
        if ',' in image_b64:
            image_b64 = image_b64.split(',')[1]
        raw_bytes = base64.b64decode(image_b64)
        img = Image.open(io.BytesIO(raw_bytes)).convert('RGB')
    except Exception:
        return jsonify({"error": "Invalid base64 encoding or corrupted image data"}), 400

    valid_modules = get_valid_module_ids()
    if module not in valid_modules and module != 'auto':
        return jsonify({"error": f"module must be one of {valid_modules} or 'auto'"}), 400

    try:
        diseases_config = load_diseases()

        if module == 'auto':
            pred_result = predict_auto(img, MODELS_DIR, diseases_config)
        else:
            pred_result = predict(img, MODELS_DIR, diseases_config, module)

        if not isinstance(pred_result, dict):
            pred_result = {"rejected": True, "message": "Unknown detection output"}

        # Format and guarantee the top-level API contract:
        # disease_name, confidence, detected_symptoms
        top = pred_result.get('top_prediction') or {}
        disease_name = top.get('disease_name') or pred_result.get('flagged_disease') or 'Healthy'
        confidence   = top.get('confidence') or 0.0

        # Ensure detected_symptoms conforms to array of {id, label, confidence}
        raw_symptoms = pred_result.get('detected_symptoms', [])
        formatted_symptoms = []
        for s in raw_symptoms:
            if isinstance(s, dict):
                s_id = s.get('id', '')
                s_label = s.get('label') or SYMPTOM_LABELS.get(s_id, s_id.replace('_', ' ').title())
                s_conf = s.get('confidence', confidence)
                formatted_symptoms.append({
                    "id": s_id,
                    "label": s_label,
                    "confidence": round(float(s_conf), 1)
                })
            elif isinstance(s, str):
                formatted_symptoms.append({
                    "id": s,
                    "label": SYMPTOM_LABELS.get(s, s.replace('_', ' ').title()),
                    "confidence": round(float(confidence), 1)
                })

        pred_result['disease_name']      = disease_name
        pred_result['confidence']        = round(float(confidence), 1)
        pred_result['detected_symptoms'] = formatted_symptoms
        pred_result['legal_disclaimer']  = LEGAL_DISCLAIMER_TEXT

        return jsonify(pred_result)

    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Model detection error occurred"}), 500


# ─── Grad-CAM (Module-aware) ──────────────────────────────────────────────────
@app.route('/api/gradcam', methods=['POST'])
def gradcam():
    """
    POST /api/gradcam
    Payload: { "image": "<base64_string>", "module": "eye" | "wing" }
    """
    data = request.json or {}
    image_b64 = data.get('image')
    module    = data.get('module', 'eye')

    if not image_b64:
        return jsonify({"error": "No image provided"}), 400
    valid_modules = get_valid_module_ids()
    if module not in valid_modules:
        return jsonify({"error": f"module must be one of {valid_modules}"}), 400

    model_path = os.path.join(MODELS_DIR, f'gamefowl_model_{module}.h5')
    label_path = os.path.join(MODELS_DIR, f'labels_{module}.json')

    if not os.path.exists(model_path) or not os.path.exists(label_path):
        return jsonify({"error": f"Model for '{module}' module not trained yet"}), 400

    try:
        if ',' in image_b64:
            image_b64 = image_b64.split(',')[1]
        raw_bytes = base64.b64decode(image_b64)
        img = Image.open(io.BytesIO(raw_bytes)).convert('RGB')
    except Exception:
        return jsonify({"error": "Invalid base64 encoding or corrupted image data"}), 400

    try:
        import tensorflow as tf
        model = tf.keras.models.load_model(model_path)
        with open(label_path, 'r', encoding='utf-8') as f:
            label_map = json.load(f)

        arr = preprocess_image(img)
        preds_raw = model.predict(arr, verbose=0)
        preds = preds_raw[0] if isinstance(preds_raw, (list, tuple)) else preds_raw
        if len(preds.shape) > 1:
            preds = preds[0]

        top_idx = int(np.argmax(preds))
        confidence = round(float(preds[top_idx]) * 100, 2)
        pred_class_id = label_map.get(str(top_idx), str(top_idx))

        diseases = load_diseases().get('diseases', [])
        d_info = next((d for d in diseases if d['id'] == pred_class_id), {})
        pred_class_name = d_info.get('name', pred_class_id.replace('_', ' ').title())

        gradcam_image = generate_gradcam(img, model)

        return jsonify({
            "gradcam_image": gradcam_image,
            "predicted_class": pred_class_name,
            "confidence": confidence
        })
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ─── Symptoms Catalog ─────────────────────────────────────────────────────────
@app.route('/api/detect/symptoms', methods=['GET'])
def get_symptom_catalog():
    """Returns all registered symptom visual tags grouped by module."""
    catalog = {}
    for mod, syms in MODULE_SYMPTOMS.items():
        catalog[mod] = [
            {"id": s, "label": SYMPTOM_LABELS.get(s, s.replace('_', ' ').title())}
            for s in syms
        ]
    return jsonify({
        "modules": catalog,
        "all_symptoms": {k: SYMPTOM_LABELS.get(k, k.replace('_', ' ').title()) for k in SYMPTOM_LABELS}
    })
