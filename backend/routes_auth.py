from flask import request, jsonify
import hashlib, jwt
from datetime import datetime, timedelta
from app import app
from db import get_db, token_required, SECRET_KEY

import random
import string

def generate_farm_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    d = request.json
    required = ['first_name', 'last_name', 'email', 'password']
    if not all(d.get(k) for k in required):
        return jsonify({'error': 'Missing required fields'}), 400

    pw_hash = hashlib.sha256(d['password'].encode()).hexdigest()
    farm_code_input = d.get('farm_code', '').strip().upper()

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT id FROM users WHERE email=%s', (d['email'],))
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
                    (first_name, last_name, email, password_hash, phone_number, farm_name, role)
                    VALUES (%s,%s,%s,%s,%s,%s,'caretaker')
                ''', (d['first_name'], d['last_name'], d['email'], pw_hash,
                      d.get('phone_number', ''), d.get('farm_name', '')))
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
                     phone_number, farm_name, farm_location, role)
                    VALUES (%s,%s,%s,%s,%s,NULL,NULL,'owner')
                ''', (d['first_name'], d['last_name'], d['email'], pw_hash,
                      d.get('phone_number', '')))
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
                  AND created_at >= NOW() - INTERVAL 1 MINUTE
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
    d = request.json
    if not d.get('email') or not d.get('password'):
        return jsonify({'error': 'Email and password required'}), 400

    pw_hash = hashlib.sha256(d['password'].encode()).hexdigest()
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute(
                'SELECT * FROM users WHERE email=%s AND password_hash=%s',
                (d['email'], pw_hash)
            )
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'Invalid email or password'}), 401

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
                random_pw = ''.join(random.choices(string.ascii_letters + string.digits, k=32))
                pw_hash = hashlib.sha256(random_pw.encode()).hexdigest()

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

            d = request.json
            required = ['first_name', 'last_name', 'email', 'password', 'farm_id']
            if not all(d.get(k) for k in required):
                return jsonify({'error': 'Missing required fields'}), 400

            # Verify owner owns this farm
            cur.execute(
                'SELECT id FROM farms WHERE id=%s AND owner_id=%s',
                (d['farm_id'], request.user_id)
            )
            if not cur.fetchone():
                return jsonify({'error': 'Farm not found or no access'}), 403

            # Check email not taken
            cur.execute('SELECT id FROM users WHERE email=%s', (d['email'],))
            if cur.fetchone():
                return jsonify({'error': 'Email already registered'}), 400

            # Create caretaker account
            pw_hash = hashlib.sha256(d['password'].encode()).hexdigest()
            cur.execute('''
                INSERT INTO users
                (first_name, last_name, email, password_hash, phone_number, role)
                VALUES (%s, %s, %s, %s, %s, 'caretaker')
            ''', (
                d['first_name'].strip(),
                d['last_name'].strip(),
                d['email'].strip().lower(),
                pw_hash,
                d.get('phone_number', '')
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
    d = request.json
    allowed = ['first_name','last_name','phone_number','farm_name','farm_location']
    updates = {k:v for k,v in d.items() if k in allowed}
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
    return jsonify({'success': True})

@app.route('/api/auth/check-email', methods=['POST'])
def check_email():
    d = request.json or {}
    email = d.get('email', '').strip().lower()
    if not email:
        return jsonify({'error': 'Email is required'}), 400
    
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

@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    d = request.json or {}
    email = d.get('email', '').strip().lower()
    new_password = d.get('new_password', '')

    if not email or not new_password:
        return jsonify({'error': 'Email and new password are required'}), 400
    if len(new_password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    pw_hash = hashlib.sha256(new_password.encode()).hexdigest()

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

@app.route('/api/auth/send-reset-code', methods=['POST'])
def send_reset_code_api():
    import requests
    d = request.json or {}
    email = d.get('email', '').strip().lower()
    code = d.get('code', '').strip()
    if not email or not code:
        return jsonify({'error': 'Email and code are required'}), 400

    try:
        resp = requests.post(
            'https://api.emailjs.com/api/v1.0/email/send',
            headers={
                'Content-Type': 'application/json',
                'Origin': 'http://localhost',
            },
            json={
                'service_id': 'service_lzrjxzb',
                'template_id': 'template_u0b0yl9',
                'user_id': 'lJJPMqktLrmyBcQBJ',
                'template_params': {
                    'to_email': email,
                    'code': code,
                },
            },
            timeout=10,
        )
        if resp.status_code == 200:
            return jsonify({'success': True, 'message': 'Code sent to email'})
        else:
            return jsonify({'success': False, 'error': resp.text}), resp.status_code
    except Exception as err:
        return jsonify({'error': str(err)}), 500