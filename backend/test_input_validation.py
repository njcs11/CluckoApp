import os
import json
import base64
import pytest
from datetime import date
import jwt

os.environ['FLASK_ENV'] = 'testing'
os.environ['DEBUG'] = '0'
os.environ['JWT_SECRET'] = 'test_secret_key_1234567890'

from app import app
from db import SECRET_KEY
from routes_auth import is_valid_email


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


@pytest.fixture
def auth_token():
    return jwt.encode({'user_id': 1, 'role': 'owner'}, SECRET_KEY, algorithm='HS256')


# ==============================================================================
# 1. EMAIL FORMAT & AUTH INPUT BOUNDARY TESTS
# ==============================================================================
def test_email_validation_helper():
    """Verify is_valid_email handles standard and malformed formats."""
    assert is_valid_email('user@example.com') is True
    assert is_valid_email('user.name+tag@sub.domain.ph') is True
    assert is_valid_email('invalid_address') is False
    assert is_valid_email('missing@domain') is False
    assert is_valid_email('@nodomain.com') is False
    assert is_valid_email('spaces in@domain.com') is False
    assert is_valid_email('') is False
    assert is_valid_email('a' * 256 + '@domain.com') is False


def test_signup_rejects_invalid_email(client):
    """Verify signup returns 400 when email format is invalid."""
    resp = client.post('/api/auth/signup', json={
        'first_name': 'Test',
        'last_name': 'User',
        'email': 'not-an-email',
        'password': 'ValidPassword123!',
        'date_of_birth': '1995-01-01'
    })
    assert resp.status_code == 400
    assert 'valid email' in resp.get_json().get('error', '').lower()


def test_signup_rejects_oversized_name(client):
    """Verify signup rejects names longer than 100 characters."""
    resp = client.post('/api/auth/signup', json={
        'first_name': 'A' * 101,
        'last_name': 'User',
        'email': 'valid@example.com',
        'password': 'ValidPassword123!',
        'date_of_birth': '1995-01-01'
    })
    assert resp.status_code == 400
    assert 'maximum 100 characters' in resp.get_json().get('error', '').lower()


def test_signup_rejects_oversized_password(client):
    """Verify signup rejects passwords exceeding 128 characters (DoS prevention)."""
    resp = client.post('/api/auth/signup', json={
        'first_name': 'Test',
        'last_name': 'User',
        'email': 'valid@example.com',
        'password': 'P' * 129,
        'date_of_birth': '1995-01-01'
    })
    assert resp.status_code == 400
    assert 'between 8 and 128' in resp.get_json().get('error', '').lower()


# ==============================================================================
# 2. CHICKEN INPUT VALIDATION TESTS
# ==============================================================================
def test_create_chicken_rejects_empty_name(client, auth_token):
    """Verify chicken creation rejects empty or whitespace-only names."""
    resp = client.post('/api/chickens',
                       headers={'Authorization': f'Bearer {auth_token}'},
                       json={'chicken_name': '   ', 'qr_code': 'CK-001'})
    assert resp.status_code == 400
    assert 'chicken_name is required' in resp.get_json().get('error', '')


def test_create_chicken_rejects_oversized_qr_code(client, auth_token):
    """Verify chicken creation rejects oversized QR codes."""
    resp = client.post('/api/chickens',
                       headers={'Authorization': f'Bearer {auth_token}'},
                       json={'chicken_name': 'Rooster 1', 'qr_code': 'Q' * 65})
    assert resp.status_code == 400
    assert 'maximum 64 characters' in resp.get_json().get('error', '')


def test_create_chicken_rejects_javascript_photo_url(client, auth_token):
    """Verify chicken creation rejects javascript: protocol in photo_url."""
    resp = client.post('/api/chickens',
                       headers={'Authorization': f'Bearer {auth_token}'},
                       json={
                           'chicken_name': 'Rooster 1',
                           'qr_code': 'CK-001',
                           'photo_url': 'javascript:alert(document.cookie)'
                       })
    assert resp.status_code == 400
    assert 'Invalid photo URL protocol' in resp.get_json().get('error', '')


# ==============================================================================
# 3. SCAN & DETECTION INPUT VALIDATION TESTS
# ==============================================================================
def test_save_scan_rejects_out_of_range_confidence(client, auth_token):
    """Verify confidence score must be between 0.0 and 100.0."""
    # Negative confidence
    resp_neg = client.post('/api/scans',
                           headers={'Authorization': f'Bearer {auth_token}'},
                           json={
                               'chicken_id': 1,
                               'image_type': 'eye',
                               'predicted_condition': 'Healthy',
                               'confidence_score': -10.5,
                               'severity_level': 'none'
                           })
    assert resp_neg.status_code == 400
    assert 'between 0.0 and 100.0' in resp_neg.get_json().get('error', '')

    # Greater than 100
    resp_over = client.post('/api/scans',
                            headers={'Authorization': f'Bearer {auth_token}'},
                            json={
                                'chicken_id': 1,
                                'image_type': 'eye',
                                'predicted_condition': 'Healthy',
                                'confidence_score': 150.0,
                                'severity_level': 'none'
                            })
    assert resp_over.status_code == 400
    assert 'between 0.0 and 100.0' in resp_over.get_json().get('error', '')


