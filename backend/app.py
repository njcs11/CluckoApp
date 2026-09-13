from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from db import get_db, token_required, SECRET_KEY, DB_CONFIG
import os
import json
import base64
import numpy as np
from PIL import Image
import io
import traceback
import threading
import time
import datetime
import tempfile
import cv2
from werkzeug.utils import secure_filename

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except Exception as e:
    print(f"Warning: pillow_heif could not be registered: {e}")

app = Flask(__name__)

# ─── CORS ─────────────────────────────────────────────────────────────────────
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

DATASETS_DIR = os.path.join(os.path.dirname(__file__), 'datasets')
MODELS_DIR   = os.path.join(os.path.dirname(__file__), 'models')
DISEASES_CONFIG = os.path.join(os.path.dirname(__file__), 'diseases.json')

os.makedirs(DATASETS_DIR, exist_ok=True)
os.makedirs(MODELS_DIR,   exist_ok=True)

def convert_existing_heic():
    """Converts any remaining .heic/.heif files in the datasets directory to standard .jpg."""
    try:
        count = 0
        for root, _, files in os.walk(DATASETS_DIR):
            for file in files:
                if file.lower().endswith(('.heic', '.heif')):
                    src = os.path.join(root, file)
                    base, _ = os.path.splitext(src)
                    dst = f"{base}.jpg"
                    try:
                        im = Image.open(src).convert('RGB')
                        im.save(dst, 'JPEG', quality=95)
                        os.remove(src)
                        count += 1
                        print(f"[HEIC MIGRATION] Converted {file} -> {os.path.basename(dst)}")
                    except Exception as err:
                        print(f"[HEIC MIGRATION] Error converting {file}: {err}")
        if count > 0:
            print(f"[HEIC MIGRATION] Converted {count} HEIC file(s) to JPG.")
    except Exception as err:
        print(f"[HEIC MIGRATION] Scan error: {err}")

convert_existing_heic()

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok', 'message': 'Clucko backend is running'})


def load_diseases():
    if os.path.exists(DISEASES_CONFIG):
        with open(DISEASES_CONFIG, 'r') as f:
            return json.load(f)
    default = {"diseases": [
        {"id":"infectious_coryza","name":"Infectious Coryza","description":"Bacterial respiratory disease","symptoms":["watery_eyes","swollen_eyes","nasal_discharge","facial_swelling"],"affected_parts":["eye"],"severity":"moderate","color":"#f59e0b"},
        {"id":"fowl_pox","name":"Fowl Pox","description":"Viral disease causing lesions","symptoms":["eye_lesions","cloudy_eye","skin_lesions","scabs"],"affected_parts":["eye","skin"],"severity":"high","color":"#ef4444"},
        {"id":"newcastle_disease","name":"Newcastle Disease","description":"Highly contagious viral disease","symptoms":["drooping_wings","severe_droop","wing_weakness","twisted_neck"],"affected_parts":["wing","posture"],"severity":"critical","color":"#dc2626"},
        {"id":"healthy","name":"Healthy","description":"No disease detected","symptoms":["normal_eye","normal_posture","symmetrical_wings"],"affected_parts":["all"],"severity":"none","color":"#10b981"}
    ]}
    save_diseases(default)
    return default

def save_diseases(data):
    with open(DISEASES_CONFIG, 'w') as f:
        json.dump(data, f, indent=2)

@app.route('/api/diseases', methods=['GET'])
def get_diseases():
    return jsonify(load_diseases())

