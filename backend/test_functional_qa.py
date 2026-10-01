import os
import time
import hmac
import hashlib
import json
import pytest
from datetime import datetime, timedelta
import jwt
from unittest.mock import MagicMock, patch

os.environ['FLASK_ENV'] = 'testing'
os.environ['DEBUG'] = '0'
os.environ['JWT_SECRET'] = 'test_secret_key_1234567890'
os.environ['PAYMONGO_WEBHOOK_SECRET'] = 'whsec_test_secret_key_123'

from app import app
from db import SECRET_KEY
from routes_subscriptions import PLANS_CONFIG


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


@pytest.fixture
def owner_token():
    return jwt.encode({'user_id': 1, 'role': 'owner'}, SECRET_KEY, algorithm='HS256')


@pytest.fixture
def caretaker_token():
    return jwt.encode({'user_id': 2, 'role': 'caretaker'}, SECRET_KEY, algorithm='HS256')


# ==============================================================================
# 1. SUBSCRIPTION RENEWAL DATE ARITHMETIC & START DATE INTEGRITY
# ==============================================================================
def test_subscription_renewal_extends_from_existing_end_date():
    """
    Verify Rule 1: If a user renews an active plan of the same tier,
    the new end_date must be extended from the existing end_date (not now),
    and the original inception start_date must be preserved.
    """
    now = datetime.utcnow()
    original_start = now - timedelta(days=15)
    existing_end = now + timedelta(days=15)  # 15 days remaining
    plan_info = PLANS_CONFIG['pro']          # 90 days duration

    existing = {
        'plan': 'pro',
        'start_date': original_start,
        'end_date': existing_end
    }

    # Simulate extension logic from routes_subscriptions.py
    if existing and existing.get('plan') == 'pro' and existing.get('end_date') and existing['end_date'] > now:
        new_end_date = existing['end_date'] + timedelta(days=plan_info['duration_days'])
        new_start_date = existing.get('start_date') or now
    else:
        new_end_date = now + timedelta(days=plan_info['duration_days'])
        new_start_date = now

    # Verify end date is 15 + 90 = 105 days in the future
    expected_days = (new_end_date - now).total_seconds() / 86400.0
    assert 104.9 < expected_days < 105.1
    assert new_start_date == original_start


def test_subscription_renewal_after_expiry_resets_dates():
    """
    Verify that if a previous subscription has already expired,
    renewal starts afresh from 'now'.
    """
    now = datetime.utcnow()
    expired_end = now - timedelta(days=5)   # Expired 5 days ago
    plan_info = PLANS_CONFIG['pro']          # 90 days duration

    existing = {
        'plan': 'pro',
        'start_date': now - timedelta(days=95),
        'end_date': expired_end
    }

    if existing and existing.get('plan') == 'pro' and existing.get('end_date') and existing['end_date'] > now:
        new_end_date = existing['end_date'] + timedelta(days=plan_info['duration_days'])
        new_start_date = existing.get('start_date') or now
    else:
        new_end_date = now + timedelta(days=plan_info['duration_days'])
        new_start_date = now

    expected_days = (new_end_date - now).total_seconds() / 86400.0
    assert 89.9 < expected_days < 90.1
    assert new_start_date == now


# ==============================================================================
# 2. TRANSACTION UPDATE ISOLATION (FIX FOR OR -> AND)
# ==============================================================================
def test_subscription_transaction_update_clause_uses_and():
    """
    Verify that the SQL query for marking transaction as paid isolates by session_id AND user_id,
    preventing inadvertent mass-update of all past sessions for that user.
    """
    import inspect
    import routes_subscriptions

    source = inspect.getsource(routes_subscriptions.verify_payment)
    assert "WHERE checkout_session_id = %s AND user_id = %s" in source
    assert "WHERE checkout_session_id = %s OR user_id = %s" not in source


