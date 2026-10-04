import os
import json
import math
import base64
import hmac
import hashlib
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from flask import request, jsonify
from app import app
from db import get_db, token_required

# ─── PRICING AND PLAN CONFIGURATION ───────────────────────────────────────────
PLANS_CONFIG = {
    'free_trial': {
        'name': 'Free Trial',
        'price': 0,
        'currency': 'PHP',
        'duration_days': 30,
        'max_farms': 1,
        'max_chickens_per_farm': 20,
        'max_captures': 30,
        'features': [
            '1 Farm',
            'Up to 20 chickens per farm',
            '30 AI disease captures limit',
            'Valid for 30 days',
            'Basic health history & tasks',
        ],
        'badge': 'Starter',
    },
    'pro': {
        'name': 'Pro Account',
        'price': 479,
        'currency': 'PHP',
        'duration_days': 90, # 3 months
        'max_farms': 2,
        'max_chickens_per_farm': 60,
        'max_captures': 999999,
        'features': [
            '2 Farms supported',
            'Up to 60 chickens per farm',
            'Unlimited AI disease captures',
            'Valid for 3 months (90 days)',
            'Multi-caretaker management',
            'AI Visual Focus Heatmaps',
            'Priority 7-day grace period',
        ],
        'badge': 'Popular',
    },
    'premium': {
        'name': 'Premium Account',
        'price': 1099,
        'currency': 'PHP',
        'duration_days': 365, # 1 year
        'max_farms': 999999,
        'max_chickens_per_farm': 999999,
        'max_captures': 999999,
        'features': [
            'Unlimited Farms',
            'Unlimited Chickens',
            'Unlimited AI disease captures',
            'Valid for 1 Full Year (365 days)',
            'Unlimited Caretakers & Farm staff',
            'Complete Health Analytics & History',
            'All current & future features included',
            'Best Value (Save over 40%)',
        ],
        'badge': 'Best Value',
    },
    'free': {
        'name': 'Standard Free Plan',
        'price': 0,
        'currency': 'PHP',
        'duration_days': 0,
        'max_farms': 1,
        'max_chickens_per_farm': 20,
        'max_captures': 0, # Trial exhausted
        'features': [
            '1 Farm limit',
            'Up to 20 chickens per farm',
            'Existing data safely retained (never deleted)',
            'Upgrade anytime to unlock more farms or chickens',
        ],
        'badge': 'Free Tier',
    }
}

PAYMONGO_SECRET_KEY = os.environ.get('PAYMONGO_SECRET_KEY', '')
PAYMONGO_PUBLIC_KEY = os.environ.get('PAYMONGO_PUBLIC_KEY', '')
STRIPE_SECRET_KEY   = os.environ.get('STRIPE_SECRET_KEY', '')
STRIPE_PUBLISHABLE_KEY = os.environ.get('STRIPE_PUBLISHABLE_KEY', '')

