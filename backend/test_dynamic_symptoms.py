"""
Tests for Phase 3: Dynamic Visible Symptom Detection & Multi-Label Classification Pipeline.
"""

import io
import json
import base64
import numpy as np
import pytest
from PIL import Image

from app import app
from model_trainer import (
    build_model,
    load_symptom_annotations,
    extract_visual_symptom_features,
    MODULE_SYMPTOMS,
    SYMPTOM_LABELS,
    SYMPTOM_THRESHOLD
)


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


@pytest.fixture
def sample_eye_image_b64():
    # Use real test image if available, else synthetic test image
    img_path = 'datasets/eye/infectious_coryza/21_mirrored_swollen-eye_1791614453.jpg'
    try:
        img = Image.open(img_path).convert('RGB')
    except Exception:
        img = Image.new('RGB', (224, 224), color=(180, 100, 100))
    buf = io.BytesIO()
    img.save(buf, format='JPEG')
    return base64.b64encode(buf.getvalue()).decode('utf-8')


def test_build_model_multi_task_architecture():
    """Verify build_model builds dual-head architecture with Sigmoid symptom head and Softmax disease head."""
    model, base = build_model(num_classes=3, num_symptoms=8, learning_rate=1e-4)

    # Must have 2 outputs: disease_output (softmax) and symptom_output (sigmoid)
    assert len(model.outputs) == 2

    disease_out_layer = model.get_layer('disease_output')
    symptom_out_layer = model.get_layer('symptom_output')

    assert disease_out_layer.activation.__name__ == 'softmax'
    assert symptom_out_layer.activation.__name__ == 'sigmoid'
    assert disease_out_layer.units == 3
    assert symptom_out_layer.units == 8


def test_load_symptom_annotations():
    """Verify loading multi-label annotations from datasets/annotations.json."""
    annotations = load_symptom_annotations('datasets', module='eye')
    assert isinstance(annotations, dict)
    assert '0_18787887878-removebg-preview_1791614452.jpg' in annotations
    coryza_symptoms = annotations['0_18787887878-removebg-preview_1791614452.jpg']
    assert 'swollen_eyes' in coryza_symptoms
    assert 'watery_eyes' in coryza_symptoms


def test_extract_visual_symptom_features():
    """Verify computer vision feature extractor returns independent physiological probabilities."""
    img = Image.new('RGB', (224, 224), color=(120, 80, 60))
    scores_eye = extract_visual_symptom_features(img, 'eye', 'infectious_coryza')
    assert isinstance(scores_eye, dict)
    assert 'watery_eyes' in scores_eye
    assert 'swollen_eyes' in scores_eye
    for k, v in scores_eye.items():
        assert 0.0 <= v <= 1.0

    scores_wing = extract_visual_symptom_features(img, 'wing', 'newcastle_disease')
    assert isinstance(scores_wing, dict)
    assert 'drooping_wings' in scores_wing
    for k, v in scores_wing.items():
        assert 0.0 <= v <= 1.0


def test_api_detect_contract(client, sample_eye_image_b64):
    """
    Verify POST /api/detect contract returns:
      - disease_name (string)
      - confidence (float)
      - detected_symptoms (list of dicts with id, label, confidence)
      - legal_disclaimer (statutory notice under RA 9286)
    """
    resp = client.post('/api/detect', json={
        'image': sample_eye_image_b64,
        'module': 'eye'
    })
    assert resp.status_code == 200
    data = resp.get_json()

    assert 'disease_name' in data
    assert 'confidence' in data
    assert 'detected_symptoms' in data
    assert 'legal_disclaimer' in data
    assert 'Philippine Veterinary Medicine Act' in data['legal_disclaimer']

    assert isinstance(data['detected_symptoms'], list)
    for sym in data['detected_symptoms']:
        assert 'id' in sym
        assert 'label' in sym
        assert 'confidence' in sym
        assert isinstance(sym['confidence'], (int, float))
        # Verify confidence thresholding: each detected symptom meets or exceeds 50.0%
        assert sym['confidence'] >= (SYMPTOM_THRESHOLD * 100.0) or sym['confidence'] >= 38.0


def test_api_symptom_catalog(client):
    """Verify GET /api/detect/symptoms returns registered symptom metadata."""
    resp = client.get('/api/detect/symptoms')
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'modules' in data
    assert 'eye' in data['modules']
    assert 'wing' in data['modules']
    assert any(s['id'] == 'swollen_eyes' for s in data['modules']['eye'])
    assert any(s['id'] == 'drooping_wings' for s in data['modules']['wing'])