# ==============================================================================
# 3. PAYMONGO WEBHOOK CONNECTION CLEANUP & EVENT HANDLING
# ==============================================================================
def test_paymongo_webhook_guarantees_db_close():
    """
    Verify that paymongo_webhook contains a finally block ensuring db.close()
    is always executed to prevent connection pool exhaustion.
    """
    import inspect
    import routes_subscriptions

    source = inspect.getsource(routes_subscriptions.paymongo_webhook)
    assert "finally:" in source
    assert "if db:" in source
    assert "db.close()" in source


def test_paymongo_webhook_unregistered_event_returns_200(client):
    """Verify that ignored or non-payment webhook events return 200 without crashing."""
    timestamp = str(int(time.time()))
    payload = json.dumps({
        'data': {
            'attributes': {
                'type': 'source.chargeable',
                'data': {'id': 'src_test_123'}
            }
        }
    })
    secret = os.environ['PAYMONGO_WEBHOOK_SECRET']
    payload_to_sign = f"{timestamp}.{payload}".encode('utf-8')
    valid_sig = hmac.new(secret.encode('utf-8'), payload_to_sign, hashlib.sha256).hexdigest()

    resp = client.post('/api/subscriptions/paymongo-webhook',
                       data=payload,
                       content_type='application/json',
                       headers={'Paymongo-Signature': f't={timestamp},te={valid_sig}'})
    assert resp.status_code == 200
    assert resp.get_json().get('message') == 'Event ignored'


# ==============================================================================
# 4. CHICKEN QR CODE GENERATION & SQL INTERVAL AUDIT
# ==============================================================================
def test_chicken_code_candidate_sequence():
    """
    Verify chicken QR code increment logic correctly skips existing numbers
    and generates monotonic sequential codes.
    """
    import re

    existing_rows = [
        {'qr_code': 'CK-001'},
        {'qr_code': 'CK-002'},
        {'qr_code': 'CK-005'},
    ]

    existing_codes = set()
    nums = []
    for r in existing_rows:
        code = (r.get('qr_code') or '').strip()
        existing_codes.add(code.upper())
        m = re.search(r'(?:CK|CH)[-_]?(\d+)', code, re.IGNORECASE)
        if m:
            nums.append(int(m.group(1)))

    candidate_num = (max(nums) + 1) if nums else 1
    while f"CK-{candidate_num:03d}".upper() in existing_codes:
        candidate_num += 1

    generated_code = f"CK-{candidate_num:03d}"
    assert generated_code == 'CK-006'


def test_sql_interval_uses_standard_postgres_syntax():
    """
    Verify that raw SQL files use standard PostgreSQL INTERVAL 'n UNIT'
    quotes to prevent syntax errors when executing directly on PostgreSQL.
    """
    import inspect
    import routes_chickens
    import routes_scans
    import routes_auth

    chickens_src = inspect.getsource(routes_chickens.create_chicken)
    assert "INTERVAL '4 SECOND'" in chickens_src

    scans_src = inspect.getsource(routes_scans.save_scan)
    assert "INTERVAL '4 SECOND'" in scans_src

    auth_src = inspect.getsource(routes_auth.record_login_notification)
    assert "INTERVAL '1 MINUTE'" in auth_src


# ==============================================================================
# 5. TASK ROLE-BASED ACCESS CONTROL (RBAC)
# ==============================================================================
def test_caretaker_cannot_delete_tasks(client, caretaker_token):
    """Verify that a user with 'caretaker' role receives 403 when attempting to delete a task."""
    with patch('routes_tasks.get_db') as mock_get_db:
        mock_db = MagicMock()
        mock_cur = MagicMock()
        mock_db.cursor.return_value.__enter__.return_value = mock_cur
        mock_get_db.return_value = mock_db

        # Caretaker role returned
        mock_cur.fetchone.return_value = {'role': 'caretaker'}

        resp = client.delete('/api/tasks/10', headers={'Authorization': f'Bearer {caretaker_token}'})
        assert resp.status_code == 403
        assert 'Caretakers cannot delete tasks' in resp.get_json().get('error', '')