def get_effective_subscription(user_id, cur, db):
    """
    Retrieves or initializes the active subscription for an owner or caretaker.
    Handles grace periods, automatic downgrades to Free tier (Google Drive model),
    and counts real-time usage (farms, chickens, captures).
    """
    # 1. Determine if user is owner or caretaker
    cur.execute('SELECT id, role, email, first_name FROM users WHERE id=%s', (user_id,))
    user = cur.fetchone()
    if not user:
        return None

    target_user_id = user_id
    is_caretaker = (user.get('role') == 'caretaker')

    if is_caretaker:
        # Caretakers inherit the subscription of their farm's owner
        cur.execute('''
            SELECT f.owner_id FROM farm_members fm
            JOIN farms f ON f.id = fm.farm_id
            WHERE fm.user_id = %s
            LIMIT 1
        ''', (user_id,))
        farm_row = cur.fetchone()
        if farm_row and farm_row.get('owner_id'):
            target_user_id = farm_row['owner_id']

    # 2. Fetch target user's subscription
    cur.execute('SELECT * FROM subscriptions WHERE user_id=%s', (target_user_id,))
    sub = cur.fetchone()

    now = datetime.utcnow()

    if not sub:
        # Auto-provision Free Trial for target user
        trial_end = now + timedelta(days=30)
        trial_grace = trial_end + timedelta(days=7)
        cur.execute('''
            INSERT INTO subscriptions
            (user_id, plan, status, price_paid, currency, payment_gateway,
             max_farms, max_chickens_per_farm, max_captures, captures_used,
             free_trial_used, start_date, end_date, grace_period_end)
            VALUES (%s, 'free_trial', 'active', 0.00, 'PHP', 'system',
                    1, 20, 30, 0, TRUE, %s, %s, %s)
            RETURNING *
        ''', (target_user_id, now, trial_end, trial_grace))
        db.commit()
        cur.execute('SELECT * FROM subscriptions WHERE user_id=%s', (target_user_id,))
        sub = cur.fetchone()

    # 3. Evaluate Status & Expiration Flow
    stored_plan = sub['plan']
    end_date = sub['end_date']
    grace_period_end = sub['grace_period_end']

    effective_status = 'active'
    effective_plan = stored_plan
    is_in_grace_period = False
    is_expired = False
    days_remaining = 0
    grace_days_remaining = 0

    if stored_plan in ('pro', 'premium', 'free_trial'):
        if now <= end_date:
            effective_status = 'active'
            total_seconds_left = max(0.0, (end_date - now).total_seconds())
            days_remaining = max(1, math.ceil(total_seconds_left / 86400.0))
        elif now <= grace_period_end:
            # 1. ⚠️ THE GRACE PERIOD (0 to 7 Days After Expiration)
            # Premium features remain fully active for a few days while user can renew
            effective_status = 'grace_period'
            is_in_grace_period = True
            total_grace_seconds = max(0.0, (grace_period_end - now).total_seconds())
            grace_days_remaining = max(1, math.ceil(total_grace_seconds / 86400.0))
        else:
            # 2. ⬇️ THE DOWNGRADE TO FREE TIER
            # System confirms expiration past grace: automatically switched to regular Free Plan.
            # Data & progress are preserved! But quotas restrict creating additional farms/chickens.
            effective_status = 'expired'
            effective_plan = 'free'
            is_expired = True

    # 4. Resolve limits
    plan_config = PLANS_CONFIG.get(effective_plan, PLANS_CONFIG['free'])
    
    # If in grace period, maintain previous plan's perks!
    if is_in_grace_period:
        plan_config = PLANS_CONFIG.get(stored_plan, PLANS_CONFIG['pro'])

    max_farms = plan_config['max_farms']
    max_chickens_per_farm = plan_config['max_chickens_per_farm']
    max_captures = plan_config['max_captures']

    # 5. Calculate real-time usage for this account
    cur.execute('SELECT COUNT(*) as cnt FROM farms WHERE owner_id=%s', (target_user_id,))
    farms_count = cur.fetchone()['cnt']

    cur.execute('''
        SELECT COUNT(*) as cnt FROM chickens c
        JOIN farms f ON f.id = c.farm_id
        WHERE f.owner_id = %s
    ''', (target_user_id,))
    total_chickens_count = cur.fetchone()['cnt']

    # Count captures: To guarantee that deleting a chicken NEVER un-does or resets
    # used scan credits, we track consumption via subscriptions.captures_used.
    persisted_captures = int(sub.get('captures_used') or 0)

    # Check live count across chickens on owner's farms
    cur.execute('''
        SELECT COUNT(*) as cnt FROM image_captures ic
        JOIN chickens c ON c.id = ic.chicken_id
        JOIN farms f ON f.id = c.farm_id
        WHERE f.owner_id = %s
    ''', (target_user_id,))
    live_row = cur.fetchone()
    live_count = int(live_row['cnt'] if live_row else 0)

    # If live_count exceeds persisted (e.g. from historical data before counter migration), sync upward
    if live_count > persisted_captures:
        persisted_captures = live_count
        cur.execute('UPDATE subscriptions SET captures_used = %s WHERE id = %s', (persisted_captures, sub['id']))
        db.commit()

    captures_count = persisted_captures
    scans_remaining = max(0, max_captures - captures_count) if max_captures < 999999 else 999999

    return {
        'subscription_id': sub['id'],
        'user_id': target_user_id,
        'is_caretaker': is_caretaker,
        'plan': effective_plan,
        'stored_plan': stored_plan,
        'plan_name': plan_config['name'],
        'status': effective_status,
        'is_active': (effective_status in ('active', 'grace_period')),
        'is_in_grace_period': is_in_grace_period,
        'is_expired': is_expired,
        'has_heatmaps': effective_plan in ('pro', 'premium'),
        'can_view_heatmaps': effective_plan in ('pro', 'premium'),
        'days_remaining': days_remaining,
        'days_left': days_remaining,
        'grace_days_remaining': grace_days_remaining,
        'scans_remaining': scans_remaining,
        'scans_left': scans_remaining,
        'start_date': sub['start_date'].isoformat() if sub['start_date'] else None,
        'end_date': sub['end_date'].isoformat() if sub['end_date'] else None,
        'grace_period_end': sub['grace_period_end'].isoformat() if sub['grace_period_end'] else None,
        'free_trial_used': sub.get('free_trial_used', True),
        'limits': {
            'max_farms': max_farms,
            'max_chickens_per_farm': max_chickens_per_farm,
            'max_captures': max_captures,
        },
        'usage': {
            'farms_count': farms_count,
            'total_chickens_count': total_chickens_count,
            'captures_count': captures_count,
            'captures_used': captures_count,
            'scans_used': captures_count,
            'farms_remaining': max(0, max_farms - farms_count) if max_farms < 999999 else 999999,
            'captures_remaining': scans_remaining,
            'scans_remaining': scans_remaining,
            'scans_left': scans_remaining,
        },
        'features': plan_config['features'],
        'badge': plan_config['badge'],
    }


