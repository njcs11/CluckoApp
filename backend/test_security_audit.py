import os
import time
import hmac
import hashlib
import json
import pytest
from datetime import datetime, date, timedelta
from werkzeug.security import generate_password_hash, check_password_hash

# Set test environment
os.environ['FLASK_ENV'] = 'testing'
os.environ['DEBUG'] = '0'
os.environ['JWT_SECRET'] = 'test_secret_key_1234567890'
os.environ['PAYMONGO_WEBHOOK_SECRET'] = 'whsec_test_secret_key_123'
os.environ['ADMIN_API_KEY'] = 'test_admin_key_999'

from app import app
from db import revoke_token, is_token_revoked, SECRET_KEY
from routes_auth import (
    hash_password, verify_password, is_rate_limited, _RATE_LIMIT_STORE
)
import jwt


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


# ==============================================================================
# 1. PASSWORD SECURITY & LEGACY HASH MIGRATION TESTS
# ==============================================================================
def test_password_hashing_uses_werkzeug_salted():
    """Verify that new passwords are encrypted with salted hashes, not unsalted SHA-256."""
    password = "MySecurePassword123!"
    hashed = hash_password(password)
    
    assert hashed != password
    assert len(hashed) > 64
    assert hashed.startswith(('scrypt:', 'pbkdf2:'))
    assert verify_password(hashed, password)
    assert not verify_password(hashed, "WrongPassword123!")


def test_legacy_sha256_detection_and_verification():
    """Verify legacy SHA-256 hashes are recognized and correctly matched."""
    password = "LegacyPassword123"
    legacy_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
    
    assert len(legacy_hash) == 64
    assert verify_password(legacy_hash, password)
    assert not verify_password(legacy_hash, "WrongPassword")


# ==============================================================================
# 2. AGE GATE & PASSWORD VALIDATION TESTS
# ==============================================================================
def test_signup_validation_rejects_minors(client):
    """Verify signup returns 400 when user is under 18 years old."""
    today = date.today()
    minor_bday = f"{today.year - 16}-{today.month:02d}-{today.day:02d}"
    
    resp = client.post('/api/auth/signup', json={
        'first_name': 'Minor',
        'last_name': 'User',
        'email': 'minor@example.com',
        'password': 'SecurePassword123!',
        'date_of_birth': minor_bday
    })
    
    assert resp.status_code == 400
    data = resp.get_json()
    assert '18 years old' in data.get('error', '')


def test_signup_validation_rejects_age_confirmation_false(client):
    """Verify signup returns 400 when confirm_age_18 is explicitly false."""
    resp = client.post('/api/auth/signup', json={
        'first_name': 'Minor',
        'last_name': 'User',
        'email': 'minor2@example.com',
        'password': 'SecurePassword123!',
        'confirm_age_18': False
    })
    assert resp.status_code == 400
    data = resp.get_json()
    assert '18 years of age' in data.get('error', '')


def test_signup_validation_rejects_short_password(client):
    """Verify signup returns 400 when password is under 8 characters."""
    today = date.today()
    valid_bday = f"{today.year - 25}-{today.month:02d}-{today.day:02d}"
    
    resp = client.post('/api/auth/signup', json={
        'first_name': 'Adult',
        'last_name': 'User',
        'email': 'adult@example.com',
        'password': 'short',
        'date_of_birth': valid_bday
    })
    
    assert resp.status_code == 400
    data = resp.get_json()
    assert '8 characters' in data.get('error', '')


# ==============================================================================
# 3. RATE LIMITING TESTS
# ==============================================================================
def test_rate_limiting_triggers():
    """Verify that exceeding rate limits returns True (limited)."""
    test_key = f"test_rate_limit_{time.time()}"
    _RATE_LIMIT_STORE.pop(test_key, None)
    
    # Allow up to 3 requests
    for _ in range(3):
        assert is_rate_limited(test_key, max_requests=3, window_seconds=60) is False
    
    # 4th request must be rate limited
    assert is_rate_limited(test_key, max_requests=3, window_seconds=60) is True


# ==============================================================================
# 4. TOKEN REVOCATION & LOGOUT TESTS
# ==============================================================================
def test_token_revocation_blacklist():
    """Verify that revoked tokens cannot access protected routes."""
    test_token = jwt.encode({'user_id': 999, 'role': 'owner'}, SECRET_KEY, algorithm='HS256')
    
    assert not is_token_revoked(test_token)
    revoke_token(test_token)
    assert is_token_revoked(test_token)


