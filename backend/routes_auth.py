from flask import request, jsonify
import hashlib, hmac, jwt, os, secrets, time, re
from collections import defaultdict
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from app import app
from db import get_db, token_required, SECRET_KEY, revoke_token
import random
import string

EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$')

def is_valid_email(email: str) -> bool:
    if not email or len(email) > 255:
        return False
    return bool(EMAIL_REGEX.match(email))

EMAILJS_SERVICE_ID = os.environ.get('EMAILJS_SERVICE_ID', 'service_lzrjxzb')
EMAILJS_TEMPLATE_ID = os.environ.get('EMAILJS_TEMPLATE_ID', 'template_u0b0yl9')
EMAILJS_USER_ID = os.environ.get('EMAILJS_USER_ID', 'lJJPMqktLrmyBcQBJ')

# In-memory rate limit store: key -> [timestamp, ...]
_RATE_LIMIT_STORE = defaultdict(list)

def is_rate_limited(key: str, max_requests: int = 5, window_seconds: int = 60) -> bool:
    now = time.time()
    _RATE_LIMIT_STORE[key] = [t for t in _RATE_LIMIT_STORE[key] if now - t < window_seconds]
    if len(_RATE_LIMIT_STORE[key]) >= max_requests:
        return True
    _RATE_LIMIT_STORE[key].append(now)
    return False

# In-memory server-side verification code store for password reset
# email -> {'code': str, 'expires_at': float, 'attempts': int}
_RESET_CODES = {}

def hash_password(password: str) -> str:
    """Generate a secure salted hash using Werkzeug."""
    return generate_password_hash(password)

def verify_password(stored_hash: str, candidate_password: str) -> bool:
    """Verify password against modern salted hash or legacy SHA-256 with constant-time comparison."""
    if not stored_hash or not candidate_password:
        return False
    if '$' in stored_hash or stored_hash.startswith(('scrypt:', 'pbkdf2:')):
        try:
            return check_password_hash(stored_hash, candidate_password)
        except Exception:
            return False
    candidate_sha256 = hashlib.sha256(candidate_password.encode('utf-8')).hexdigest()
    return hmac.compare_digest(stored_hash.lower(), candidate_sha256.lower())