# ─── GET /api/subscriptions/my-plan ──────────────────────────────────────────
@app.route('/api/subscriptions/my-plan', methods=['GET'])
@token_required
def get_my_plan():
    db = get_db()
    try:
        with db.cursor() as cur:
            sub_info = get_effective_subscription(request.user_id, cur, db)
            if not sub_info:
                return jsonify({'error': 'User not found'}), 404

            return jsonify({
                'success': True,
                'subscription': sub_info,
                'available_plans': {
                    'pro': PLANS_CONFIG['pro'],
                    'premium': PLANS_CONFIG['premium'],
                    'free_trial': PLANS_CONFIG['free_trial'],
                },
                'payment_gateways': {
                    'paymongo_available': True,
                    'stripe_available': True,
                    'preferred_ph': 'paymongo', # GCash, Maya, Cards
                }
            })
    finally:
        db.close()


# ─── POST /api/subscriptions/checkout ────────────────────────────────────────
@app.route('/api/subscriptions/checkout', methods=['POST'])
@token_required
def create_checkout():
    """
    Creates a payment checkout session using PayMongo (GCash, Maya, Card)
    or Stripe. Supports Sandbox / Instant Test checkout for development & demo.
    """
    d = request.json or {}
    plan_key = d.get('plan', 'pro').lower()
    gateway = d.get('gateway', 'paymongo').lower() # 'paymongo' | 'stripe'
    test_mode = d.get('test_mode', True) # Defaults to true for test mode

    if plan_key not in ('pro', 'premium'):
        return jsonify({'error': 'Invalid plan selected. Choose pro or premium.'}), 400

    plan_info = PLANS_CONFIG[plan_key]
    amount = plan_info['price']
    currency = plan_info['currency']

    db = get_db()
    try:
        with db.cursor() as cur:
            # Verify user exists
            cur.execute('SELECT id, email, first_name, last_name, role FROM users WHERE id=%s', (request.user_id,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404

            if user.get('role') != 'owner':
                return jsonify({'error': 'Only farm owners can subscribe to plans.'}), 403

            # Safeguard: Prevent downgrading from active Premium to Pro mid-cycle
            cur.execute('SELECT plan, status, end_date FROM subscriptions WHERE user_id=%s', (request.user_id,))
            current_sub = cur.fetchone()
            now = datetime.utcnow()
            if current_sub and current_sub.get('plan') == 'premium' and current_sub.get('status') == 'active' and current_sub.get('end_date') and current_sub['end_date'] > now:
                if plan_key == 'pro':
                    return jsonify({
                        'error': f"You currently have an active Premium Account valid until {current_sub['end_date'].strftime('%B %d, %Y')}. Downgrading to Pro is only allowed after your Premium cycle ends."
                    }), 400

            # Generate reference
            import uuid
            checkout_session_id = f"chk_paymongo_{plan_key}_{uuid.uuid4().hex[:12]}"
            checkout_url = ""

            # REAL PAYMONGO CHECKOUT SESSION (GCASH / PAYMAYA / CARD)
            if PAYMONGO_SECRET_KEY:
                try:
                    payload = json.dumps({
                        "data": {
                            "attributes": {
                                "send_email_receipt": True,
                                "show_description": True,
                                "show_line_items": True,
                                "line_items": [
                                    {
                                        "currency": "PHP",
                                        "amount": int(amount * 100), # PayMongo uses centavos (e.g. 47900 for ₱479.00)
                                        "name": f"Clucko {plan_info['name']}",
                                        "quantity": 1,
                                        "description": f"Validity: {plan_info['duration_days']} days ({'3 Months' if plan_key == 'pro' else '1 Year'})"
                                    }
                                ],
                                "payment_method_types": ["gcash", "paymaya", "card"],
                                "description": f"Clucko {plan_info['name']} via GCash",
                                "success_url": f"https://clucko.app/payment-success?session_id={checkout_session_id}",
                                "cancel_url": "https://clucko.app/payment-cancelled"
                            }
                        }
                    }).encode('utf-8')

                    auth_header = "Basic " + base64.b64encode(f"{PAYMONGO_SECRET_KEY}:".encode('utf-8')).decode('utf-8')
                    req = urllib.request.Request(
                        "https://api.paymongo.com/v1/checkout_sessions",
                        data=payload,
                        headers={
                            "Content-Type": "application/json",
                            "Authorization": auth_header
                        }
                    )
                    with urllib.request.urlopen(req) as resp:
                        res_data = json.loads(resp.read().decode('utf-8'))
                        checkout_url = res_data['data']['attributes']['checkout_url']
                        checkout_session_id = res_data['data']['id']
                except Exception as pm_err:
                    print(f"[PAYMONGO ERROR] Checkout session failed: {pm_err}")
                    return jsonify({'error': f'Failed to create GCash checkout session: {str(pm_err)}'}), 502

            # Record transaction
            cur.execute('''
                INSERT INTO subscription_transactions
                (user_id, plan, amount, currency, payment_gateway, payment_method, checkout_session_id, checkout_url, status)
                VALUES (%s, %s, %s, %s, 'paymongo', 'gcash', %s, %s, 'pending')
            ''', (request.user_id, plan_key, amount, currency,
                  checkout_session_id, checkout_url))
            db.commit()

            return jsonify({
                'success': True,
                'checkout_url': checkout_url,
                'session_id': checkout_session_id,
                'plan': plan_key,
                'plan_name': plan_info['name'],
                'amount': amount,
                'currency': currency,
                'gateway': 'paymongo',
                'payment_method': 'gcash',
                'is_real_payment': True
            })
    finally:
        db.close()


def query_paymongo_is_paid(session_id):
    """
    Directly asks PayMongo if this checkout session was paid on GCash / Card.
    Returns (is_paid: bool, payment_details: dict, message: str)
    """
    if not PAYMONGO_SECRET_KEY or not session_id:
        return False, {}, "Missing secret key or session ID"
    
    # If it's a real PayMongo session ID (starts with cs_)
    if session_id.startswith('cs_'):
        try:
            auth_header = "Basic " + base64.b64encode(f"{PAYMONGO_SECRET_KEY}:".encode('utf-8')).decode('utf-8')
            req = urllib.request.Request(
                f"https://api.paymongo.com/v1/checkout_sessions/{session_id}",
                headers={
                    "Authorization": auth_header,
                    "Content-Type": "application/json"
                }
            )
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                attrs = data.get('data', {}).get('attributes', {})
                payments = attrs.get('payments', [])
                
                # Check for successful payment in payments list
                for p in payments:
                    p_attrs = p.get('attributes', {})
                    if p_attrs.get('status') == 'paid':
                        return True, p_attrs, "Payment confirmed by PayMongo"
                
                # Check payment_intent status
                pi_status = attrs.get('payment_intent', {}).get('attributes', {}).get('status')
                if pi_status == 'succeeded':
                    return True, attrs.get('payment_intent', {}), "Payment intent succeeded"
                
                return False, attrs, "Payment is still awaiting authorization on GCash"
        except Exception as e:
            return False, {}, f"Error querying PayMongo: {str(e)}"
    
    return False, {}, "Unknown session type"


# ─── POST /api/subscriptions/verify ──────────────────────────────────────────
@app.route('/api/subscriptions/verify', methods=['POST'])
@token_required
def verify_payment():
    """
    Confirms payment of a GCash/PayMongo checkout session and activates the subscription.
    Enforces Rule 1 (Don't Double-Charge): If renewing same plan, extends existing end date!
    """
    d = request.json or {}
    session_id = str(d.get('session_id') or '').strip()
    if not session_id or len(session_id) > 128:
        return jsonify({'error': 'Valid session_id is required'}), 400
    plan_key = d.get('plan')

    db = get_db()
    try:
        with db.cursor() as cur:
            # Look up transaction
            cur.execute('SELECT plan, payment_gateway, amount FROM subscription_transactions WHERE checkout_session_id=%s', (session_id,))
            tx = cur.fetchone()
            if tx and tx.get('plan'):
                plan_key = tx['plan']

            if not plan_key or plan_key not in PLANS_CONFIG:
                plan_key = 'pro'

            # Query real PayMongo API
            is_paid, pay_details, pay_msg = query_paymongo_is_paid(session_id)
            if not is_paid:
                return jsonify({
                    'success': False,
                    'paid': False,
                    'error': 'Payment has not been completed on GCash yet. Please finish the payment in the GCash window and try again.',
                    'details': pay_msg
                }), 400

            plan_info = PLANS_CONFIG[plan_key]
            duration_days = plan_info['duration_days']
            now = datetime.utcnow()

            # Rule 1 & Billing Cycle matching:
            # If user already has an active subscription of the same tier, EXTEND from current end_date!
            cur.execute('SELECT * FROM subscriptions WHERE user_id=%s', (request.user_id,))
            existing = cur.fetchone()

            if existing and existing.get('plan') == plan_key and existing.get('end_date') and existing['end_date'] > now:
                new_end_date = existing['end_date'] + timedelta(days=duration_days)
                new_start_date = existing.get('start_date') or now
            else:
                new_end_date = now + timedelta(days=duration_days)
                new_start_date = now

            new_grace_date = new_end_date + timedelta(days=7)

            if existing:
                cur.execute('''
                    UPDATE subscriptions
                    SET plan = %s,
                        status = 'active',
                        price_paid = %s,
                        payment_gateway = 'paymongo',
                        payment_reference = %s,
                        max_farms = %s,
                        max_chickens_per_farm = %s,
                        max_captures = %s,
                        start_date = %s,
                        end_date = %s,
                        grace_period_end = %s,
                        updated_at = %s
                    WHERE user_id = %s
                ''', (
                    plan_key,
                    plan_info['price'],
                    session_id,
                    plan_info['max_farms'],
                    plan_info['max_chickens_per_farm'],
                    plan_info['max_captures'],
                    new_start_date,
                    new_end_date,
                    new_grace_date,
                    now,
                    request.user_id
                ))
            else:
                cur.execute('''
                    INSERT INTO subscriptions
                    (user_id, plan, status, price_paid, currency, payment_gateway,
                     payment_reference, max_farms, max_chickens_per_farm, max_captures,
                     start_date, end_date, grace_period_end)
                    VALUES (%s, %s, 'active', %s, 'PHP', 'paymongo', %s, %s, %s, %s, %s, %s, %s)
                ''', (
                    request.user_id,
                    plan_key,
                    plan_info['price'],
                    session_id,
                    plan_info['max_farms'],
                    plan_info['max_chickens_per_farm'],
                    plan_info['max_captures'],
                    new_start_date,
                    new_end_date,
                    new_grace_date
                ))

            # Mark transaction as paid
            if session_id:
                cur.execute('''
                    UPDATE subscription_transactions
                    SET status = 'paid', updated_at = %s
                    WHERE checkout_session_id = %s AND user_id = %s
                ''', (now, session_id, request.user_id))

            # Insert in-app notification
            cur.execute('SELECT id FROM farms WHERE owner_id=%s LIMIT 1', (request.user_id,))
            farm_row = cur.fetchone()
            if farm_row:
                cur.execute('''
                    INSERT INTO notifications
                    (farm_id, user_id, title, message, type)
                    VALUES (%s, %s, %s, %s, 'success')
                ''', (
                    farm_row['id'],
                    request.user_id,
                    f"🎉 {plan_info['name']} Activated via GCash!",
                    f"GCash payment of ₱{plan_info['price']} confirmed. Valid until {new_end_date.strftime('%B %d, %Y')}."
                ))
            db.commit()

            sub_info = get_effective_subscription(request.user_id, cur, db)
            return jsonify({
                'success': True,
                'paid': True,
                'message': f"Payment confirmed! Successfully activated {plan_info['name']}.",
                'subscription': sub_info
            })
    finally:
        db.close()


# ─── POST /api/subscriptions/paymongo-webhook ─────────────────────────────────
@app.route('/api/subscriptions/paymongo-webhook', methods=['POST'])
def paymongo_webhook():
    """
    Real-time webhook listener for PayMongo.
    Synchronizes backend state when a GCash payment succeeds.
    Verifies Paymongo-Signature when PAYMONGO_WEBHOOK_SECRET is set.
    """
    webhook_secret = os.environ.get('PAYMONGO_WEBHOOK_SECRET')
    if webhook_secret:
        sig_header = request.headers.get('Paymongo-Signature', '')
        if not sig_header:
            return jsonify({'error': 'Missing Paymongo-Signature header'}), 400

        parts = {}
        for item in sig_header.split(','):
            if '=' in item:
                k, v = item.strip().split('=', 1)
                parts[k] = v

        timestamp = parts.get('t')
        signature = parts.get('te') or parts.get('li')
        if not timestamp or not signature:
            return jsonify({'error': 'Malformed Paymongo-Signature header'}), 400

        raw_body = request.get_data(as_text=True)
        payload_to_sign = f"{timestamp}.{raw_body}".encode('utf-8')
        expected_sig = hmac.new(webhook_secret.encode('utf-8'), payload_to_sign, hashlib.sha256).hexdigest()

        if not hmac.compare_digest(expected_sig, signature):
            return jsonify({'error': 'Invalid webhook signature'}), 401

    event = request.json or {}
    db = None
    try:
        event_type = event.get('data', {}).get('attributes', {}).get('type')
        if event_type in ('checkout_session.payment.paid', 'payment.paid'):
            session_data = event.get('data', {}).get('attributes', {}).get('data', {})
            session_id = session_data.get('id')
            
            db = get_db()
            with db.cursor() as cur:
                cur.execute('SELECT user_id, plan, amount FROM subscription_transactions WHERE checkout_session_id=%s', (session_id,))
                tx = cur.fetchone()
                if tx:
                    user_id = tx['user_id']
                    plan_key = tx['plan']
                    plan_info = PLANS_CONFIG.get(plan_key, PLANS_CONFIG['pro'])
                    now = datetime.utcnow()
                    
                    cur.execute('SELECT * FROM subscriptions WHERE user_id=%s', (user_id,))
                    existing = cur.fetchone()
                    
                    if existing and existing.get('plan') == plan_key and existing.get('end_date') and existing['end_date'] > now:
                        new_end_date = existing['end_date'] + timedelta(days=plan_info['duration_days'])
                        new_start_date = existing.get('start_date') or now
                    else:
                        new_end_date = now + timedelta(days=plan_info['duration_days'])
                        new_start_date = now
                    
                    new_grace = new_end_date + timedelta(days=7)
                    
                    if existing:
                        cur.execute('''
                            UPDATE subscriptions
                            SET plan = %s, status = 'active', price_paid = %s, payment_gateway = 'paymongo',
                                payment_reference = %s, max_farms = %s, max_chickens_per_farm = %s,
                                max_captures = %s, start_date = %s, end_date = %s, grace_period_end = %s, updated_at = %s
                            WHERE user_id = %s
                        ''', (plan_key, plan_info['price'], session_id, plan_info['max_farms'],
                              plan_info['max_chickens_per_farm'], plan_info['max_captures'],
                              new_start_date, new_end_date, new_grace, now, user_id))
                    else:
                        cur.execute('''
                            INSERT INTO subscriptions
                            (user_id, plan, status, price_paid, currency, payment_gateway,
                             payment_reference, max_farms, max_chickens_per_farm, max_captures,
                             start_date, end_date, grace_period_end)
                            VALUES (%s, %s, 'active', %s, 'PHP', 'paymongo', %s, %s, %s, %s, %s, %s, %s)
                        ''', (user_id, plan_key, plan_info['price'], session_id,
                              plan_info['max_farms'], plan_info['max_chickens_per_farm'], plan_info['max_captures'],
                              new_start_date, new_end_date, new_grace))
                    
                    cur.execute("UPDATE subscription_transactions SET status='paid', updated_at=%s WHERE checkout_session_id=%s", (now, session_id))
                    db.commit()
                    return jsonify({'success': True, 'message': 'Webhook processed'}), 200
        return jsonify({'success': True, 'message': 'Event ignored'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if db:
            db.close()


# ─── POST /api/subscriptions/dev-toggle ──────────────────────────────────────
@app.route('/api/subscriptions/dev-toggle', methods=['POST'])
@token_required
def dev_toggle_subscription():
    """
    Developer / Tester utility:
    Allows simulating different subscription states instantly on the active account:
    - 'free_trial': Sets 30-day Free Trial (1 farm, 20 chickens, 30 captures)
    - 'pro': Sets 3-Month Pro Plan (2 farms, 70 chickens, unlimited captures)
    - 'premium': Sets 1-Year Premium Plan (unlimited all)
    - 'grace_period': Sets end_date to yesterday so account enters the 7-day grace period!
    - 'expired_free': Sets grace_period_end to yesterday so account downgrades to Standard Free!
    """
    is_dev = os.environ.get('FLASK_ENV') == 'development' or os.environ.get('DEBUG', '').lower() in ('1', 'true')
    user_role = getattr(request, 'user_role', '')
    if not is_dev or user_role != 'admin':
        return jsonify({'error': 'Subscription dev-toggle is disabled in production and restricted to administrators'}), 403

    d = request.json or {}
    target_state = d.get('state') or d.get('plan') or 'pro'
    now = datetime.utcnow()

    db = get_db()
    try:
        with db.cursor() as cur:
            if target_state == 'grace_period':
                # Expired 2 days ago, grace period ends in 5 days
                end_date = now - timedelta(days=2)
                grace_end = now + timedelta(days=5)
                cur.execute('''
                    UPDATE subscriptions
                    SET plan = 'pro',
                        status = 'grace_period',
                        end_date = %s,
                        grace_period_end = %s,
                        updated_at = %s
                    WHERE user_id = %s
                ''', (end_date, grace_end, now, request.user_id))

            elif target_state == 'expired_free':
                # Expired 10 days ago (past 7-day grace), downgraded to standard Free Plan
                end_date = now - timedelta(days=10)
                grace_end = now - timedelta(days=3)
                cur.execute('''
                    UPDATE subscriptions
                    SET plan = 'free',
                        status = 'expired',
                        max_farms = 1,
                        max_chickens_per_farm = 20,
                        max_captures = 30,
                        end_date = %s,
                        grace_period_end = %s,
                        updated_at = %s
                    WHERE user_id = %s
                ''', (end_date, grace_end, now, request.user_id))

            elif target_state in PLANS_CONFIG:
                p = PLANS_CONFIG[target_state]
                dur = p['duration_days'] or 30
                end_date = now + timedelta(days=dur)
                grace_end = end_date + timedelta(days=7)
                cur.execute('''
                    UPDATE subscriptions
                    SET plan = %s,
                        status = 'active',
                        max_farms = %s,
                        max_chickens_per_farm = %s,
                        max_captures = %s,
                        start_date = %s,
                        end_date = %s,
                        grace_period_end = %s,
                        updated_at = %s
                    WHERE user_id = %s
                ''', (
                    target_state,
                    p['max_farms'],
                    p['max_chickens_per_farm'],
                    p['max_captures'],
                    now,
                    end_date,
                    grace_end,
                    now,
                    request.user_id
                ))

            db.commit()
            sub_info = get_effective_subscription(request.user_id, cur, db)
            return jsonify({
                'success': True,
                'message': f'Successfully simulated {target_state} state',
                'simulated_state': target_state,
                'subscription': sub_info
            })
    finally:
        db.close()