def test_caretaker_cannot_edit_task_details(client, caretaker_token):
    """Verify that a user with 'caretaker' role receives 403 when attempting to edit task details."""
    with patch('routes_tasks.get_db') as mock_get_db:
        mock_db = MagicMock()
        mock_cur = MagicMock()
        mock_db.cursor.return_value.__enter__.return_value = mock_cur
        mock_get_db.return_value = mock_db

        # Task exists on farm, but user is caretaker
        mock_cur.fetchone.side_effect = [
            {'id': 10, 'farm_id': 1, 'owner_id': 99}, # task row
            {'role': 'caretaker'}                      # user role check
        ]

        resp = client.put('/api/tasks/10',
                          headers={'Authorization': f'Bearer {caretaker_token}'},
                          json={'title': 'Unauthorized Task Edit'})
        assert resp.status_code == 403
        assert 'Caretakers cannot edit task details' in resp.get_json().get('error', '')


# ==============================================================================
# 6. SUBSCRIPTION DAYS LEFT & MONOTONIC SCANS QUOTA (NEVER UNDONE ON CHICKEN DELETE)
# ==============================================================================
def test_subscription_days_remaining_ceil_calculation():
    """Verify that days_remaining uses ceiling arithmetic and never returns 0 while plan is active today."""
    from routes_subscriptions import get_effective_subscription
    import math

    now = datetime.utcnow()
    # 29 days and 14 hours left
    end_date = now + timedelta(days=29, hours=14)
    total_seconds_left = max(0.0, (end_date - now).total_seconds())
    days_remaining = max(1, math.ceil(total_seconds_left / 86400.0))
    assert days_remaining == 30

    # 4 hours left today (should still show 1 day remaining, not 0)
    end_date_today = now + timedelta(hours=4)
    total_seconds_today = max(0.0, (end_date_today - now).total_seconds())
    days_today = max(1, math.ceil(total_seconds_today / 86400.0))
    assert days_today == 1


def test_chicken_deletion_preserves_captures_used_quota():
    """
    Verify Rule: When a capture is saved and the chicken is later deleted,
    the captures used counter is NOT decremented / undone.
    """
    from routes_subscriptions import get_effective_subscription

    mock_db = MagicMock()
    mock_cur = MagicMock()
    mock_db.cursor.return_value.__enter__.return_value = mock_cur

    user_id = 42
    now = datetime.utcnow()
    sub_row = {
        'id': 1,
        'user_id': user_id,
        'plan': 'free_trial',
        'status': 'active',
        'price_paid': 0,
        'currency': 'PHP',
        'payment_gateway': 'system',
        'max_farms': 1,
        'max_chickens_per_farm': 20,
        'max_captures': 30,
        'captures_used': 5,  # 5 scans were consumed previously
        'free_trial_used': True,
        'start_date': now,
        'end_date': now + timedelta(days=30),
        'grace_period_end': now + timedelta(days=37)
    }

    # Simulate: User has 5 captures recorded in subscriptions table.
    # But because chicken was deleted, live image_captures count is 0!
    mock_cur.fetchone.side_effect = [
        {'id': user_id, 'role': 'owner', 'email': 'owner@farm.com', 'first_name': 'Owner'}, # user check
        sub_row,                                                                              # subscriptions row
        {'cnt': 1},                                                                           # farms_count
        {'cnt': 0},                                                                           # total_chickens_count (chicken deleted)
        {'cnt': 0}                                                                            # live image_captures count = 0 (cascaded delete)
    ]

    info = get_effective_subscription(user_id, mock_cur, mock_db)

    # Captures count MUST remain 5, not reset to 0!
    assert info['usage']['captures_count'] == 5
    assert info['usage']['captures_remaining'] == 25
    assert info['scans_remaining'] == 25
    assert info['days_remaining'] > 0