@app.route('/api/diseases', methods=['POST'])
def add_disease():
    data = request.json or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({"error": "Disease name is required"}), 400

    diseases = load_diseases()
    # Explicit custom disease_id or cleanly normalized
    raw_id = data.get('id') or name.lower().replace(' ', '_').replace('-', '_')
    disease_id = ''.join(c for c in raw_id if c.isalnum() or c == '_')
    if not disease_id:
        disease_id = f"disease_{int(time.time())}"

    # Explicit module: 'eye' or 'wing'
    module = data.get('module')
    if not module:
        affected = [p.lower() for p in data.get('affected_parts', [])]
        if any(p in affected for p in ('wing', 'posture')):
            module = 'wing'
        else:
            module = 'eye'
    if module not in ('eye', 'wing'):
        module = 'eye'

    new_disease = {
        "id": disease_id,
        "name": name,
        "description": data.get('description', ''),
        "symptoms": data.get('symptoms', []),
        "affected_parts": data.get('affected_parts', [module]),
        "module": module,
        "severity": data.get('severity', 'moderate'),
        "color": data.get('color', '#6366f1')
    }

    # Check for duplicate ID
    for d in diseases['diseases']:
        if d['id'] == disease_id:
            return jsonify({"error": f"Disease with ID '{disease_id}' already exists."}), 400

    diseases['diseases'].append(new_disease)
    save_diseases(diseases)

    # Ensure dataset directory exists under the proper module folder
    target_dir = os.path.join(DATASETS_DIR, module, disease_id)
    os.makedirs(target_dir, exist_ok=True)

    return jsonify({"success": True, "disease": new_disease})

@app.route('/api/diseases/<disease_id>', methods=['DELETE'])
def delete_disease(disease_id):
    diseases = load_diseases()
    diseases['diseases'] = [d for d in diseases['diseases'] if d['id'] != disease_id]
    save_diseases(diseases)
    return jsonify({"success": True})

IMAGE_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.bmp', '.webp', '.heic', '.heif')
VIDEO_EXTENSIONS = ('.mov', '.mp4', '.avi', '.mkv', '.webm', '.m4v')

def format_file_size(size_bytes):
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"

def extract_video_frames(video_path, target_dir, base_name, frame_interval_sec=0.5, max_frames=50):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return 0
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    step = max(1, int(fps * frame_interval_sec))
    frame_idx = 0
    saved_count = 0
    ts = int(time.time())

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % step == 0:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            im = Image.fromarray(rgb)
            fname = f"{base_name}_{ts}_f{saved_count + 1}.jpg"
            out_path = os.path.join(target_dir, fname)
            im.save(out_path, 'JPEG', quality=92)
            saved_count += 1
            if saved_count >= max_frames:
                break
        frame_idx += 1
    cap.release()
    return saved_count

# ─── Dataset upload (HEIC & Video Frame Extraction Support) ─────────────────────
@app.route('/api/dataset/upload', methods=['POST'])
def upload_dataset():
    disease_id = request.form.get('disease_id')
    module     = request.form.get('module')  # 'eye' or 'wing'
    frame_interval = float(request.form.get('frame_interval', 0.5))
    max_video_frames = int(request.form.get('max_video_frames', 50))

    if not disease_id or not module:
        return jsonify({"error": "disease_id and module required"}), 400
    disease_dir = os.path.join(DATASETS_DIR, module, disease_id)
    os.makedirs(disease_dir, exist_ok=True)

    files = request.files.getlist('images') or request.files.getlist('files')
    saved = 0
    video_frames_total = 0

    for f in files:
        if not f or not f.filename:
            continue
        orig_name = secure_filename(f.filename) or f"upload_{int(time.time())}"
        base, ext = os.path.splitext(orig_name)
        ext_lower = ext.lower()

        if ext_lower in VIDEO_EXTENSIONS:
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext_lower) as tmp:
                f.save(tmp.name)
                tmp_path = tmp.name
            try:
                frames_extracted = extract_video_frames(
                    tmp_path, disease_dir, base,
                    frame_interval_sec=frame_interval,
                    max_frames=max_video_frames
                )
                video_frames_total += frames_extracted
                saved += frames_extracted
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
        elif ext_lower in ('.heic', '.heif'):
            try:
                im = Image.open(f).convert('RGB')
                out_name = f"{saved}_{base}_{int(time.time())}.jpg"
                im.save(os.path.join(disease_dir, out_name), 'JPEG', quality=95)
                saved += 1
            except Exception as e:
                print(f"Error converting uploaded HEIC: {e}")
        elif ext_lower in IMAGE_EXTENSIONS:
            try:
                im = Image.open(f).convert('RGB')
                out_name = f"{saved}_{base}_{int(time.time())}.jpg"
                im.save(os.path.join(disease_dir, out_name), 'JPEG', quality=95)
                saved += 1
            except Exception:
                out_name = f"{saved}_{orig_name}"
                f.save(os.path.join(disease_dir, out_name))
                saved += 1

    return jsonify({
        "success": True,
        "saved": saved,
        "video_frames": video_frames_total,
        "module": module,
        "disease_id": disease_id
    })