def test_save_scan_rejects_invalid_severity_enum(client, auth_token):
    """Verify severity level must be in ('none', 'moderate', 'high', 'critical')."""
    resp = client.post('/api/scans',
                       headers={'Authorization': f'Bearer {auth_token}'},
                       json={
                           'chicken_id': 1,
                           'image_type': 'eye',
                           'predicted_condition': 'Healthy',
                           'confidence_score': 95.0,
                           'severity_level': 'invalid_severity_level'
                       })
    assert resp.status_code == 400
    assert 'severity_level must be one of' in resp.get_json().get('error', '')


def test_save_scan_rejects_invalid_image_type(client, auth_token):
    """Verify image_type must be in allowed categories."""
    resp = client.post('/api/scans',
                       headers={'Authorization': f'Bearer {auth_token}'},
                       json={
                           'chicken_id': 1,
                           'image_type': 'non_existent_type',
                           'predicted_condition': 'Healthy',
                           'confidence_score': 95.0,
                           'severity_level': 'none'
                       })
    assert resp.status_code == 400
    assert 'image_type must be one of' in resp.get_json().get('error', '')


def test_save_scan_rejects_invalid_chicken_id(client, auth_token):
    """Verify chicken_id must be a positive integer."""
    resp = client.post('/api/scans',
                       headers={'Authorization': f'Bearer {auth_token}'},
                       json={
                           'chicken_id': 'abc',
                           'image_type': 'eye',
                           'predicted_condition': 'Healthy',
                           'confidence_score': 95.0,
                           'severity_level': 'none'
                       })
    assert resp.status_code == 400
    assert 'chicken_id must be a valid integer' in resp.get_json().get('error', '')


# ==============================================================================
# 4. FARM MANAGEMENT INPUT VALIDATION TESTS
# ==============================================================================
def test_create_farm_rejects_empty_name(client, auth_token):
    """Verify farm creation rejects empty or whitespace farm names."""
    resp = client.post('/api/farms',
                       headers={'Authorization': f'Bearer {auth_token}'},
                       json={'farm_name': '    '})
    assert resp.status_code == 400
    assert 'Farm name is required' in resp.get_json().get('error', '')


def test_create_farm_rejects_out_of_range_coordinates(client, auth_token):
    """Verify latitude and longitude coordinates must be geographically valid."""
    resp_lat = client.post('/api/farms',
                           headers={'Authorization': f'Bearer {auth_token}'},
                           json={'farm_name': 'My Farm', 'latitude': 999.0})
    assert resp_lat.status_code == 400
    assert 'latitude must be between -90 and 90' in resp_lat.get_json().get('error', '')

    resp_lng = client.post('/api/farms',
                           headers={'Authorization': f'Bearer {auth_token}'},
                           json={'farm_name': 'My Farm', 'longitude': -250.0})
    assert resp_lng.status_code == 400
    assert 'longitude must be between -180 and 180' in resp_lng.get_json().get('error', '')


# ==============================================================================
# 5. ML DETECTION MALFORMED PAYLOAD TESTS
# ==============================================================================
def test_detect_rejects_corrupted_base64(client):
    """Verify /api/detect returns 400 Bad Request on corrupted base64 or non-image data."""
    resp = client.post('/api/detect', json={'image': 'not_a_valid_base64_image_data!!!'})
    assert resp.status_code == 400
    assert 'invalid base64' in resp.get_json().get('error', '').lower()


# ==============================================================================
# 6. SUBSCRIPTION VERIFY VALIDATION TESTS
# ==============================================================================
def test_subscription_verify_rejects_missing_session_id(client, auth_token):
    """Verify /api/subscriptions/verify rejects missing session_id."""
    resp = client.post('/api/subscriptions/verify',
                       headers={'Authorization': f'Bearer {auth_token}'},
                       json={})
    assert resp.status_code == 400
    assert 'Valid session_id is required' in resp.get_json().get('error', '')


def test_save_scan_normalizes_head_and_full_synonyms(client, auth_token):
    """Verify save_scan normalizes 'head' to 'eye' and 'full' to 'posture' without raising 400 error."""
    for valid_type in ('head', 'full', 'eye', 'wing', 'posture', 'feces', 'other'):
        resp = client.post('/api/scans',
                           headers={'Authorization': f'Bearer {auth_token}'},
                           json={
                               'chicken_id': 9999999,
                               'image_type': valid_type,
                               'predicted_condition': 'Healthy',
                               'confidence_score': 92.0,
                               'severity_level': 'none'
                           })
        err_msg = resp.get_json().get('error', '')
        assert 'image_type must be one of' not in err_msg


def test_gradcam_tf_lazy_loaded_without_name_error(client):
    """Verify /api/gradcam properly loads tf without raising NameError."""
    from PIL import Image
    from unittest.mock import MagicMock, patch
    import io, base64

    img = Image.new('RGB', (224, 224), color='white')
    buf = io.BytesIO()
    img.save(buf, format='JPEG')
    b64 = base64.b64encode(buf.getvalue()).decode('utf-8')

    mock_tf = MagicMock()
    mock_model = MagicMock()
    mock_tf.keras.models.load_model.return_value = mock_model
    mock_model.predict.return_value = [[0.95, 0.05]]

    with patch('os.path.exists', return_value=True), \
         patch('builtins.open', MagicMock()), \
         patch('json.load', return_value={'0': 'coryza'}), \
         patch('model_trainer._load_tf', return_value=(mock_tf, None, None, None, None)), \
         patch('model_trainer.preprocess_image', return_value=MagicMock()), \
         patch('model_trainer.generate_gradcam', return_value='base64_heatmap_image'):
        resp = client.post('/api/gradcam', json={'image': b64, 'module': 'eye'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['gradcam_image'] == 'base64_heatmap_image'
        assert data['confidence'] == 95.0