def test_revoked_token_rejected_by_api(client):
    """Verify API returns 401 when a revoked token is supplied."""
    test_token = jwt.encode({'user_id': 888, 'role': 'owner'}, SECRET_KEY, algorithm='HS256')
    revoke_token(test_token)
    
    resp = client.get('/api/farms', headers={'Authorization': f'Bearer {test_token}'})
    assert resp.status_code == 401
    assert 'revoked' in resp.get_json().get('error', '').lower()


# ==============================================================================
# 5. PATH TRAVERSAL DEFENSE TESTS
# ==============================================================================
def test_path_traversal_in_dataset_images_rejected(client):
    """Verify directory traversal payloads (e.g. ../../) are blocked with 400."""
    resp = client.get('/api/dataset/images?module=eye&disease_id=../../etc')
    assert resp.status_code == 400
    assert 'disease_id' in resp.get_json().get('error', '').lower()


def test_path_traversal_in_dataset_image_file_rejected(client):
    """Verify directory traversal in image fetching is blocked."""
    resp = client.get('/api/dataset/image/eye/healthy/..%2f..%2f..%2fetc%2fpasswd')
    assert resp.status_code in (400, 404)


# ==============================================================================
# 6. SUBSCRIPTION DEV-TOGGLE ACCESS CONTROL TESTS
# ==============================================================================
def test_dev_toggle_rejected_for_regular_user(client):
    """Verify regular user cannot elevate subscription tier via dev-toggle."""
    regular_user_token = jwt.encode({'user_id': 123, 'role': 'caretaker'}, SECRET_KEY, algorithm='HS256')
    
    resp = client.post('/api/subscriptions/dev-toggle',
                       headers={'Authorization': f'Bearer {regular_user_token}'},
                       json={'plan': 'premium'})
    
    assert resp.status_code == 403
    assert 'restricted to administrators' in resp.get_json().get('error', '')


# ==============================================================================
# 7. PAYMONGO WEBHOOK SIGNATURE VERIFICATION TESTS
# ==============================================================================
def test_paymongo_webhook_rejected_without_signature(client):
    """Verify PayMongo webhook is rejected when signature is missing."""
    resp = client.post('/api/subscriptions/paymongo-webhook',
                       json={'data': {'attributes': {'type': 'payment.paid'}}})
    assert resp.status_code == 400
    assert 'Missing Paymongo-Signature' in resp.get_json().get('error', '')


def test_paymongo_webhook_rejected_with_invalid_signature(client):
    """Verify PayMongo webhook is rejected when signature is forged."""
    resp = client.post('/api/subscriptions/paymongo-webhook',
                       headers={'Paymongo-Signature': 't=1600000000,te=forged_signature_hex'},
                       json={'data': {'attributes': {'type': 'payment.paid'}}})
    assert resp.status_code == 401
    assert 'Invalid webhook signature' in resp.get_json().get('error', '')


def test_paymongo_webhook_accepted_with_valid_signature(client):
    """Verify PayMongo webhook is accepted when signature is mathematically valid."""
    timestamp = str(int(time.time()))
    payload = json.dumps({'data': {'attributes': {'type': 'unknown.event', 'data': {}}}})
    secret = os.environ['PAYMONGO_WEBHOOK_SECRET']
    
    payload_to_sign = f"{timestamp}.{payload}".encode('utf-8')
    valid_sig = hmac.new(secret.encode('utf-8'), payload_to_sign, hashlib.sha256).hexdigest()
    
    resp = client.post('/api/subscriptions/paymongo-webhook',
                       data=payload,
                       content_type='application/json',
                       headers={'Paymongo-Signature': f't={timestamp},te={valid_sig}'})
    
    assert resp.status_code == 200
    assert resp.get_json().get('success') is True


# ==============================================================================
# 8. IDOR & ADMIN ENDPOINT ACCESS CONTROL TESTS
# ==============================================================================
def test_farm_members_unauthorized_access_rejected(client):
    """Verify unauthorized user cannot access member data for a farm they do not own or belong to."""
    unauthorized_token = jwt.encode({'user_id': 99999999, 'role': 'caretaker'}, SECRET_KEY, algorithm='HS256')
    resp = client.get('/api/farms/99999999/members', headers={'Authorization': f'Bearer {unauthorized_token}'})
    assert resp.status_code == 403
    assert 'access denied' in resp.get_json().get('error', '').lower()


def test_admin_train_endpoint_rejected_without_admin_credentials(client):
    """Verify non-admin cannot trigger model training."""
    regular_user_token = jwt.encode({'user_id': 123, 'role': 'caretaker'}, SECRET_KEY, algorithm='HS256')
    resp = client.post('/api/train',
                       headers={'Authorization': f'Bearer {regular_user_token}'},
                       json={'module': 'eye'})
    assert resp.status_code == 403
    assert 'administrator' in resp.get_json().get('error', '').lower()

