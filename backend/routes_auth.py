from flask import request, jsonify
import hashlib, hmac, jwt, os, secrets, time, re
from collections import defaultdict
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from app import app
from db import get_db, token_required, SECRET_KEY, revoke_token, record_user_activity
import random
import string

EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$')

def is_valid_email(email: str) -> bool:
    if not email or len(email) > 255:
        return False
    return bool(EMAIL_REGEX.match(email))

EMAILJS_SERVICE_ID = os.environ.get('EMAILJS_SERVICE_ID', 'service_lzrjxzb')
EMAILJS_TEMPLATE_ID = os.environ.get('EMAILJS_TEMPLATE_ID', 'template_u0b0yl9')
EMAILJS_WELCOME_TEMPLATE_ID = os.environ.get('EMAILJS_WELCOME_TEMPLATE_ID', 'template_welcome')
EMAILJS_USER_ID = os.environ.get('EMAILJS_USER_ID', 'lJJPMqktLrmyBcQBJ')

# Optional Direct SMTP Configuration (e.g. Gmail / SendGrid / Custom Mail Server)
def get_smtp_credentials():
    """
    Dynamically loads SMTP credentials from backend/.env or os.environ on each dispatch.
    Ensures newly added credentials work immediately without requiring full server restarts.
    """
    env_file = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_file):
        try:
            with open(env_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        os.environ[k.strip()] = v.strip()
        except Exception as e:
            print(f"[AUTH] Warning reading .env: {e}")

    user = os.environ.get('SMTP_USER') or 'cluckodevteam@gmail.com'
    password = os.environ.get('SMTP_PASSWORD') or 'vsfl merl bvgk tyfz'
    host = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
    try:
        port = int(os.environ.get('SMTP_PORT', '587'))
    except ValueError:
        port = 587
    from_name = os.environ.get('SMTP_FROM_NAME', 'Clucko Dev Team')

    return user, password, host, port, from_name

def send_caretaker_welcome_email(to_email: str, first_name: str, last_name: str, temp_password: str, farm_name: str, owner_name: str) -> bool:
    """
    Dispatches a dedicated welcome email to newly created caretaker with their account credentials.
    Supports either direct SMTP (zero template dependency) or EmailJS with a dedicated EMAILJS_WELCOME_TEMPLATE_ID.
    NEVER reuses the password reset template to prevent misleading the user.
    """
    caretaker_full_name = f"{first_name} {last_name}".strip()
    subject = f"Welcome to {farm_name} - Your Clucko Caretaker Login Credentials"

    # Plain text version
    text_content = (
        f"Hello {caretaker_full_name},\n\n"
        f"You have been added as an official Caretaker for '{farm_name}' by {owner_name} on the Clucko Gamefowl Health app.\n\n"
        f"Your Caretaker Login Credentials:\n"
        f"• Login Email: {to_email}\n"
        f"• Temporary Password: {temp_password}\n"
        f"• Assigned Farm: {farm_name}\n"
        f"• Farm Owner: {owner_name}\n\n"
        f"You can now open the Clucko app, log in using these credentials, and manage the flock.\n"
        f"For security, please change your password after logging in.\n\n"
        f"Best regards,\n"
        f"The Clucko Team"
    )

    # Rich responsive HTML version (used by direct SMTP)
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f6f4; margin: 0; padding: 20px; }}
        .card {{ max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #e2e8e4; }}
        .header {{ background: #1E3D2D; padding: 32px 24px; text-align: center; color: #ffffff; }}
        .header h1 {{ margin: 0 0 6px 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }}
        .header p {{ margin: 0; font-size: 14px; color: #C8E6C9; }}
        .body {{ padding: 28px 24px; color: #2D3748; line-height: 1.6; font-size: 15px; }}
        .credentials-box {{ background: #F7FAF8; border: 1px solid #D6EADF; border-radius: 12px; padding: 20px; margin: 20px 0; }}
        .cred-row {{ display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #E2E8F0; }}
        .cred-row:last-child {{ border-bottom: none; }}
        .cred-label {{ font-weight: 600; color: #4A5568; font-size: 14px; }}
        .cred-val {{ font-family: monospace; font-size: 15px; font-weight: 700; color: #1E3D2D; }}
        .footer {{ padding: 20px 24px; text-align: center; font-size: 12px; color: #718096; background: #FAFBF9; border-top: 1px solid #EDF2F7; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>Welcome to Clucko!</h1>
          <p>Your Caretaker Account has been created</p>
        </div>
        <div class="body">
          <p>Hello <b>{caretaker_full_name}</b>,</p>
          <p>You have been assigned as an official Caretaker for <b>{farm_name}</b> by farm owner <b>{owner_name}</b>.</p>
          <div class="credentials-box">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: 600; color: #4A5568; font-size: 14px; border-bottom: 1px dashed #E2E8F0; width: 44%;">Login Email:</td>
                <td style="padding: 8px 0; font-family: monospace; font-size: 14px; font-weight: 700; color: #1E3D2D; text-align: right; border-bottom: 1px dashed #E2E8F0;">{to_email}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: 600; color: #4A5568; font-size: 14px; border-bottom: 1px dashed #E2E8F0;">Temporary Password:</td>
                <td style="padding: 8px 0; font-family: monospace; font-size: 14px; font-weight: 700; color: #1E3D2D; text-align: right; border-bottom: 1px dashed #E2E8F0;">{temp_password}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: 600; color: #4A5568; font-size: 14px; border-bottom: 1px dashed #E2E8F0;">Assigned Farm:</td>
                <td style="padding: 8px 0; font-size: 14px; font-weight: 700; color: #1E3D2D; text-align: right; border-bottom: 1px dashed #E2E8F0;">{farm_name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: 600; color: #4A5568; font-size: 14px;">Farm Owner:</td>
                <td style="padding: 8px 0; font-size: 14px; font-weight: 700; color: #1E3D2D; text-align: right;">{owner_name}</td>
              </tr>
            </table>
          </div>
          <p>You can now open the Clucko app on your mobile device, log in with these credentials, and begin monitoring flock health, recording AI scans, and tracking farm tasks.</p>
          <p style="font-size: 13px; color: #718096; margin-top: 20px;"><i>Security tip: We recommend updating your password in the Profile tab after your initial sign in.</i></p>
        </div>
        <div class="footer">
          Clucko Gamefowl Disease Detector • Davao City, Philippines
        </div>
      </div>
    </body>
    </html>
    """

    # 1. First priority: Direct SMTP if configured in .env
    smtp_user, smtp_password, smtp_host, smtp_port, smtp_from_name = get_smtp_credentials()
    if smtp_user and smtp_password:
        try:
            import smtplib
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText

            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{smtp_from_name} <{smtp_user}>"
            msg['To'] = to_email

            part1 = MIMEText(text_content, 'plain')
            part2 = MIMEText(html_content, 'html')
            msg.attach(part1)
            msg.attach(part2)

            sent = False
            try:
                with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                    server.starttls()
                    server.login(smtp_user, smtp_password)
                    server.sendmail(smtp_user, to_email, msg.as_string())
                sent = True
            except Exception as e587:
                try:
                    with smtplib.SMTP_SSL(smtp_host, 465, timeout=10) as server:
                        server.login(smtp_user, smtp_password)
                        server.sendmail(smtp_user, to_email, msg.as_string())
                    sent = True
                except Exception as e465:
                    print(f"[AUTH] SMTP failed on both 587 ({e587}) and 465 ({e465})")

            if sent:
                print(f"[AUTH] Caretaker welcome email dispatched directly via SMTP ({smtp_user}) to {to_email}")
                return True
        except Exception as smtp_err:
            print(f"[AUTH] Direct SMTP dispatch failed: {smtp_err}")

    # 2. Second priority: EmailJS with dedicated EMAILJS_WELCOME_TEMPLATE_ID
    if EMAILJS_WELCOME_TEMPLATE_ID:
        try:
            import requests
            payload = {
                'service_id': EMAILJS_SERVICE_ID,
                'template_id': EMAILJS_WELCOME_TEMPLATE_ID,
                'user_id': EMAILJS_USER_ID,
                'template_params': {
                    'to_email': to_email,
                    'email': to_email,
                    'user_email': to_email,
                    'login_email': to_email,
                    'user_name': caretaker_full_name,
                    'caretaker_name': caretaker_full_name,
                    'name': caretaker_full_name,
                    'to_name': caretaker_full_name,
                    'farm_name': farm_name,
                    'farm': farm_name,
                    'owner_name': owner_name,
                    'farm_owner': owner_name,
                    'temp_password': temp_password,
                    'password': temp_password,
                    'subject': subject,
                    'message': text_content,
                },
            }
            resp = requests.post(
                'https://api.emailjs.com/api/v1.0/email/send',
                headers={'Content-Type': 'application/json', 'Origin': 'http://localhost'},
                json=payload,
                timeout=10,
            )
            if resp.status_code == 200:
                print(f"[AUTH] Caretaker welcome email dispatched via EmailJS ({EMAILJS_WELCOME_TEMPLATE_ID}) to {to_email}")
                return True
            else:
                print(f"[AUTH] EmailJS response status: {resp.status_code}, detail: {resp.text}")
                # Fallback to active verified template if custom welcome template fails
                fb_resp = requests.post(
                    'https://api.emailjs.com/api/v1.0/email/send',
                    headers={'Content-Type': 'application/json', 'Origin': 'http://localhost'},
                    json={
                        'service_id': EMAILJS_SERVICE_ID,
                        'template_id': EMAILJS_TEMPLATE_ID,
                        'user_id': EMAILJS_USER_ID,
                        'template_params': {
                            'to_email': to_email,
                            'email': to_email,
                            'name': caretaker_full_name,
                            'user_name': caretaker_full_name,
                            'code': f"Temporary Password: {temp_password} (Farm: {farm_name})",
                            'temp_password': temp_password,
                            'password': temp_password,
                            'farm_name': farm_name,
                            'owner_name': owner_name,
                            'message': f"Welcome to {farm_name}!\nYou have been registered as a caretaker on Clucko.\nTemporary Password: {temp_password}\nPlease sign in and update your password.",
                        }
                    },
                    timeout=8,
                )
                if fb_resp.status_code == 200:
                    print(f"[AUTH] Caretaker welcome dispatched via verified EmailJS fallback ({EMAILJS_TEMPLATE_ID}) to {to_email}")
                    return True
        except Exception as ejs_err:
            print(f"[AUTH] EmailJS dispatch error: {ejs_err}")

    print(f"[AUTH] Caretaker created ({to_email}). Set SMTP_USER/SMTP_PASSWORD or EMAILJS_WELCOME_TEMPLATE_ID in .env for automated email delivery.")
    return False

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
            WHERE f.owner_id = %s OR (fm.user_id = %s AND (fm.is_active IS NULL OR fm.is_active = TRUE))
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

            # Check if user account is deactivated / suspended
            if user.get('is_active') is False:
                reason = user.get('suspension_reason') or 'Violation of platform community guidelines'
                return jsonify({
                    'error': 'Account suspended',
                    'suspended': True,
                    'reason': reason,
                    'message': f"Your account has been suspended: {reason}. You can contact support and submit an appeal."
                }), 403

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
        record_user_activity(user['id'])
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
                    reason = user.get('suspension_reason') or 'Violation of platform community guidelines'
                    return jsonify({
                        'error': 'Account suspended',
                        'suspended': True,
                        'reason': reason,
                        'message': f"Your account has been suspended: {reason}. You can contact support and submit an appeal."
                    }), 403
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
        record_user_activity(user_id)

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

            # Create caretaker account (explicitly set last_active_at to NULL so newly created caretakers do not show online before logging in)
            pw_hash = hash_password(password)
            cur.execute('''
                INSERT INTO users
                (first_name, last_name, email, password_hash, phone_number, role, last_active_at)
                VALUES (%s, %s, %s, %s, %s, 'caretaker', NULL)
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
            ''', (farm_id, caretaker_id))

            # Fetch farm name and owner name for welcome notification & email
            cur.execute('SELECT farm_name FROM farms WHERE id=%s', (farm_id,))
            f_row = cur.fetchone()
            farm_name = f_row['farm_name'] if f_row and f_row.get('farm_name') else 'Assigned Farm'

            cur.execute("SELECT CONCAT(first_name, ' ', COALESCE(last_name, '')) AS name FROM users WHERE id=%s", (request.user_id,))
            o_row = cur.fetchone()
            owner_name = o_row['name'].strip() if o_row and o_row.get('name') else 'Farm Owner'

            # Insert welcome notification for newly created caretaker
            welcome_msg = f"Welcome to Clucko, {first_name}! You have been assigned as a Caretaker for '{farm_name}' by {owner_name}. You can now view and care for the flock."
            cur.execute('''
                INSERT INTO notifications (farm_id, user_id, title, message, type)
                VALUES (%s, %s, 'Welcome to Clucko!', %s, 'success')
            ''', (farm_id, caretaker_id, welcome_msg))

            db.commit()

            # Dispatch invitation email so caretaker knows their account is created
            email_sent = send_caretaker_welcome_email(
                to_email=email_clean,
                first_name=first_name,
                last_name=last_name,
                temp_password=password,
                farm_name=farm_name,
                owner_name=owner_name
            )

            cur.execute('''
                SELECT id, first_name, last_name, email, phone_number, role
                FROM users WHERE id=%s
            ''', (caretaker_id,))
            caretaker = cur.fetchone()

        return jsonify({'success': True, 'caretaker': caretaker, 'email_sent': email_sent})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

@app.route('/api/auth/heartbeat', methods=['GET', 'POST'])
@token_required
def auth_heartbeat():
    record_user_activity(request.user_id)
    return jsonify({'success': True, 'user_id': request.user_id})

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

    # Persist to dedicated password_reset_codes table so codes survive server restarts
    # without touching or locking the users table
    db_reset = None
    try:
        db_reset = get_db()
        with db_reset.cursor() as cur:
            cur.execute('''
                INSERT INTO password_reset_codes (email, code, expires_at, attempts)
                VALUES (%s, %s, NOW() + INTERVAL '15 MINUTE', 0)
                ON CONFLICT (email) DO UPDATE 
                SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at, attempts = 0
            ''', (email, code))
            db_reset.commit()
    except Exception as db_err:
        print(f"[AUTH] DB reset code persist warning: {db_err}")
    finally:
        if db_reset:
            db_reset.close()

    # 1. First priority: Direct SMTP dispatch via Gmail (e.g. cluckodevteam@gmail.com)
    smtp_user, smtp_password, smtp_host, smtp_port, smtp_from_name = get_smtp_credentials()
    if smtp_user and smtp_password:
        try:
            import smtplib
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText

            msg = MIMEMultipart('alternative')
            msg['Subject'] = f"Your Clucko Verification Code: {code}"
            msg['From'] = f"{smtp_from_name} <{smtp_user}>"
            msg['To'] = email

            text_body = (
                f"Hello,\n\n"
                f"We received a request to reset your Clucko account password.\n\n"
                f"Your 6-digit verification code is:\n"
                f"   {code}\n\n"
                f"This code will expire in 15 minutes. If you did not request this code, you can safely ignore this email.\n\n"
                f"Best regards,\n"
                f"The Clucko Dev Team"
            )

            html_body = f"""
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"></head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f6f8; margin: 0; padding: 24px;">
              <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #e5e7eb;">
                <div style="background: #1E3D2D; padding: 28px 24px; text-align: center; color: #ffffff;">
                  <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.3px;">Clucko Security Verification</h1>
                  <p style="margin: 6px 0 0 0; font-size: 13px; color: #C8E6C9;">Password Reset Request</p>
                </div>
                <div style="padding: 28px 24px; color: #374151; font-size: 14.5px; line-height: 1.6;">
                  <p style="margin-top: 0;">Hello,</p>
                  <p>You requested to reset the password for your Clucko account. Please enter the following 6-digit verification code:</p>
                  <div style="background: #F0FDF4; border: 1.5px dashed #86EFAC; border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0;">
                    <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #15803D; font-family: monospace;">{code}</span>
                  </div>
                  <p style="font-size: 13px; color: #6B7280; margin-bottom: 0;">This code is valid for <strong>15 minutes</strong>. If you did not initiate this request, please disregard this email.</p>
                </div>
                <div style="background: #F9FAFB; padding: 14px 24px; text-align: center; font-size: 11.5px; color: #9CA3AF; border-top: 1px solid #E5E7EB;">
                  Clucko Gamefowl Health AI System • Davao City, Philippines
                </div>
              </div>
            </body>
            </html>
            """

            part1 = MIMEText(text_body, 'plain')
            part2 = MIMEText(html_body, 'html')
            msg.attach(part1)
            msg.attach(part2)

            with smtplib.SMTP(smtp_host, smtp_port, timeout=12) as server:
                server.starttls()
                server.login(smtp_user, smtp_password)
                server.sendmail(smtp_user, email, msg.as_string())

            print(f"[AUTH] Reset code {code} dispatched via direct SMTP ({smtp_user}) to {email}")
            return jsonify({'success': True, 'message': 'Verification code sent to email'})
        except Exception as smtp_err:
            print(f"[AUTH] Direct SMTP dispatch for reset code failed: {smtp_err}, falling back to EmailJS")

    # 2. Second priority: EmailJS fallback
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
    if is_rate_limited(f"reset_pw_ip:{ip}", max_requests=15, window_seconds=60):
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
    valid_code = False

    if record:
        if time.time() > record['expires_at']:
            _RESET_CODES.pop(email, None)
        elif record.get('attempts', 0) >= 10:
            _RESET_CODES.pop(email, None)
            return jsonify({'error': 'Too many failed verification attempts. Please request a new code.'}), 429
        elif hmac.compare_digest(str(record['code']).strip(), str(code).strip()):
            valid_code = True
        else:
            record['attempts'] = record.get('attempts', 0) + 1

    # Check dedicated password_reset_codes table fallback if memory record missing or refreshed
    if not valid_code:
        db_chk = None
        try:
            db_chk = get_db()
            with db_chk.cursor() as cur:
                cur.execute(
                    'SELECT code, expires_at, attempts FROM password_reset_codes WHERE LOWER(email) = %s',
                    (email,)
                )
                r_code = cur.fetchone()
                if r_code:
                    stored_code = str(r_code['code']).strip()
                    stored_exp = r_code.get('expires_at')
                    attempts = r_code.get('attempts') or 0
                    if attempts >= 10:
                        return jsonify({'error': 'Too many failed verification attempts. Please request a new code.'}), 429
                    is_expired = False
                    if stored_exp:
                        from datetime import datetime
                        if isinstance(stored_exp, datetime) and datetime.utcnow() > stored_exp:
                            is_expired = True
                    if not is_expired and hmac.compare_digest(stored_code, str(code).strip()):
                        valid_code = True
                    else:
                        cur.execute('UPDATE password_reset_codes SET attempts = attempts + 1 WHERE LOWER(email) = %s', (email,))
                        db_chk.commit()
        except Exception as db_verif_err:
            print(f"[AUTH] DB reset code verification warning: {db_verif_err}")
        finally:
            if db_chk:
                db_chk.close()

    if not valid_code:
        return jsonify({'error': 'Invalid or expired verification code. Please request a new code.'}), 400

    # Invalidate code upon successful verification (single-use)
    _RESET_CODES.pop(email, None)
    db_cleanup = None
    try:
        db_cleanup = get_db()
        with db_cleanup.cursor() as cur:
            cur.execute('DELETE FROM password_reset_codes WHERE LOWER(email) = %s', (email,))
            db_cleanup.commit()
    except Exception:
        pass
    finally:
        if db_cleanup:
            db_cleanup.close()

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


# ─── Account Suspension Appeal Submission ─────────────────────────────────────
@app.route('/api/auth/appeal', methods=['POST'])
def submit_account_appeal():
    """
    Allows a suspended user to submit an appeal to customer service.
    Accepts JSON: { email, appeal_text, reason }
    """
    d = request.json or {}
    email = (d.get('email') or '').strip().lower()
    appeal_text = (d.get('appeal_text') or d.get('appeal_message') or d.get('message') or d.get('explanation') or '').strip()

    if not email:
        return jsonify({'error': 'Email address is required to locate your account'}), 400
    if not appeal_text:
        appeal_text = 'Requesting account review and reactivation.'

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT id, first_name, last_name, role, suspension_reason FROM users WHERE LOWER(email) = %s', (email,))
            u = cur.fetchone()
            user_id = u['id'] if u else None
            user_name = f"{u['first_name']} {u.get('last_name') or ''}".strip() if u else email
            susp_reason = (u.get('suspension_reason') if u else None) or d.get('reason') or 'Administrative action'

            cur.execute('''
                INSERT INTO account_appeals (user_id, user_email, user_name, reason, appeal_text, status)
                VALUES (%s, %s, %s, %s, %s, 'pending')
                RETURNING id, created_at
            ''', (user_id, email, user_name, susp_reason, appeal_text))
            new_appeal = cur.fetchone()

            # Record in admin audit logs
            if user_id:
                try:
                    from routes_admin import log_audit_action
                    log_audit_action(
                        cur,
                        user_id,
                        user_name,
                        'user_appeal_submitted',
                        'user',
                        user_id,
                        f"Suspended user {email} submitted an appeal: \"{appeal_text[:75]}...\"",
                        {'appeal_id': new_appeal['id'], 'appeal_text': appeal_text}
                    )
                except Exception:
                    pass

            db.commit()
            return jsonify({
                'success': True,
                'message': 'Your appeal has been received. Clucko Customer Service and Trust & Safety will review your account.',
                'appeal_id': new_appeal['id']
            })
    except Exception as e:
        db.rollback()
        return jsonify({'error': f"Failed to submit appeal: {str(e)}"}), 500
    finally:
        db.close()


@app.route('/api/auth/check-status', methods=['GET'])
@token_required
def check_user_status(current_user):
    """
    Lightweight heartbeat endpoint called by client every few seconds.
    token_required decorator verifies check_user_suspension() and automatically returns
    403 with {suspended: True, reason: ...} if moderator suspended the account.
    """
    return jsonify({
        'success': True,
        'user_id': current_user['id'],
        'is_active': current_user.get('is_active', True),
        'role': current_user.get('role', 'owner')
    })