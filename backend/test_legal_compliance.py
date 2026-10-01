import os
import json
import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timedelta
import jwt

# Set test environment
os.environ['FLASK_ENV'] = 'testing'
os.environ['DEBUG'] = '0'
os.environ['JWT_SECRET'] = 'test_secret_key_1234567890'
os.environ['PAYMONGO_WEBHOOK_SECRET'] = 'whsec_test_secret_key_123'
os.environ['ADMIN_API_KEY'] = 'test_admin_key_999'

from app import app
from db import SECRET_KEY, is_token_revoked


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


def test_privacy_policy_endpoint(client):
    """Verify GET /api/legal/privacy-policy returns complete DPA RA 10173 and DPO disclosures."""
    resp = client.get('/api/legal/privacy-policy')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['business_name'] == 'Clucko'
    assert 'Davao City' in data['controller_address']
    assert data['dpo_email'] == 'jasphertadlan@gmail.com'
    assert 'Republic Act No. 10173' in data['governing_law']
    assert data['minimum_age'] == 18
    assert 'veterinary_disclaimer' in data
    assert 'deletion_mechanism' in data


def test_terms_of_service_endpoint(client):
    """Verify GET /api/legal/terms returns statutory disclosures (RA 9286, RA 7394, Davao City)."""
    resp = client.get('/api/legal/terms')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['business_name'] == 'Clucko'
    assert data['terms_version'] == '2026.1'
    assert data['venue'] == 'Davao City'
    assert data['minimum_age'] == 18
    assert data['support_email'] == 'jasphertadlan@gmail.com'
    assert 'RA 9286' in data['veterinary_disclaimer']
    assert 'cancellation_policy' in data


def test_account_deletion_unauthorized(client):
    """Verify DELETE /api/auth/account returns 401 when no token is supplied."""
    resp = client.delete('/api/auth/account')
    assert resp.status_code == 401
    data = resp.get_json()
    assert 'token' in data.get('error', '').lower()


def test_account_deletion_authorized_and_revokes_token(client):
    """Verify DELETE /api/auth/account executes cascade cleanup and revokes JWT."""
    test_user_id = 999
    token = jwt.encode({
        'user_id': test_user_id,
        'role': 'owner',
        'exp': datetime.utcnow() + timedelta(hours=1)
    }, SECRET_KEY, algorithm='HS256')

    mock_db = MagicMock()
    mock_cursor = MagicMock()
    mock_db.cursor.return_value.__enter__.return_value = mock_cursor
    mock_cursor.fetchone.return_value = {'id': test_user_id, 'role': 'owner'}
    mock_cursor.fetchall.return_value = [{'id': 101}]

    with patch('routes_auth.get_db', return_value=mock_db):
        resp = client.delete('/api/auth/account', headers={'Authorization': f'Bearer {token}'})

    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True
    assert 'RA 10173' in data['message']

    # Token must now be revoked
    assert is_token_revoked(token) is True
    mock_db.commit.assert_called_once()
    mock_db.close.assert_called_once()


def test_signup_requires_affirmative_age_18(client):
    """Verify signup returns 400 if DOB is omitted and confirm_age_18 is omitted."""
    resp = client.post('/api/auth/signup', json={
        'first_name': 'Juan',
        'last_name': 'Dela Cruz',
        'email': 'juandelacruz@example.com',
        'password': 'SecurePassword123!',
        # Omitted date_of_birth AND confirm_age_18
    })
    assert resp.status_code == 400
    data = resp.get_json()
    assert '18 years of age' in data.get('error', '')


def test_signup_rejects_unaccepted_terms(client):
    """Verify signup returns 400 if terms_accepted is explicitly False."""
    resp = client.post('/api/auth/signup', json={
        'first_name': 'Juan',
        'last_name': 'Dela Cruz',
        'email': 'juandelacruz@example.com',
        'password': 'SecurePassword123!',
        'confirm_age_18': True,
        'terms_accepted': False
    })
    assert resp.status_code == 400
    data = resp.get_json()
    assert 'Terms of Service' in data.get('error', '')


def test_detect_attaches_statutory_veterinary_disclaimer(client):
    """Verify /api/detect attaches statutory veterinary disclaimer (RA 9286)."""
    from PIL import Image
    import io, base64

    # Generate small 10x10 white jpeg
    img = Image.new('RGB', (10, 10), color='white')
    buf = io.BytesIO()
    img.save(buf, format='JPEG')
    b64 = base64.b64encode(buf.getvalue()).decode('utf-8')

    mock_prediction = {
        'rejected': False,
        'flagged_disease': 'Healthy',
        'confidence_level': 'High',
        'top_prediction': {'confidence': 95.0, 'color': '#4CAF50', 'description': 'No abnormalities detected.'},
        'all_predictions': [],
        'detected_symptoms': []
    }

    with patch('model_trainer.predict_auto', return_value=mock_prediction):
        resp = client.post('/api/detect', json={'image': b64, 'module': 'auto'})

    assert resp.status_code == 200
    data = resp.get_json()
    assert 'legal_disclaimer' in data
    assert 'Philippine Veterinary Medicine Act' in data['legal_disclaimer'] or 'RA 9286' in data['legal_disclaimer']