@app.route('/api/dataset/stats', methods=['GET'])
def dataset_stats():
    stats = {}
    for disease in load_diseases()['diseases']:
        module = disease.get('module', 'eye')
        d = os.path.join(DATASETS_DIR, module, disease['id'])
        stats[disease['id']] = len([f for f in os.listdir(d) if f.lower().endswith(IMAGE_EXTENSIONS)]) if os.path.exists(d) else 0
    return jsonify(stats)


import urllib.parse

def get_safe_file_path(base_dir, module, disease_id, filename):
    """Safely resolves and validates a file path within the specified class directory, preventing path traversal."""
    if not filename:
        return None
    # Strip any directory components passed in filename
    clean_filename = os.path.basename(filename)
    if not clean_filename or clean_filename in ('.', '..'):
        return None
    expected_dir = os.path.abspath(os.path.join(base_dir, module, disease_id))
    full_path = os.path.abspath(os.path.join(expected_dir, clean_filename))
    if not full_path.startswith(expected_dir + os.sep) and full_path != expected_dir:
        return None
    return full_path

# ─── Dataset Explorer & Deletion Endpoints ────────────────────────────────────
@app.route('/api/dataset/images', methods=['GET'])
def get_dataset_images():
    module = request.args.get('module', 'eye')
    disease_id = request.args.get('disease_id')
    if not disease_id:
        return jsonify({"error": "disease_id is required"}), 400

    disease_dir = os.path.join(DATASETS_DIR, module, disease_id)
    if not os.path.exists(disease_dir):
        return jsonify({"images": [], "total": 0, "disease_id": disease_id, "module": module})

    images = []
    for fname in os.listdir(disease_dir):
        if fname.lower().endswith(IMAGE_EXTENSIONS):
            fpath = os.path.join(disease_dir, fname)
            try:
                st = os.stat(fpath)
                quoted_name = urllib.parse.quote(fname)
                images.append({
                    "filename": fname,
                    "size_bytes": st.st_size,
                    "size_formatted": format_file_size(st.st_size),
                    "modified": time.strftime("%Y-%m-%d %H:%M", time.localtime(st.st_mtime)),
                    "url": f"/api/dataset/image/{module}/{disease_id}/{quoted_name}"
                })
            except Exception:
                continue
    images.sort(key=lambda x: x["filename"])
    return jsonify({
        "images": images,
        "total": len(images),
        "disease_id": disease_id,
        "module": module
    })


@app.route('/api/dataset/image/<module>/<disease_id>/<path:filename>', methods=['GET'])
def serve_dataset_image(module, disease_id, filename):
    # Unquote filename in case it was percent-encoded in the URL
    raw_filename = urllib.parse.unquote(filename)
    safe_path = get_safe_file_path(DATASETS_DIR, module, disease_id, raw_filename)
    if not safe_path or not os.path.exists(safe_path):
        return jsonify({"error": f"Image '{raw_filename}' not found"}), 404
    folder = os.path.dirname(safe_path)
    base_name = os.path.basename(safe_path)
    return send_from_directory(folder, base_name)


@app.route('/api/dataset/image', methods=['DELETE'])
def delete_dataset_image():
    data = request.json or {}
    module = data.get('module')
    disease_id = data.get('disease_id')
    filename = data.get('filename')

    if not module or not disease_id or not filename:
        return jsonify({"error": "module, disease_id, and filename are required"}), 400

    raw_filename = urllib.parse.unquote(filename)
    file_path = get_safe_file_path(DATASETS_DIR, module, disease_id, raw_filename)

    if not file_path or not os.path.exists(file_path):
        return jsonify({"error": f"File '{raw_filename}' not found"}), 404

    try:
        os.remove(file_path)
        folder = os.path.join(DATASETS_DIR, module, disease_id)
        remaining = len([f for f in os.listdir(folder) if f.lower().endswith(IMAGE_EXTENSIONS)]) if os.path.exists(folder) else 0
        return jsonify({"success": True, "deleted": raw_filename, "remaining": remaining})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/dataset/delete-bulk', methods=['POST'])
