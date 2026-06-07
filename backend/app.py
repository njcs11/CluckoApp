from flask import Flask, request, jsonify
from flask_cors import CORS
from db import get_db, token_required, SECRET_KEY, DB_CONFIG
import os
import json
import base64
import numpy as np
from PIL import Image
import io
import traceback

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
    data = request.json
    diseases = load_diseases()
    disease_id = data['name'].lower().replace(' ', '_')
    new_disease = {"id":disease_id,"name":data['name'],"description":data.get('description',''),"symptoms":data.get('symptoms',[]),"affected_parts":data.get('affected_parts',[]),"severity":data.get('severity','moderate'),"color":data.get('color','#6366f1')}
    for d in diseases['diseases']:
        if d['id'] == disease_id:
            return jsonify({"error": "Disease already exists"}), 400
    diseases['diseases'].append(new_disease)
    save_diseases(diseases)
    os.makedirs(os.path.join(DATASETS_DIR, disease_id), exist_ok=True)
    return jsonify({"success": True, "disease": new_disease})

@app.route('/api/diseases/<disease_id>', methods=['DELETE'])
def delete_disease(disease_id):
    diseases = load_diseases()
    diseases['diseases'] = [d for d in diseases['diseases'] if d['id'] != disease_id]
    save_diseases(diseases)
    return jsonify({"success": True})

@app.route('/api/dataset/upload', methods=['POST'])
def upload_dataset():
    disease_id = request.form.get('disease_id')
    if not disease_id:
        return jsonify({"error": "disease_id required"}), 400
    disease_dir = os.path.join(DATASETS_DIR, disease_id)
    os.makedirs(disease_dir, exist_ok=True)
    files = request.files.getlist('images')
    saved = 0
    for f in files:
        if f and f.filename:
            f.save(os.path.join(disease_dir, f"{saved}_{f.filename.replace(' ','_')}"))
            saved += 1
    return jsonify({"success": True, "saved": saved})

@app.route('/api/dataset/stats', methods=['GET'])
def dataset_stats():
    stats = {}
    for disease in load_diseases()['diseases']:
        d = os.path.join(DATASETS_DIR, disease['id'])
        stats[disease['id']] = len([f for f in os.listdir(d) if f.lower().endswith(('.jpg','.jpeg','.png','.bmp','.webp'))]) if os.path.exists(d) else 0
    return jsonify(stats)

@app.route('/api/train', methods=['POST'])
def train_model():
    try:
        from model_trainer import train
        return jsonify(train(DATASETS_DIR, MODELS_DIR, load_diseases()))
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/model/status', methods=['GET'])
def model_status():
    mp = os.path.join(MODELS_DIR, 'gamefowl_model.h5')
    lp = os.path.join(MODELS_DIR, 'labels.json')
    if os.path.exists(mp) and os.path.exists(lp):
        return jsonify({"trained": True, "classes": json.load(open(lp))})
    return jsonify({"trained": False})

@app.route('/api/detect', methods=['POST'])
def detect():
    try:
        from model_trainer import predict
        data = request.json
        image_b64 = data.get('image')
        if not image_b64:
            return jsonify({"error": "No image provided"}), 400
        if ',' in image_b64:
            image_b64 = image_b64.split(',')[1]
        img = Image.open(io.BytesIO(base64.b64decode(image_b64))).convert('RGB')
        return jsonify(predict(img, MODELS_DIR, load_diseases()))
    except FileNotFoundError:
        return jsonify({"error": "Model not trained yet."}), 400
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

from routes_auth import *
from routes_chickens import *
from routes_scans import *

if __name__ == '__main__':
    load_diseases()
    app.run(host='0.0.0.0', port=5000, debug=True)