def generate_farm_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    ip = request.remote_addr or 'unknown'
    if is_rate_limited(f"signup:{ip}", max_requests=10, window_seconds=60):
        return jsonify({'error': 'Too many registration requests. Please wait a moment.'}), 429

    d = request.json or {}
    first_name = str(d.get('first_name', '')).strip()
    last_name = str(d.get('last_name', '')).strip()
    email_clean = str(d.get('email', '')).strip().lower()
    password = str(d.get('password', ''))

    if not first_name or len(first_name) > 100:
        return jsonify({'error': 'First name is required (maximum 100 characters)'}), 400
    if not last_name or len(last_name) > 100:
        return jsonify({'error': 'Last name is required (maximum 100 characters)'}), 400
    if not is_valid_email(email_clean):
        return jsonify({'error': 'A valid email address is required'}), 400
    if len(password) < 8 or len(password) > 128:
        return jsonify({'error': 'Password must be between 8 and 128 characters long'}), 400

    # Age gate validation (Minimum age 18 in Philippines for agricultural/gamefowl management)
    dob_str = d.get('date_of_birth')
    if dob_str:
        try:
            dob = datetime.strptime(str(dob_str)[:10], '%Y-%m-%d')
            age_years = (datetime.utcnow() - dob).days / 365.25
            if age_years < 18:
                return jsonify({'error': 'You must be at least 18 years old to create an account.'}), 400
        except ValueError:
            return jsonify({'error': 'Invalid date of birth format. Use YYYY-MM-DD.'}), 400
    elif not d.get('confirm_age_18'):
        return jsonify({'error': 'You must confirm that you are at least 18 years of age.'}), 400

    # Data Privacy Act of 2012 (RA 10173) explicit terms & privacy policy consent
    if d.get('terms_accepted') is False:
        return jsonify({'error': 'You must accept the Terms of Service and Privacy Policy to create an account.'}), 400

    phone_clean = str(d.get('phone_number', '')).strip()[:30]
    farm_name_clean = str(d.get('farm_name', '')).strip()[:100]
    pw_hash = hash_password(password)
    farm_code_input = str(d.get('farm_code', '')).strip().upper()

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT id FROM users WHERE LOWER(email)=%s', (email_clean,))
            if cur.fetchone():
                return jsonify({'error': 'Email already registered'}), 400

            if farm_code_input:
                # Caretaker path — verify farm code
                cur.execute('''
                    SELECT id FROM farms WHERE farm_code=%s
                ''', (farm_code_input,))
                farm = cur.fetchone()
                if not farm:
                    return jsonify({'error': 'Invalid farm code. Ask your farm owner.'}), 400

                cur.execute('''
                    INSERT INTO users
                    (first_name, last_name, email, password_hash, phone_number, farm_name, role, terms_version, terms_accepted_at)
                    VALUES (%s,%s,%s,%s,%s,%s,'caretaker','2026.1',NOW())
                ''', (first_name, last_name, email_clean, pw_hash,
                      phone_clean, farm_name_clean))
                db.commit()
                user_id = cur.lastrowid

                # Add to farm_members
                cur.execute('''
                    INSERT INTO farm_members (farm_id, user_id, role)
                    VALUES (%s, %s, 'caretaker')
                ''', (farm['id'], user_id))
                db.commit()
                role = 'caretaker'

            else:
                # Owner path
                cur.execute('''
                    INSERT INTO users
                    (first_name, last_name, email, password_hash,
                     phone_number, farm_name, farm_location, role, terms_version, terms_accepted_at)
                    VALUES (%s,%s,%s,%s,%s,NULL,NULL,'owner','2026.1',NOW())
                ''', (d['first_name'].strip(), d['last_name'].strip(), email_clean, pw_hash,
                      d.get('phone_number', '').strip()))
                db.commit()
                user_id = cur.lastrowid

                # Auto-provision 30-Day Free Trial (starts with 0 farms)
                now = datetime.utcnow()
                trial_end = now + timedelta(days=30)
                trial_grace = trial_end + timedelta(days=7)
                cur.execute('''
                    INSERT INTO subscriptions
                    (user_id, plan, status, price_paid, currency, payment_gateway,
                     max_farms, max_chickens_per_farm, max_captures, captures_used,
                     free_trial_used, start_date, end_date, grace_period_end)
                    VALUES (%s, 'free_trial', 'active', 0.00, 'PHP', 'system',
                            1, 20, 30, 0, TRUE, %s, %s, %s)
                    ON CONFLICT (user_id) DO NOTHING
                ''', (user_id, now, trial_end, trial_grace))

                db.commit()
                role = 'owner'

        token = jwt.encode({
            'user_id': user_id,
            'role': role,
            'exp': datetime.utcnow() + timedelta(days=30)
        }, SECRET_KEY, algorithm='HS256')

        return jsonify({
            'success': True,
            'token': token,
            'user_id': user_id,
            'role': role
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

def record_login_notification(cur, db, user):
    """Inserts a farm-scoped login notification for all farms the user has access to."""
    try:
        user_id = user['id']
        full_name = f"{user.get('first_name') or ''} {user.get('last_name') or ''}".strip() or "User"
        role_raw = user.get('role') or 'member'
        role_label = role_raw.capitalize()
        now_str = datetime.now().strftime('%b %d, %Y at %I:%M %p')
        title = f"Welcome Back, {full_name}!"
        msg = f"{full_name} ({role_label}) logged in on {now_str}."

        cur.execute('''
            SELECT DISTINCT f.id FROM farms f
            LEFT JOIN farm_members fm ON fm.farm_id = f.id
            WHERE f.owner_id = %s OR fm.user_id = %s
        ''', (user_id, user_id))
        farm_rows = cur.fetchall()
        farm_ids = [r['id'] if isinstance(r, dict) else r[0] for r in farm_rows]

        for fid in farm_ids:
            cur.execute('''
                SELECT id FROM notifications 
                WHERE farm_id = %s AND user_id = %s AND title LIKE 'Welcome Back%%'
                  AND created_at >= NOW() - INTERVAL '1 MINUTE'
                LIMIT 1
            ''', (fid, user_id))
            if not cur.fetchone():
                cur.execute('''
                    INSERT INTO notifications 
                    (farm_id, user_id, title, message, type, chicken_id, chicken_name)
                    VALUES (%s, %s, %s, %s, 'info', NULL, NULL)
                ''', (fid, user_id, title, msg))
        db.commit()
        return {'title': title, 'message': msg, 'type': 'info'}
    except Exception as e:
        print(f"[AUTH] Login notification warning: {e}")
        return None

@app.route('/api/auth/login', methods=['POST'])
def login():
    ip = request.remote_addr or 'unknown'
    if is_rate_limited(f"login_ip:{ip}", max_requests=15, window_seconds=60):
        return jsonify({'error': 'Too many login attempts. Please wait 1 minute.'}), 429

    d = request.json or {}
    email = (d.get('email') or '').strip().lower()
    password = d.get('password') or ''
    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute(
                'SELECT * FROM users WHERE LOWER(email)=%s',
                (email,)
            )
            user = cur.fetchone()
            if not user or not verify_password(user['password_hash'], password):
                return jsonify({'error': 'Invalid email or password'}), 401

            # Transparently upgrade legacy SHA-256 hash to modern salted hash on successful login
            if not (str(user['password_hash']).startswith(('scrypt:', 'pbkdf2:')) or '$' in str(user['password_hash'])):
                new_hash = hash_password(password)
                cur.execute('UPDATE users SET password_hash=%s WHERE id=%s', (new_hash, user['id']))
                db.commit()

            # Check if user account is deactivated
            if user.get('is_active') is False:
                return jsonify({'error': 'Your account has been deactivated. Please contact your farm owner.'}), 403

            # For caretakers, verify active farm membership
            if user.get('role') == 'caretaker':
                cur.execute('''
                    SELECT fm.id, fm.is_active as member_active
                    FROM farm_members fm
                    WHERE fm.user_id = %s
                ''', (user['id'],))
                memberships = cur.fetchall()
                if not memberships:
                    return jsonify({'error': 'You are no longer assigned to any farm. Please contact your farm owner.'}), 403
                
                has_active = any(m.get('member_active') is not False for m in memberships)
                if not has_active:
                    return jsonify({'error': 'Your caretaker account has been deactivated. Please contact your farm owner.'}), 403

            notif = record_login_notification(cur, db, user)
            from routes_subscriptions import get_effective_subscription
            sub_info = get_effective_subscription(user['id'], cur, db)

        token = jwt.encode({
            'user_id': user['id'],
            'role': user.get('role', 'owner'),
            'exp': datetime.utcnow() + timedelta(days=30)
        }, SECRET_KEY, algorithm='HS256')

        user.pop('password_hash', None)
        return jsonify({
            'success': True,
            'token': token,
            'user': user,
            'notification': notif,
            'subscription': sub_info
        })
    finally:
        db.close()

@app.route('/api/auth/google', methods=['POST'])
def google_auth():
    """
    Authenticate or auto-provision a user with Google profile information.
    Expects JSON: { email, first_name, last_name, picture, google_id }
    """
    d = request.json or {}
    email = (d.get('email') or '').strip().lower()
    if not email:
        return jsonify({'error': 'Google email is required'}), 400

    raw_first = (d.get('first_name') or d.get('given_name') or '').strip()
    raw_last = (d.get('last_name') or d.get('family_name') or '').strip()
    full_name = (d.get('name') or '').strip()
    phone = (d.get('phone') or d.get('phone_number') or '').strip()

    if not raw_first and full_name:
        parts = full_name.split()
        raw_first = parts[0]
        raw_last = ' '.join(parts[1:]) if len(parts) > 1 else ''
    elif raw_first and not raw_last and full_name:
        parts = full_name.split()
        if len(parts) > 1 and parts[0].lower() == raw_first.lower():
            raw_last = ' '.join(parts[1:])

    first_name = raw_first if raw_first else 'Google'
    last_name = raw_last if (raw_last and raw_last.lower() != 'user') else ''
    farm_name = d.get('farm_name') or f"{first_name}'s Farm"

    db = get_db()
    try:
        with db.cursor() as cur:
            # Check if user already exists
            cur.execute('SELECT * FROM users WHERE email=%s', (email,))
            user = cur.fetchone()

            if user:
                # Existing user logging in
                if user.get('is_active') is False:
                    return jsonify({'error': 'Your account has been deactivated. Please contact your farm owner.'}), 403
                user_id = user['id']
                role = user.get('role') or 'owner'
                is_new_user = False

                # Auto-heal profile: remove 'User' as last_name, update phone or profile image if available
                updates = []
                params = []
                cur_last = (user.get('last_name') or '').strip()
                cur_first = (user.get('first_name') or '').strip()

                if cur_last.lower() == 'user':
                    updates.append("last_name = %s")
                    params.append(last_name)
                elif not cur_last and last_name:
                    updates.append("last_name = %s")
                    params.append(last_name)

                if (cur_first.lower() == 'google' or not cur_first) and first_name:
                    updates.append("first_name = %s")
                    params.append(first_name)

                if phone and not user.get('phone_number'):
                    updates.append("phone_number = %s")
                    params.append(phone)

                if d.get('picture') and not user.get('profile_image'):
                    updates.append("profile_image = %s")
                    params.append(d['picture'])

                if updates:
                    params.append(user_id)
                    cur.execute(f"UPDATE users SET {', '.join(updates)} WHERE id=%s", tuple(params))
                    db.commit()
                    cur.execute('SELECT * FROM users WHERE id=%s', (user_id,))
                    user = cur.fetchone()
            else:
                # New user registering via Google OAuth
                is_new_user = True
                random_pw = secrets.token_urlsafe(32)
                pw_hash = hash_password(random_pw)

                cur.execute('''
                    INSERT INTO users
                    (first_name, last_name, email, password_hash,
                     farm_name, farm_location, role, phone_number)
                    VALUES (%s,%s,%s,%s,NULL,NULL,'owner',%s)
                ''', (first_name, last_name, email, pw_hash, phone or None))
                db.commit()
                user_id = cur.lastrowid

                # Auto-provision 30-day Free Trial for new Google users (starts with 0 farms)
                now = datetime.utcnow()
                trial_end = now + timedelta(days=30)
                trial_grace = trial_end + timedelta(days=7)
                cur.execute('''
                    INSERT INTO subscriptions
                    (user_id, plan, status, price_paid, currency, payment_gateway,
                     max_farms, max_chickens_per_farm, max_captures, captures_used,
                     free_trial_used, start_date, end_date, grace_period_end)
                    VALUES (%s, 'free_trial', 'active', 0.00, 'PHP', 'google_oauth',
                            1, 20, 30, 0, TRUE, %s, %s, %s)
                    ON CONFLICT (user_id) DO NOTHING
                ''', (user_id, now, trial_end, trial_grace))

                if d.get('picture'):
                    cur.execute('UPDATE users SET profile_image=%s WHERE id=%s', (d['picture'], user_id))

                db.commit()
                role = 'owner'

                cur.execute('SELECT * FROM users WHERE id=%s', (user_id,))
                user = cur.fetchone()

            notif = None
            if user:
                notif = record_login_notification(cur, db, user)

            from routes_subscriptions import get_effective_subscription
            sub_info = get_effective_subscription(user_id, cur, db)

        token = jwt.encode({
            'user_id': user_id,
            'role': role,
            'exp': datetime.utcnow() + timedelta(days=30)
        }, SECRET_KEY, algorithm='HS256')

        if user:
            user.pop('password_hash', None)

        return jsonify({
            'success': True,
            'token': token,
            'user_id': user_id,
            'role': role,
            'user': user,
            'is_new_user': is_new_user,
            'notification': notif,
            'subscription': sub_info
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

@app.route('/api/auth/create-caretaker', methods=['POST'])
@token_required
def create_caretaker():
    """Owner creates a caretaker account and assigns to a farm"""
    db = get_db()
    try:
        with db.cursor() as cur:
            # Verify requester is owner
            cur.execute('SELECT role FROM users WHERE id=%s', (request.user_id,))
            user = cur.fetchone()
            if user['role'] != 'owner':
                return jsonify({'error': 'Only owners can create caretaker accounts'}), 403

            d = request.json or {}
            first_name = str(d.get('first_name', '')).strip()
            last_name = str(d.get('last_name', '')).strip()
            email_clean = str(d.get('email', '')).strip().lower()
            password = str(d.get('password', ''))
            farm_id = d.get('farm_id')

            if not first_name or len(first_name) > 100:
                return jsonify({'error': 'First name is required (maximum 100 characters)'}), 400
            if not last_name or len(last_name) > 100:
                return jsonify({'error': 'Last name is required (maximum 100 characters)'}), 400
            if not is_valid_email(email_clean):
                return jsonify({'error': 'A valid email address is required'}), 400
            if len(password) < 8 or len(password) > 128:
                return jsonify({'error': 'Password must be between 8 and 128 characters long'}), 400
            if not farm_id:
                return jsonify({'error': 'farm_id is required'}), 400

            phone_clean = str(d.get('phone_number', '')).strip()[:30]

            # Verify owner owns this farm
            cur.execute(
                'SELECT id FROM farms WHERE id=%s AND owner_id=%s',
                (farm_id, request.user_id)
            )
            if not cur.fetchone():
                return jsonify({'error': 'Farm not found or no access'}), 403

            # Check email not taken
            cur.execute('SELECT id FROM users WHERE LOWER(email)=%s', (email_clean,))
            if cur.fetchone():
                return jsonify({'error': 'Email already registered'}), 400

            # Create caretaker account
            pw_hash = hash_password(password)
            cur.execute('''
                INSERT INTO users
                (first_name, last_name, email, password_hash, phone_number, role)
                VALUES (%s, %s, %s, %s, %s, 'caretaker')
            ''', (
                first_name,
                last_name,
                email_clean,
                pw_hash,
                phone_clean
            ))
            caretaker_id = cur.lastrowid

            # Assign to farm
            cur.execute('''
                INSERT INTO farm_members (farm_id, user_id, role)
                VALUES (%s, %s, 'caretaker')
            ''', (d['farm_id'], caretaker_id))

            db.commit()

            cur.execute('''
                SELECT id, first_name, last_name, email, phone_number, role
                FROM users WHERE id=%s
            ''', (caretaker_id,))
            caretaker = cur.fetchone()

        return jsonify({'success': True, 'caretaker': caretaker})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

@app.route('/api/auth/profile', methods=['GET'])
@token_required
def get_profile():
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT id,first_name,last_name,email,phone_number,profile_image,farm_name,farm_location,role,is_active,created_at FROM users WHERE id=%s', (request.user_id,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404

            if user.get('is_active') is False:
                return jsonify({'error': 'Your account has been deactivated. Please contact your farm owner.'}), 403

            if user.get('role') == 'caretaker':
                cur.execute('SELECT fm.is_active FROM farm_members fm WHERE fm.user_id=%s', (request.user_id,))
                memberships = cur.fetchall()
                if not memberships:
                    return jsonify({'error': 'You are no longer assigned to any farm. Please contact your farm owner.'}), 403
                if not any(m.get('is_active') is not False for m in memberships):
                    return jsonify({'error': 'Your caretaker account has been deactivated. Please contact your farm owner.'}), 403

            # Resolve active farm_name and farm_location directly from farms / farm_members
            if user.get('role') == 'owner':
                cur.execute('SELECT farm_name, farm_location FROM farms WHERE owner_id=%s ORDER BY created_at ASC LIMIT 1', (request.user_id,))
                f = cur.fetchone()
                if f:
                    user['farm_name'] = f['farm_name']
                    user['farm_location'] = f.get('farm_location') or ''
                else:
                    user['farm_name'] = ''
                    user['farm_location'] = ''
            else:
                cur.execute('''
                    SELECT f.farm_name, f.farm_location 
                    FROM farms f
                    JOIN farm_members fm ON fm.farm_id = f.id
                    WHERE fm.user_id=%s
                    ORDER BY fm.joined_at ASC LIMIT 1
                ''', (request.user_id,))
                f = cur.fetchone()
                if f:
                    user['farm_name'] = f['farm_name']
                    user['farm_location'] = f.get('farm_location') or ''
                else:
                    user['farm_name'] = ''
                    user['farm_location'] = ''

            return jsonify(user)
    finally:
        db.close()

@app.route('/api/auth/profile', methods=['PUT'])
@token_required
def update_profile():
    d = request.json or {}
    allowed_limits = {
        'first_name': 100,
        'last_name': 100,
        'phone_number': 30,
        'farm_name': 100,
        'farm_location': 255
    }
    updates = {}
    for k, max_len in allowed_limits.items():
        if k in d and d[k] is not None:
            val = str(d[k]).strip()[:max_len]
            updates[k] = val

    if not updates:
        return jsonify({'error': 'Nothing to update'}), 400
    db = get_db()
    try:
        set_clause = ', '.join(f'{k}=%s' for k in updates)
        with db.cursor() as cur:
            cur.execute(f'UPDATE users SET {set_clause} WHERE id=%s', (*updates.values(), request.user_id))

            # If owner updated farm_name or farm_location, sync with their primary farm if exists
            if 'farm_name' in updates or 'farm_location' in updates:
                cur.execute('SELECT role FROM users WHERE id=%s', (request.user_id,))
                u = cur.fetchone()
                if u and u.get('role') == 'owner':
                    cur.execute('SELECT id FROM farms WHERE owner_id=%s ORDER BY created_at ASC LIMIT 1', (request.user_id,))
                    primary_farm = cur.fetchone()
                    if primary_farm:
                        farm_updates = []
                        farm_vals = []
                        if 'farm_name' in updates and updates['farm_name']:
                            farm_updates.append('farm_name=%s')
                            farm_vals.append(updates['farm_name'])
                        if 'farm_location' in updates and updates['farm_location']:
                            farm_updates.append('farm_location=%s')
                            farm_vals.append(updates['farm_location'])
                        if farm_updates:
                            farm_vals.append(primary_farm['id'])
                            cur.execute(f"UPDATE farms SET {', '.join(farm_updates)} WHERE id=%s", farm_vals)

            db.commit()
        return jsonify({'success': True})
    finally:
        db.close()

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    auth_header = request.headers.get('Authorization', '').strip()
    if auth_header:
        token = auth_header.replace('Bearer ', '').strip()
        revoke_token(token)
    return jsonify({'success': True, 'message': 'Logged out successfully'})

@app.route('/api/auth/account', methods=['DELETE'])
@token_required
def delete_account():
    """
    Permanently deletes user account and personal data pursuant to
    Philippine RA 10173 Section 16(e) (Right to Erasure) and
    Google Play Account Deletion Policy.
    """
    user_id = request.user_id
    auth_header = request.headers.get('Authorization', '').strip()
    if auth_header:
        token = auth_header.replace('Bearer ', '').strip()
        revoke_token(token)

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT id, role FROM users WHERE id = %s', (user_id,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404

            # 1. Clean notification reads & direct notifications
            cur.execute('DELETE FROM notification_reads WHERE user_id = %s', (user_id,))
            cur.execute('DELETE FROM notifications WHERE user_id = %s', (user_id,))

            # 2. Clean QR scans
            cur.execute('DELETE FROM qr_scans WHERE user_id = %s', (user_id,))

            # 3. Clean health history and image captures
            cur.execute('DELETE FROM health_history WHERE user_id = %s', (user_id,))
            cur.execute('DELETE FROM image_captures WHERE user_id = %s', (user_id,))

            # 4. Clean tasks
            cur.execute('DELETE FROM tasks WHERE created_by_user_id = %s OR assigned_to_user_id = %s', (user_id, user_id))

            # 5. Clean subscriptions
            cur.execute('DELETE FROM subscriptions WHERE user_id = %s', (user_id,))

            # 6. Clean farm members
            cur.execute('DELETE FROM farm_members WHERE user_id = %s', (user_id,))

            # 7. Clean owned farms and their nested dependencies
            cur.execute('SELECT id FROM farms WHERE owner_id = %s', (user_id,))
            owned_farms = cur.fetchall()
            for f in owned_farms:
                fid = f['id'] if isinstance(f, dict) else f[0]
                cur.execute('DELETE FROM tasks WHERE farm_id = %s', (fid,))
                cur.execute('DELETE FROM notifications WHERE farm_id = %s', (fid,))
                cur.execute('DELETE FROM chickens WHERE farm_id = %s', (fid,))
                cur.execute('DELETE FROM farm_members WHERE farm_id = %s', (fid,))
                cur.execute('DELETE FROM farms WHERE id = %s', (fid,))

            # 8. Clean chickens directly owned by user
            cur.execute('DELETE FROM chickens WHERE user_id = %s', (user_id,))

            # 9. Delete user record
            cur.execute('DELETE FROM users WHERE id = %s', (user_id,))

            db.commit()

        return jsonify({
            'success': True,
            'message': 'Account and all associated personal data permanently erased pursuant to RA 10173 Section 16(e).'
        })
    except Exception as e:
        db.rollback()
        return jsonify({'error': f'Failed to delete account: {str(e)}'}), 500
    finally:
        db.close()

@app.route('/api/legal/privacy-policy', methods=['GET'])
def get_privacy_policy():
    """
    Returns legal metadata and DPA compliance information under RA 10173.
    """
    return jsonify({
        'business_name': 'Clucko',
        'jurisdiction': 'Republic of the Philippines',
        'governing_law': 'Data Privacy Act of 2012 (Republic Act No. 10173)',
        'controller_address': 'Davao City, Philippines',
        'dpo_email': 'jasphertadlan@gmail.com',
        'minimum_age': 18,
        'data_collected': ['first_name', 'last_name', 'email', 'phone_number', 'farm_location', 'chicken_photos', 'qr_scans'],
        'purpose': 'AI-assisted poultry disease detection, digital flock health monitoring, and multi-farm coordination.',
        'veterinary_disclaimer': 'Clucko AI provides automated screening estimates for flock decision support. It does not provide clinical veterinary diagnoses under the Philippine Veterinary Medicine Act (RA 9286). Consult a licensed avian veterinarian.',
        'data_subject_rights': [
            'Right to be Informed (Section 16(a))',
            'Right to Access (Section 16(c))',
            'Right to Rectification (Section 16(d))',
            'Right to Erasure or Blocking (Section 16(e))',
            'Right to Data Portability (Section 18)'
        ],
        'deletion_mechanism': 'In-app via Profile -> Settings -> Danger Zone -> Delete Account, or by emailing jasphertadlan@gmail.com.'
    })

@app.route('/api/legal/terms', methods=['GET'])
def get_terms_of_service():
    """
    Returns legal Terms and Conditions metadata under Philippine Law.
    """
    return jsonify({
        'business_name': 'Clucko',
        'terms_version': '2026.1',
        'effective_date': '2026-09-28',
        'jurisdiction': 'Republic of the Philippines',
        'venue': 'Davao City',
        'support_email': 'jasphertadlan@gmail.com',
        'minimum_age': 18,
        'veterinary_disclaimer': 'Clucko is an AI decision-support tool and does not provide clinical veterinary diagnoses under the Philippine Veterinary Medicine Act (RA 9286). Always consult a PRC-licensed avian veterinarian.',
        'consumer_protection': 'Consumer Act of the Philippines (Republic Act No. 7394)',
        'biosecurity_compliance': 'Animal Welfare Act (RA 8485 as amended by RA 10631) and PD 449',
        'cancellation_policy': 'Subscriptions may be cancelled anytime via App Settings. Paid access continues until current billing cycle concludes.'
    })

@app.route('/api/auth/check-email', methods=['POST'])
def check_email():
    ip = request.remote_addr or 'unknown'
    if is_rate_limited(f"check_email:{ip}", max_requests=20, window_seconds=60):
        return jsonify({'error': 'Too many requests. Please wait a moment.'}), 429

    d = request.json or {}
    email = d.get('email', '').strip().lower()
    if not email or not is_valid_email(email):
        return jsonify({'error': 'A valid email address is required'}), 400
    
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT id, first_name, email FROM users WHERE LOWER(email) = %s', (email,))
            u = cur.fetchone()
            if u:
                return jsonify({'exists': True, 'name': u.get('first_name', '')})
            return jsonify({'exists': False})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

@app.route('/api/auth/send-reset-code', methods=['POST'])
def send_reset_code_api():
    import requests
    ip = request.remote_addr or 'unknown'
    d = request.json or {}
    email = d.get('email', '').strip().lower()
    if not email:
        return jsonify({'error': 'Email is required'}), 400

    if is_rate_limited(f"send_code:{ip}:{email}", max_requests=3, window_seconds=300):
        return jsonify({'error': 'Please wait 5 minutes before requesting another verification code.'}), 429

    # Generate cryptographically secure 6-digit verification code server-side
    # If client passed a code (e.g. from mobile app), we accept and register it; otherwise generate secure random code
    client_code = (d.get('code') or '').strip()
    code = client_code if (client_code and len(client_code) == 6 and client_code.isdigit()) else f"{secrets.SystemRandom().randint(100000, 999999):06d}"

    _RESET_CODES[email] = {
        'code': code,
        'expires_at': time.time() + 900,  # 15 minutes validity
        'attempts': 0
    }

    try:
        resp = requests.post(
            'https://api.emailjs.com/api/v1.0/email/send',
            headers={
                'Content-Type': 'application/json',
                'Origin': 'http://localhost',
            },
            json={
                'service_id': EMAILJS_SERVICE_ID,
                'template_id': EMAILJS_TEMPLATE_ID,
                'user_id': EMAILJS_USER_ID,
                'template_params': {
                    'to_email': email,
                    'code': code,
                },
            },
            timeout=10,
        )
        if resp.status_code == 200:
            return jsonify({'success': True, 'message': 'Verification code sent to email'})
        else:
            print(f"[AUTH] EmailJS response status: {resp.status_code}, detail: {resp.text}")
            return jsonify({'success': True, 'message': 'Verification code dispatched'}), 200
    except Exception as err:
        print(f"[AUTH] EmailJS dispatch error: {err}")
        return jsonify({'success': True, 'message': 'Verification code generated'}), 200

@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    ip = request.remote_addr or 'unknown'
    if is_rate_limited(f"reset_pw_ip:{ip}", max_requests=10, window_seconds=60):
        return jsonify({'error': 'Too many reset attempts. Please wait a moment.'}), 429

    d = request.json or {}
    email = d.get('email', '').strip().lower()
    code = (d.get('code') or '').strip()
    new_password = d.get('new_password', '')

    if not email or not new_password:
        return jsonify({'error': 'Email and new password are required'}), 400
    if len(new_password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters long'}), 400

    # Require and verify OTP code server-side
    if not code:
        return jsonify({'error': 'Verification code is required'}), 400

    record = _RESET_CODES.get(email)
    if not record:
        return jsonify({'error': 'No active verification code found for this email. Please request a new code.'}), 400

    if time.time() > record['expires_at']:
        _RESET_CODES.pop(email, None)
        return jsonify({'error': 'Verification code has expired. Please request a new code.'}), 400

    if record['attempts'] >= 5:
        _RESET_CODES.pop(email, None)
        return jsonify({'error': 'Too many failed verification attempts. Please request a new code.'}), 429

    record['attempts'] += 1

    if not hmac.compare_digest(record['code'], code):
        return jsonify({'error': 'Invalid verification code. Please check and try again.'}), 400

    # Single-use: immediately invalidate the code upon successful verification
    _RESET_CODES.pop(email, None)

    pw_hash = hash_password(new_password)

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT id, first_name, last_name, role FROM users WHERE LOWER(email) = %s', (email,))
            u = cur.fetchone()
            if not u:
                return jsonify({'error': 'No account found with this email'}), 404

            cur.execute('UPDATE users SET password_hash = %s WHERE id = %s', (pw_hash, u['id']))
            db.commit()

            return jsonify({
                'success': True,
                'message': 'Password has been successfully updated'
            })
    except Exception as e:
        db.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()