def delete_bulk_dataset_images():
    data = request.json or {}
    module = data.get('module')
    disease_id = data.get('disease_id')
    filenames = data.get('filenames', [])

    if not module or not disease_id or not filenames:
        return jsonify({"error": "module, disease_id, and filenames are required"}), 400

    deleted_count = 0
    folder = os.path.join(DATASETS_DIR, module, disease_id)
    for fname in filenames:
        raw_fname = urllib.parse.unquote(fname)
        file_path = get_safe_file_path(DATASETS_DIR, module, disease_id, raw_fname)
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
                deleted_count += 1
            except Exception:
                pass

    remaining = len([f for f in os.listdir(folder) if f.lower().endswith(IMAGE_EXTENSIONS)]) if os.path.exists(folder) else 0
    return jsonify({"success": True, "deleted_count": deleted_count, "remaining": remaining})


# ─── Background Model Training Architecture ──────────────────────────────────
training_state = {
    "eye": {
        "status": "idle",
        "progress": 0,
        "stage": "Idle",
        "message": "",
        "logs": [],
        "result": None,
        "error": None
    },
    "wing": {
        "status": "idle",
        "progress": 0,
        "stage": "Idle",
        "message": "",
        "logs": [],
        "result": None,
        "error": None
    }
}

def execute_training(module, epochs, batch_size, learning_rate):
    state = training_state[module]
    state["status"] = "running"
    state["progress"] = 0
    state["stage"] = "Initializing"
    state["message"] = f"Training {module} model (epochs={epochs}, batch={batch_size}, lr={learning_rate})..."
    state["logs"] = [f"[{time.strftime('%H:%M:%S')}] Started {module} model training in background."]
    state["result"] = None
    state["error"] = None

    def progress_cb(pct, msg, stage="Training"):
        state["progress"] = pct
        state["stage"] = stage
        state["message"] = msg
        state["logs"].insert(0, f"[{time.strftime('%H:%M:%S')}] {msg}")
        if len(state["logs"]) > 250:
            state["logs"].pop()

    try:
        from model_trainer import train
        res = train(
            DATASETS_DIR,
            MODELS_DIR,
            load_diseases(),
            module,
            epochs=epochs,
            batch_size=batch_size,
            learning_rate=learning_rate,
            progress_cb=progress_cb
        )
        if res.get("success"):
            state["status"] = "completed"
            state["result"] = res
            state["progress"] = 100
            state["stage"] = "Completed"
            state["message"] = f"Training completed successfully! Accuracy: {res.get('train_accuracy')}%"
            state["logs"].insert(0, f"[{time.strftime('%H:%M:%S')}] {state['message']}")
        else:
            state["status"] = "failed"
            state["error"] = res.get("error", "Training failed")
            state["stage"] = "Failed"
            state["message"] = state["error"]
            state["logs"].insert(0, f"[{time.strftime('%H:%M:%S')}] ERROR: {state['error']}")
    except Exception as e:
        traceback.print_exc()
        state["status"] = "failed"
        state["error"] = str(e)
        state["stage"] = "Failed"
        state["message"] = str(e)
        state["logs"].insert(0, f"[{time.strftime('%H:%M:%S')}] EXCEPTION: {str(e)}")


@app.route('/api/train', methods=['POST'])
def train_model():
    data = request.json or {}
    module = data.get('module') or request.args.get('module')
    if module not in ('eye', 'wing'):
        return jsonify({"error": "module must be 'eye' or 'wing'"}), 400

    if training_state[module]["status"] == "running":
        return jsonify({"error": f"{module.title()} model training is already in progress.", "status": "running"}), 400

    epochs = int(data.get('epochs', 10))
    batch_size = int(data.get('batch_size', 16))
    learning_rate = float(data.get('learning_rate', 1e-4))

    t = threading.Thread(target=execute_training, args=(module, epochs, batch_size, learning_rate), daemon=True)
    t.start()

    return jsonify({
        "success": True,
        "message": f"{module.title()} model training started in the background",
        "module": module,
        "hyperparameters": {"epochs": epochs, "batch_size": batch_size, "learning_rate": learning_rate}
    })


