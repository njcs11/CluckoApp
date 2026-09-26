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
                # Owner path — generate farm code
                while True:
                    code = generate_farm_code()
                    cur.execute('SELECT id FROM farms WHERE farm_code=%s', (code,))
                    if not cur.fetchone():
                        break

                cur.execute('''
                    INSERT INTO users
                    (first_name, last_name, email, password_hash,
                     phone_number, farm_name, farm_location, role)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,'owner')
                ''', (d['first_name'], d['last_name'], d['email'], pw_hash,
                      d.get('phone_number', ''),
                      d.get('farm_name', f"{d['first_name']}'s Farm"),
                      d.get('farm_location', 'Davao City')))
                db.commit()
                user_id = cur.lastrowid

                # Auto-create first farm for owner
                cur.execute('''
                    INSERT INTO farms (owner_id, farm_name, farm_location, farm_code)
                    VALUES (%s, %s, %s, %s)
                ''', (user_id,
                      d.get('farm_name', f"{d['first_name']}'s Farm"),
                      d.get('farm_location', 'Davao City'),
                      code))
                farm_id = cur.lastrowid

                cur.execute('''
                    INSERT INTO farm_members (farm_id, user_id, role)
                    VALUES (%s, %s, 'owner')
                ''', (farm_id, user_id))

                # Auto-provision 30-Day Free Trial
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

    first_name = (d.get('first_name') or d.get('given_name') or 'Google').strip()
    last_name = (d.get('last_name') or d.get('family_name') or 'User').strip()
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
            else:
                # New user registering via Google OAuth
                is_new_user = True
                random_pw = ''.join(random.choices(string.ascii_letters + string.digits, k=32))
                pw_hash = hashlib.sha256(random_pw.encode()).hexdigest()

                while True:
                    code = generate_farm_code()
                    cur.execute('SELECT id FROM farms WHERE farm_code=%s', (code,))
                    if not cur.fetchone():
                        break

                cur.execute('''
                    INSERT INTO users
                    (first_name, last_name, email, password_hash,
                     farm_name, farm_location, role)
                    VALUES (%s,%s,%s,%s,%s,%s,'owner')
                ''', (first_name, last_name, email, pw_hash,
                      farm_name, 'Davao City'))
                db.commit()
                user_id = cur.lastrowid

                # Auto-create first farm for owner
                cur.execute('''
                    INSERT INTO farms (owner_id, farm_name, farm_location, farm_code)
                    VALUES (%s, %s, %s, %s)
                ''', (user_id, farm_name, 'Davao City', code))
                farm_id = cur.lastrowid

                cur.execute('''
                    INSERT INTO farm_members (farm_id, user_id, role)
                    VALUES (%s, %s, 'owner')
                ''', (farm_id, user_id))

                # Auto-provision 30-day Free Trial for new Google users
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

            # If user has no explicit farm_name or farm_location, resolve dynamically from farms / farm_members
            if not user.get('farm_name'):
                if user.get('role') == 'owner':
                    cur.execute('SELECT farm_name, farm_location FROM farms WHERE owner_id=%s ORDER BY created_at ASC LIMIT 1', (request.user_id,))
                    f = cur.fetchone()
                    if f:
                        user['farm_name'] = f['farm_name']
                        if not user.get('farm_location'):
                            user['farm_location'] = f.get('farm_location', '')
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
                        if not user.get('farm_location'):
                            user['farm_location'] = f.get('farm_location', '')

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