@app.route('/api/train/status', methods=['GET'])
def get_train_status():
    module = request.args.get('module')
    if module and module in training_state:
        return jsonify(training_state[module])
    return jsonify(training_state)


@app.route('/api/train/reset', methods=['POST'])
def reset_train_status():
    data = request.json or {}
    module = data.get('module')
    if module and module in training_state:
        if training_state[module]["status"] != "running":
            training_state[module]["status"] = "idle"
            training_state[module]["progress"] = 0
            training_state[module]["stage"] = "Idle"
            training_state[module]["message"] = ""
            training_state[module]["result"] = None
            training_state[module]["error"] = None
    return jsonify({"success": True, "state": training_state})


# ─── Model status (both modules) ───────────────────────────────────────────────
@app.route('/api/model/status', methods=['GET'])
def model_status():
    result = {}
    for module in ('eye', 'wing'):
        mp = os.path.join(MODELS_DIR, f'gamefowl_model_{module}.h5')
        lp = os.path.join(MODELS_DIR, f'labels_{module}.json')
        if os.path.exists(mp) and os.path.exists(lp):
            result[module] = {"trained": True, "classes": json.load(open(lp))}
        else:
            result[module] = {"trained": False}
    return jsonify(result)


# ─── Detect (module-aware) ─────────────────────────────────────────────────────
@app.route('/api/detect', methods=['POST'])
def detect():
    try:
        from model_trainer import predict, predict_auto
        data = request.json
        image_b64 = data.get('image')
        module    = data.get('module', 'auto')  # 'auto' checks both eye + wing models

        if not image_b64:
            return jsonify({"error": "No image provided"}), 400
        if ',' in image_b64:
            image_b64 = image_b64.split(',')[1]
        img = Image.open(io.BytesIO(base64.b64decode(image_b64))).convert('RGB')

        if module == 'auto':
            return jsonify(predict_auto(img, MODELS_DIR, load_diseases()))

        if module not in ('eye', 'wing'):
            return jsonify({"error": "module must be 'eye', 'wing', or 'auto'"}), 400
        return jsonify(predict(img, MODELS_DIR, load_diseases(), module))
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ─── Grad-CAM (module-aware) ──────────────────────────────────────────────────
@app.route('/api/gradcam', methods=['POST'])
def gradcam():
    try:
        from model_trainer import _load_tf, generate_gradcam, preprocess_image
        data = request.json or {}
        image_b64 = data.get('image')
        module    = data.get('module', 'eye')

        if not image_b64:
            return jsonify({"error": "No image provided"}), 400
        if module not in ('eye', 'wing'):
            return jsonify({"error": "module must be 'eye' or 'wing'"}), 400

        model_path = os.path.join(MODELS_DIR, f'gamefowl_model_{module}.h5')
        label_path = os.path.join(MODELS_DIR, f'labels_{module}.json')

        if not os.path.exists(model_path) or not os.path.exists(label_path):
            return jsonify({"error": f"Model for '{module}' module not trained yet"}), 400

        if ',' in image_b64:
            image_b64 = image_b64.split(',')[1]
        img = Image.open(io.BytesIO(base64.b64decode(image_b64))).convert('RGB')

        tf, *_ = _load_tf()
        model = tf.keras.models.load_model(model_path)
        with open(label_path, 'r') as f:
            label_map = json.load(f)

        arr = preprocess_image(img)
        preds = model.predict(arr, verbose=0)[0]
        top_idx = int(np.argmax(preds))
        confidence = round(float(preds[top_idx]) * 100, 2)
        pred_class_id = label_map.get(str(top_idx), str(top_idx))

        # Look up friendly disease name
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

from routes_auth import *
from routes_chickens import *
from routes_scans import *
from routes_farms import *
from routes_notifications import *
from routes_tasks import *

if __name__ == '__main__':
    load_diseases()
    app.run(host='0.0.0.0', port=5000, debug=True)