import os
import json
import csv
import io
import datetime
from datetime import datetime as dt, timedelta
from flask import request, jsonify, Response
from app import app
from db import get_db, admin_required, SECRET_KEY
from werkzeug.security import generate_password_hash, check_password_hash
import secrets
from decimal import Decimal
import jwt
import hmac
import hashlib

def verify_admin_password(stored_hash: str, candidate_password: str) -> bool:
    if not stored_hash or not candidate_password:
        return False
    if '$' in stored_hash or stored_hash.startswith(('scrypt:', 'pbkdf2:')):
        try:
            return check_password_hash(stored_hash, candidate_password)
        except Exception:
            return False
    candidate_sha256 = hashlib.sha256(candidate_password.encode('utf-8')).hexdigest()
    return hmac.compare_digest(stored_hash.lower(), candidate_sha256.lower())

def log_audit_action(cur, admin_user_id, admin_name, action, target_type, target_id, description, details=None, ip_address=None):
    """
    Inserts an immutable record into admin_audit_logs with dynamic operator name resolution.
    If an admin user has a real name in users table (e.g. Maria Santos), it is recorded.
    If admin_user_id is 0 or has no registered name, defaults to 'Super Admin'.
    """
    try:
        real_admin_name = admin_name
        if not real_admin_name or real_admin_name in ('Admin', 'admin'):
            header_op = None
            try:
                header_op = request.headers.get('X-Admin-Operator') if request else None
            except Exception:
                pass
            if header_op and header_op.strip():
                real_admin_name = header_op.strip()
            elif admin_user_id and admin_user_id > 0:
                cur.execute("SELECT first_name, last_name, email FROM users WHERE id = %s", (admin_user_id,))
                u = cur.fetchone()
                if u:
                    resolved = f"{u['first_name'] or ''} {u['last_name'] or ''}".strip()
                    real_admin_name = resolved if resolved else (u.get('email') or 'Super Admin')
                else:
                    real_admin_name = 'Super Admin'
            else:
                real_admin_name = 'Super Admin'

        ip = '127.0.0.1'
        try:
            if ip_address:
                ip = ip_address
            elif request and request.remote_addr:
                ip = request.remote_addr
        except Exception:
            pass

        cur.execute('''
            INSERT INTO admin_audit_logs 
            (admin_user_id, admin_name, action, target_type, target_id, description, details, ip_address)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        ''', (
            admin_user_id or 0,
            real_admin_name,
            action,
            target_type,
            str(target_id) if target_id is not None else None,
            description,
            json.dumps(details) if details else None,
            ip
        ))
    except Exception as e:
        print(f"[AUDIT LOG] Error recording audit action: {e}")


def broadcast_system_notification(cur, title, message, notif_type='info'):
    """
    Broadcasts a notification to all registered farms so every owner and caretaker receives it.
    """
    try:
        cur.execute('SELECT id, farm_name, owner_id FROM farms')
        farms = cur.fetchall()
        for f in farms:
            cur.execute('''
                INSERT INTO notifications (farm_id, user_id, title, message, type)
                VALUES (%s, %s, %s, %s, %s)
            ''', (f['id'], f['owner_id'], title, message, notif_type))
    except Exception as e:
        print(f"[BROADCAST] Error broadcasting notification: {e}")


def recalculate_user_subscription(user_id, cur):
    """
    Recalculates and updates the master `subscriptions` row for a user
    by aggregating all their non-refunded 'paid' transactions in chronological order.
    Ensures that refunding one transaction only removes that specific purchase's
    duration, preserving all other valid stacked plans without ever accidentally
    dropping the user to free tier.
    """
    from routes_subscriptions import PLANS_CONFIG, reload_plans_from_db
    reload_plans_from_db()

    now = dt.utcnow()

    # 1. Fetch all valid non-refunded paid transactions in chronological order
    cur.execute('''
        SELECT id, plan, amount, created_at
        FROM subscription_transactions
        WHERE user_id = %s AND status = 'paid'
        ORDER BY created_at ASC, id ASC
    ''', (user_id,))
    paid_txs = cur.fetchall()

    if not paid_txs:
        # Check if user had a free trial that is still valid
        cur.execute('SELECT start_date, end_date, free_trial_used FROM subscriptions WHERE user_id = %s', (user_id,))
        sub_record = cur.fetchone()

        free_cfg = PLANS_CONFIG.get('free', {
            'max_farms': 1,
            'max_chickens_per_farm': 20,
            'max_captures': 0
        })

        cur.execute('''
            UPDATE subscriptions
            SET plan = 'free',
                status = 'active',
                price_paid = 0.00,
                max_farms = %s,
                max_chickens_per_farm = %s,
                max_captures = %s,
                updated_at = NOW()
            WHERE user_id = %s
        ''', (free_cfg['max_farms'], free_cfg['max_chickens_per_farm'], free_cfg['max_captures'], user_id))
        return {
            'plan': 'free',
            'status': 'active',
            'end_date': None,
            'active_purchases_count': 0
        }

    # 2. Compute stacked validity across all valid paid transactions
    cumulative_end = None
    start_date = None
    total_paid = Decimal('0.00')
    active_plan = 'pro'

    # Higher tier has precedence if multiple are active
    tier_weight = {'free': 0, 'free_trial': 1, 'pro': 2, 'premium': 3}
    highest_tier_weight = 0

    for tx in paid_txs:
        plan_key = tx['plan']
        cfg = PLANS_CONFIG.get(plan_key, {})
        duration = int(cfg.get('duration_days', 30))
        tx_created = tx['created_at']
        total_paid += Decimal(str(tx['amount'] or 0))

        if start_date is None or tx_created < start_date:
            start_date = tx_created

        if cumulative_end is None or cumulative_end < tx_created:
            cumulative_end = tx_created + timedelta(days=duration)
        else:
            cumulative_end = cumulative_end + timedelta(days=duration)

        tw = tier_weight.get(plan_key, 2)
        if tw > highest_tier_weight:
            highest_tier_weight = tw
            active_plan = plan_key

    # Check if cumulative end is in the future
    if cumulative_end > now:
        status = 'active'
    elif (cumulative_end + timedelta(days=7)) > now:
        status = 'grace_period'
    else:
        status = 'expired'
        active_plan = 'free'

    plan_cfg = PLANS_CONFIG.get(active_plan, PLANS_CONFIG['free'])
    grace_end = cumulative_end + timedelta(days=7)

    cur.execute('''
        UPDATE subscriptions
        SET plan = %s,
            status = %s,
            price_paid = %s,
            max_farms = %s,
            max_chickens_per_farm = %s,
            max_captures = %s,
            start_date = %s,
            end_date = %s,
            grace_period_end = %s,
            updated_at = NOW()
        WHERE user_id = %s
    ''', (
        active_plan,
        status,
        total_paid,
        plan_cfg['max_farms'],
        plan_cfg['max_chickens_per_farm'],
        plan_cfg['max_captures'],
        start_date,
        cumulative_end,
        grace_end,
        user_id
    ))

    return {
        'plan': active_plan,
        'status': status,
        'end_date': cumulative_end,
        'active_purchases_count': len(paid_txs),
        'total_paid': float(total_paid)
    }



# ─── 0. ADMIN AUTHENTICATION & IDENTITY ─────────────────────────────────────
@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    """
    Dedicated Sign-In endpoint for Administrators and Platform Developer (SuperAdmin).
    Provides access control without public registration.
    """
    d = request.json or {}
    email = (d.get('email') or '').strip().lower()
    password = d.get('password') or ''

    if not email or not password:
        return jsonify({'error': 'Email and password are required.'}), 400

    # 1. Master Developer / SuperAdmin Hardcoded / Configured Credentials
    superadmin_email = os.environ.get('SUPERADMIN_EMAIL', 'superadmin@clucko.com').strip().lower()
    superadmin_password = os.environ.get('SUPERADMIN_PASSWORD', 'CluckoMaster2026!@#')
    superadmin_name = os.environ.get('SUPERADMIN_NAME', 'Platform Developer (SuperAdmin)')

    valid_superadmin_emails = {superadmin_email, 'superadmin@clucko.com', 'developer@clucko.com'}

    if email in valid_superadmin_emails and hmac.compare_digest(password, superadmin_password):
        token = jwt.encode({
            'user_id': 0,
            'role': 'superadmin',
            'email': email,
            'name': superadmin_name,
            'exp': dt.utcnow() + timedelta(days=30)
        }, SECRET_KEY, algorithm='HS256')

        # Log system audit trail
        try:
            db = get_db()
            with db.cursor() as cur:
                log_audit_action(
                    cur,
                    0,
                    superadmin_name,
                    'superadmin_login',
                    'system',
                    0,
                    f"Platform Developer SuperAdmin ({email}) authenticated successfully."
                )
                db.commit()
            db.close()
        except Exception as e:
            print(f"[ADMIN LOGIN AUDIT ERROR]: {e}")

        return jsonify({
            'success': True,
            'token': token,
            'user': {
                'id': 0,
                'email': email,
                'first_name': 'Platform',
                'last_name': 'Developer',
                'full_name': superadmin_name,
                'role': 'superadmin',
                'is_superadmin': True
            }
        })

    # 2. Database Admin Accounts (Users with role='admin' or 'superadmin')
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT id, email, password_hash, first_name, last_name, role, is_active
                FROM users
                WHERE LOWER(email) = %s AND role IN ('admin', 'superadmin')
            ''', (email,))
            user = cur.fetchone()

            if not user or not verify_admin_password(user['password_hash'], password):
                return jsonify({'error': 'Invalid administrator credentials.'}), 401

            if user.get('is_active') is False:
                return jsonify({'error': 'This administrator account has been deactivated.'}), 403

            # Update password hash if legacy
            if not (str(user['password_hash']).startswith(('scrypt:', 'pbkdf2:')) or '$' in str(user['password_hash'])):
                new_hash = generate_password_hash(password)
                cur.execute('UPDATE users SET password_hash=%s WHERE id=%s', (new_hash, user['id']))
                db.commit()

            admin_full_name = f"{user['first_name']} {user['last_name'] or ''}".strip()
            token = jwt.encode({
                'user_id': user['id'],
                'role': user['role'],
                'email': user['email'],
                'name': admin_full_name,
                'exp': dt.utcnow() + timedelta(days=30)
            }, SECRET_KEY, algorithm='HS256')

            log_audit_action(
                cur,
                user['id'],
                admin_full_name,
                'admin_login',
                'user',
                user['id'],
                f"Administrator {admin_full_name} ({user['email']}) logged in."
            )
            db.commit()

            return jsonify({
                'success': True,
                'token': token,
                'user': {
                    'id': user['id'],
                    'email': user['email'],
                    'first_name': user['first_name'],
                    'last_name': user['last_name'],
                    'full_name': admin_full_name,
                    'role': user['role'],
                    'is_superadmin': user['role'] == 'superadmin'
                }
            })
    finally:
        db.close()


@app.route('/api/admin/me', methods=['GET'])
@admin_required
def get_current_admin():
    user_id = getattr(request, 'user_id', 0)
    user_role = getattr(request, 'user_role', 'admin')

    if user_id == 0 or user_role == 'superadmin':
        return jsonify({
            'success': True,
            'user': {
                'id': 0,
                'email': os.environ.get('SUPERADMIN_EMAIL', 'superadmin@clucko.com'),
                'first_name': 'Platform',
                'last_name': 'Developer',
                'full_name': os.environ.get('SUPERADMIN_NAME', 'Platform Developer (SuperAdmin)'),
                'role': 'superadmin',
                'is_superadmin': True
            }
        })

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = %s', (user_id,))
            u = cur.fetchone()
            if not u:
                return jsonify({'error': 'Admin record not found'}), 404
            return jsonify({
                'success': True,
                'user': {
                    'id': u['id'],
                    'email': u['email'],
                    'first_name': u['first_name'],
                    'last_name': u['last_name'],
                    'full_name': f"{u['first_name']} {u['last_name'] or ''}".strip(),
                    'role': u['role'],
                    'is_superadmin': u['role'] == 'superadmin'
                }
            })
    finally:
        db.close()


# ─── 1. BUSINESS ANALYTICS & DASHBOARD KPIS ───────────────────────────────────
@app.route('/api/admin/analytics', methods=['GET'])
@admin_required
def get_admin_analytics():
    db = get_db()
    try:
        with db.cursor() as cur:
            # 1. Total revenue collected from paid transactions
            cur.execute('''
                SELECT 
                    COALESCE(SUM(amount), 0) AS total_collected,
                    COALESCE(SUM(refund_amount), 0) AS total_refunded,
                    COUNT(*) AS total_transactions
                FROM subscription_transactions
                WHERE status = 'paid' OR status = 'refunded'
            ''')
            rev_row = cur.fetchone()
            total_collected = float(rev_row['total_collected'] or 0)
            total_refunded = float(rev_row['total_refunded'] or 0)
            net_revenue = max(0.0, total_collected - total_refunded)

            # Revenue this month vs last month
            cur.execute('''
                SELECT 
                    COALESCE(SUM(amount), 0) AS this_month_rev
                FROM subscription_transactions
                WHERE status = 'paid'
                  AND created_at >= DATE_TRUNC('month', CURRENT_TIMESTAMP)
            ''')
            this_month_rev = float(cur.fetchone()['this_month_rev'] or 0)

            cur.execute('''
                SELECT 
                    COALESCE(SUM(amount), 0) AS last_month_rev
                FROM subscription_transactions
                WHERE status = 'paid'
                  AND created_at >= DATE_TRUNC('month', CURRENT_TIMESTAMP - INTERVAL '1 month')
                  AND created_at < DATE_TRUNC('month', CURRENT_TIMESTAMP)
            ''')
            last_month_rev = float(cur.fetchone()['last_month_rev'] or 0)

            rev_growth = 0.0
            if last_month_rev > 0:
                rev_growth = round(((this_month_rev - last_month_rev) / last_month_rev) * 100, 1)

            # 2. User & Subscription Distribution
            cur.execute('''
                SELECT 
                    COUNT(*) as total_users,
                    COUNT(CASE WHEN role = 'owner' THEN 1 END) as total_owners,
                    COUNT(CASE WHEN role = 'caretaker' THEN 1 END) as total_caretakers,
                    COUNT(CASE WHEN role = 'admin' THEN 1 END) as total_admins,
                    COUNT(CASE WHEN is_active = TRUE THEN 1 END) as active_users,
                    COUNT(CASE WHEN is_active = FALSE THEN 1 END) as suspended_users
                FROM users
            ''')
            user_stats = cur.fetchone()

            # Subscription breakdown
            cur.execute('''
                SELECT 
                    plan,
                    COUNT(*) as count
                FROM subscriptions
                WHERE status = 'active'
                GROUP BY plan
            ''')
            sub_plan_rows = cur.fetchall()
            sub_distribution = {r['plan']: r['count'] for r in sub_plan_rows}

            # Conversion rate (% of owners on paid Pro/Premium plans)
            paid_subscribers = sub_distribution.get('pro', 0) + sub_distribution.get('premium', 0)
            total_owners = user_stats['total_owners'] or 1
            conversion_rate = round((paid_subscribers / total_owners) * 100, 1)

            # 3. Platform Resource Counts
            cur.execute('SELECT COUNT(*) as cnt FROM farms')
            total_farms = cur.fetchone()['cnt']

            cur.execute('SELECT COUNT(*) as cnt FROM chickens')
            total_chickens = cur.fetchone()['cnt']

            cur.execute('SELECT COUNT(*) as cnt FROM image_captures')
            total_scans = cur.fetchone()['cnt']

            cur.execute('SELECT COUNT(*) as cnt FROM alerts')
            total_alerts = cur.fetchone()['cnt']

            # 4. Recent 30-Day Revenue Timeline
            cur.execute('''
                SELECT 
                    DATE(created_at) as tx_date,
                    SUM(amount) as daily_revenue,
                    COUNT(*) as tx_count
                FROM subscription_transactions
                WHERE status = 'paid'
                  AND created_at >= CURRENT_DATE - INTERVAL '30 day'
                GROUP BY DATE(created_at)
                ORDER BY tx_date ASC
            ''')
            timeline_rows = cur.fetchall()
            revenue_timeline = [
                {
                    'date': r['tx_date'].strftime('%Y-%m-%d') if hasattr(r['tx_date'], 'strftime') else str(r['tx_date']),
                    'revenue': float(r['daily_revenue']),
                    'count': r['tx_count']
                }
                for r in timeline_rows
            ]

            # 5. Recent Transactions
            cur.execute('''
                SELECT 
                    st.id,
                    st.user_id,
                    CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) as user_name,
                    u.email,
                    st.plan,
                    st.amount,
                    st.currency,
                    st.payment_gateway,
                    st.payment_method,
                    st.status,
                    st.refund_amount,
                    st.refund_reason,
                    st.created_at
                FROM subscription_transactions st
                LEFT JOIN users u ON u.id = st.user_id
                ORDER BY st.created_at DESC
                LIMIT 6
            ''')
            recent_tx = cur.fetchall()

            return jsonify({
                'success': True,
                'revenue': {
                    'total_collected': total_collected,
                    'total_refunded': total_refunded,
                    'net_revenue': net_revenue,
                    'this_month': this_month_rev,
                    'last_month': last_month_rev,
                    'growth_pct': rev_growth,
                    'currency': 'PHP'
                },
                'users': {
                    'total': user_stats['total_users'],
                    'owners': user_stats['total_owners'],
                    'caretakers': user_stats['total_caretakers'],
                    'admins': user_stats['total_admins'],
                    'active': user_stats['active_users'],
                    'suspended': user_stats['suspended_users']
                },
                'subscriptions': {
                    'pro': sub_distribution.get('pro', 0),
                    'premium': sub_distribution.get('premium', 0),
                    'free_trial': sub_distribution.get('free_trial', 0),
                    'total_paid': paid_subscribers,
                    'conversion_rate_pct': conversion_rate
                },
                'platform': {
                    'farms': total_farms,
                    'chickens': total_chickens,
                    'scans': total_scans,
                    'alerts': total_alerts
                },
                'revenue_timeline': revenue_timeline,
                'recent_transactions': recent_tx
            })
    finally:
        db.close()


# ─── 2. USER & ACCOUNT MANAGEMENT ─────────────────────────────────────────────
@app.route('/api/admin/users', methods=['GET'])
@admin_required
def get_admin_users():
    page = max(1, int(request.args.get('page', 1)))
    limit = max(1, min(100, int(request.args.get('limit', 10))))
    offset = (page - 1) * limit
    search = (request.args.get('search') or '').strip()
    role_filter = request.args.get('role', 'all')
    status_filter = request.args.get('status', 'all')
    sort_by = request.args.get('sort_by', 'created_at')
    sort_dir = 'ASC' if request.args.get('sort_dir', 'desc').lower() == 'asc' else 'DESC'

    valid_sort_cols = {
        'id': 'u.id',
        'first_name': 'LOWER(u.first_name)',
        'last_name': 'LOWER(u.last_name)',
        'email': 'LOWER(u.email)',
        'role': 'u.role',
        'created_at': 'u.created_at',
        'last_active_at': 'u.last_active_at'
    }
    if sort_by == 'first_name':
        order_clause = f"LOWER(u.first_name) {sort_dir}, LOWER(u.last_name) {sort_dir}"
    else:
        order_clause = valid_sort_cols.get(sort_by, 'u.created_at') + ' ' + sort_dir

    conditions = []
    params = []

    if search:
        search_pattern = f"%{search}%"
        conditions.append('''
            (u.first_name ILIKE %s OR u.last_name ILIKE %s OR u.email ILIKE %s OR COALESCE(u.phone_number, '') ILIKE %s OR COALESCE(u.farm_name, '') ILIKE %s)
        ''')
        params.extend([search_pattern, search_pattern, search_pattern, search_pattern, search_pattern])

    if role_filter != 'all':
        conditions.append("u.role = %s")
        params.append(role_filter)

    if status_filter == 'active':
        conditions.append("u.is_active = TRUE")
    elif status_filter == 'suspended':
        conditions.append("u.is_active = FALSE")

    where_sql = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    db = get_db()
    try:
        with db.cursor() as cur:
            # Total matching count
            count_query = f"SELECT COUNT(*) as total FROM users u {where_sql}"
            cur.execute(count_query, params)
            total = cur.fetchone()['total']

            # Aggregated stats
            cur.execute('''
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN role = 'owner' THEN 1 END) as owners,
                    COUNT(CASE WHEN role = 'caretaker' THEN 1 END) as caretakers,
                    COUNT(CASE WHEN role = 'admin' THEN 1 END) as admins,
                    COUNT(CASE WHEN is_active = TRUE THEN 1 END) as active,
                    COUNT(CASE WHEN is_active = FALSE THEN 1 END) as suspended
                FROM users
            ''')
            stats = cur.fetchone()

            # Main users query with active subscription & counts
            query = f'''
                SELECT 
                    u.id,
                    u.first_name,
                    u.last_name,
                    u.email,
                    u.phone_number,
                    u.role,
                    COALESCE(
                        (SELECT f.farm_name FROM farm_members fm JOIN farms f ON f.id = fm.farm_id WHERE fm.user_id = u.id LIMIT 1),
                        u.farm_name
                    ) as farm_name,
                    COALESCE(
                        (SELECT f.farm_location FROM farm_members fm JOIN farms f ON f.id = fm.farm_id WHERE fm.user_id = u.id LIMIT 1),
                        u.farm_location
                    ) as farm_location,
                    (SELECT CONCAT(o.first_name, ' ', COALESCE(o.last_name, ''))
                     FROM farm_members fm JOIN farms f ON f.id = fm.farm_id JOIN users o ON o.id = f.owner_id
                     WHERE fm.user_id = u.id LIMIT 1) as assigned_owner_name,
                    (SELECT f.farm_name 
                     FROM farm_members fm JOIN farms f ON f.id = fm.farm_id
                     WHERE fm.user_id = u.id LIMIT 1) as assigned_farm_name,
                    u.is_active,
                    u.created_at,
                    u.last_active_at,
                    COALESCE(s.plan, 'none') as current_plan,
                    COALESCE(s.status, 'inactive') as sub_status,
                    s.end_date as sub_end_date,
                    (SELECT COUNT(*) FROM farms f WHERE f.owner_id = u.id) as farms_count,
                    (SELECT COUNT(*) FROM chickens c WHERE c.user_id = u.id) as chickens_count,
                    (SELECT COUNT(*) FROM image_captures ic WHERE ic.user_id = u.id) as scans_count
                FROM users u
                LEFT JOIN subscriptions s ON s.user_id = u.id
                {where_sql}
                ORDER BY {order_clause}
                LIMIT %s OFFSET %s
            '''
            cur.execute(query, params + [limit, offset])
            users = cur.fetchall()

            # Lightweight all accounts directory list for instant account filter dropdown
            cur.execute('''
                SELECT id, first_name, last_name, email, role, is_active
                FROM users
                ORDER BY first_name ASC, last_name ASC
            ''')
            all_accounts = cur.fetchall()

            return jsonify({
                'success': True,
                'users': users,
                'all_accounts': all_accounts,
                'total': total,
                'page': page,
                'pages': (total + limit - 1) // limit if total > 0 else 1,
                'stats': stats
            })
    finally:
        db.close()


@app.route('/api/admin/users/<int:user_id>', methods=['GET'])
@admin_required
def get_admin_user_detail(user_id):
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT 
                    u.id, u.first_name, u.last_name, u.email, u.phone_number,
                    u.role, u.farm_name, u.farm_location, u.is_active,
                    u.terms_version, u.terms_accepted_at, u.created_at, u.last_active_at
                FROM users u
                WHERE u.id = %s
            ''', (user_id,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404

            # Farms owned
            cur.execute('''
                SELECT f.id, f.farm_name, f.farm_location, f.farm_code, f.created_at,
                       (SELECT COUNT(*) FROM chickens c WHERE c.farm_id = f.id) as chicken_count,
                       (SELECT COUNT(*) FROM farm_members fm WHERE fm.farm_id = f.id) as caretaker_count
                FROM farms f
                WHERE f.owner_id = %s
                ORDER BY f.created_at DESC
            ''', (user_id,))
            owned_farms = cur.fetchall()
            for farm in owned_farms:
                cur.execute('''
                    SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, fm.joined_at
                    FROM farm_members fm
                    JOIN users u ON u.id = fm.user_id
                    WHERE fm.farm_id = %s AND fm.role = 'caretaker'
                    ORDER BY fm.joined_at ASC
                ''', (farm['id'],))
                farm['caretakers'] = cur.fetchall()

            # Farms member of (if caretaker)
            cur.execute('''
                SELECT f.id, f.farm_name, f.farm_code, fm.role as member_role, fm.joined_at,
                       CONCAT(o.first_name, ' ', COALESCE(o.last_name, '')) as owner_name,
                       o.email as owner_email
                FROM farm_members fm
                JOIN farms f ON f.id = fm.farm_id
                JOIN users o ON o.id = f.owner_id
                WHERE fm.user_id = %s
            ''', (user_id,))
            member_farms = cur.fetchall()

            # Subscription & Usage
            cur.execute('SELECT * FROM subscriptions WHERE user_id = %s', (user_id,))
            subscription = cur.fetchone()

            # Transactions
            cur.execute('''
                SELECT id, plan, amount, currency, payment_gateway, payment_method,
                       status, refund_amount, refund_reason, refunded_at, created_at
                FROM subscription_transactions
                WHERE user_id = %s
                ORDER BY created_at DESC
            ''', (user_id,))
            transactions = cur.fetchall()

            # Recent Scans
            cur.execute('''
                SELECT ic.id, ic.image_type, ic.capture_datetime, ic.image_url,
                       dr.predicted_condition, dr.confidence_score, dr.severity_level,
                       c.chicken_name
                FROM image_captures ic
                LEFT JOIN detection_results dr ON dr.image_id = ic.id
                LEFT JOIN chickens c ON c.id = ic.chicken_id
                WHERE ic.user_id = %s
                ORDER BY ic.capture_datetime DESC
                LIMIT 10
            ''', (user_id,))
            recent_scans = cur.fetchall()

            # Recent Audit Events involving this user
            cur.execute('''
                SELECT id, admin_name, action, description, created_at
                FROM admin_audit_logs
                WHERE target_type = 'user' AND target_id = %s
                ORDER BY created_at DESC
                LIMIT 10
            ''', (str(user_id),))
            audit_history = cur.fetchall()

            return jsonify({
                'success': True,
                'user': user,
                'owned_farms': owned_farms,
                'member_farms': member_farms,
                'subscription': subscription,
                'transactions': transactions,
                'recent_scans': recent_scans,
                'audit_history': audit_history
            })
    finally:
        db.close()


def send_admin_welcome_email(to_email: str, first_name: str, last_name: str, temp_password: str, role: str, login_url: str = None) -> bool:
    """
    Dispatches an official onboarding email with credentials and sign-in URL to a newly created administrator/user.
    """
    from routes_auth import get_smtp_credentials
    admin_full_name = f"{first_name} {last_name}".strip() or "Administrator"
    role_display = "Administrator" if role == 'admin' else ("Farm Owner" if role == 'owner' else "Caretaker")
    
    frontend_base = os.environ.get('FRONTEND_URL', 'http://localhost:3000').rstrip('/')
    if not login_url:
        if role == 'admin':
            login_url = f"{frontend_base}/admin/login?portal=admin&email={to_email}"
        else:
            login_url = f"{frontend_base}/login"

    subject = f"Welcome to Clucko - Your {role_display} Access Credentials"

    text_content = (
        f"Hello {admin_full_name},\n\n"
        f"Your {role_display} account has been provisioned on Clucko Gamefowl AI System.\n\n"
        f"Access Credentials:\n"
        f"• Login Email: {to_email}\n"
        f"• Temporary Password: {temp_password}\n"
        f"• Account Role: {role_display}\n"
        f"• Direct Sign-In Portal: {login_url}\n\n"
        f"Please click the link above to sign in directly through the administrative gate.\n"
        f"For system security, please update your password upon initial sign in.\n\n"
        f"Best regards,\n"
        f"Clucko Security Administration"
    )

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0c0e12; margin: 0; padding: 24px; color: #f8fafc; }}
        .card {{ max-width: 520px; margin: 0 auto; background: #14171d; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #232730; }}
        .header {{ background: #0f241a; padding: 28px 24px; text-align: center; border-bottom: 1px solid rgba(16,185,129,0.2); }}
        .badge {{ display: inline-block; background: rgba(16,185,129,0.15); color: #10b981; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 6px; letter-spacing: 0.5px; border: 1px solid rgba(16,185,129,0.3); margin-bottom: 8px; }}
        .header h1 {{ margin: 0 0 4px 0; font-size: 21px; font-weight: 800; color: #ffffff; letter-spacing: -0.3px; }}
        .header p {{ margin: 0; font-size: 13px; color: #94a3b8; }}
        .body {{ padding: 24px; color: #cbd5e1; line-height: 1.6; font-size: 14px; }}
        .credentials-box {{ background: #1a1e26; border: 1px solid #2d3340; border-radius: 12px; padding: 16px 18px; margin: 18px 0; }}
        .btn-wrap {{ text-align: center; margin: 24px 0 14px 0; }}
        .login-btn {{ display: inline-block; background: #10b981; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 13.5px; padding: 11px 26px; border-radius: 8px; box-shadow: 0 4px 14px rgba(16,185,129,0.35); }}
        .security-notice {{ font-size: 11.5px; color: #64748b; background: #101317; padding: 10px 12px; border-radius: 8px; border: 1px dashed #272d38; margin-top: 16px; line-height: 1.5; }}
        .footer {{ padding: 16px 24px; text-align: center; font-size: 11px; color: #64748b; background: #0e1014; border-top: 1px solid #1a1d24; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="badge">CLUCKO ENTERPRISE ACCESS</div>
          <h1>Welcome to Clucko, {first_name}!</h1>
          <p>Your {role_display} account has been provisioned</p>
        </div>
        <div class="body">
          <p style="margin-top: 0;">Hello <b>{admin_full_name}</b>,</p>
          <p>You have been authorized and registered as an official <b>{role_display}</b> on the Clucko Gamefowl AI System. Below are your initial authentication credentials:</p>
          
          <div class="credentials-box">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: 600; color: #94a3b8; font-size: 13px; border-bottom: 1px dashed #2d3340; width: 42%;">Sign-In Email:</td>
                <td style="padding: 8px 0; font-family: monospace; font-size: 13.5px; font-weight: 700; color: #10b981; text-align: right; border-bottom: 1px dashed #2d3340;">{to_email}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: 600; color: #94a3b8; font-size: 13px; border-bottom: 1px dashed #2d3340;">Temporary Password:</td>
                <td style="padding: 8px 0; font-family: monospace; font-size: 13.5px; font-weight: 700; color: #f8fafc; text-align: right; border-bottom: 1px dashed #2d3340;">{temp_password}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: 600; color: #94a3b8; font-size: 13px;">Authorized Role:</td>
                <td style="padding: 8px 0; font-size: 13px; font-weight: 700; color: #10b981; text-align: right;">{role_display}</td>
              </tr>
            </table>
          </div>

          <div class="btn-wrap">
            <a href="{login_url}" class="login-btn">Sign In to Admin Center &rarr;</a>
          </div>

          <div class="security-notice">
            🔒 <b>Security Note:</b> Keep your credentials confidential. You will be prompted to verify access. For security, Administrator accounts can only sign in through this designated portal link.
          </div>
        </div>
        <div class="footer">
          Clucko Gamefowl Health AI Suite • Enterprise Security Access
        </div>
      </div>
    </body>
    </html>
    """

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
                with smtplib.SMTP(smtp_host, smtp_port, timeout=4) as server:
                    server.starttls()
                    server.login(smtp_user, smtp_password)
                    server.sendmail(smtp_user, to_email, msg.as_string())
                sent = True
            except Exception as e587:
                try:
                    with smtplib.SMTP_SSL(smtp_host, 465, timeout=4) as server:
                        server.login(smtp_user, smtp_password)
                        server.sendmail(smtp_user, to_email, msg.as_string())
                    sent = True
                except Exception as e465:
                    print(f"[ADMIN] SMTP failed on both 587 ({e587}) and 465 ({e465})")

            if sent:
                print(f"[ADMIN] Welcome email with credentials dispatched successfully to {to_email}")
                return True
        except Exception as smtp_err:
            print(f"[ADMIN] SMTP dispatch to {to_email} failed: {smtp_err}")

    # Fallback: EmailJS (Try custom template first, then verified active template_u0b0yl9)
    try:
        import requests
        emailjs_service = os.environ.get('EMAILJS_SERVICE_ID', 'service_lzrjxzb')
        emailjs_template = os.environ.get('EMAILJS_WELCOME_TEMPLATE_ID', 'template_welcome')
        emailjs_verified_template = os.environ.get('EMAILJS_TEMPLATE_ID', 'template_u0b0yl9')
        emailjs_user = os.environ.get('EMAILJS_USER_ID', 'lJJPMqktLrmyBcQBJ')

        def _send_via_emailjs(t_id):
            return requests.post(
                'https://api.emailjs.com/api/v1.0/email/send',
                headers={'Content-Type': 'application/json', 'Origin': 'http://localhost'},
                json={
                    'service_id': emailjs_service,
                    'template_id': t_id,
                    'user_id': emailjs_user,
                    'template_params': {
                        'to_email': to_email,
                        'email': to_email,
                        'user_name': admin_full_name,
                        'name': admin_full_name,
                        'code': f"Temporary Password: {temp_password} | Portal: {login_url}",
                        'temp_password': temp_password,
                        'password': temp_password,
                        'role': role_display,
                        'login_url': login_url,
                        'subject': subject,
                        'message': text_content,
                    }
                },
                timeout=8,
            )

        resp = None
        if emailjs_template and emailjs_template != 'template_welcome':
            resp = _send_via_emailjs(emailjs_template)
            if resp.status_code == 200:
                print(f"[ADMIN] Welcome email sent via custom EmailJS ({emailjs_template}) to {to_email}")
                return True

        # Fallback to verified active template_u0b0yl9
        resp = _send_via_emailjs(emailjs_verified_template)
        if resp.status_code == 200:
            print(f"[ADMIN] Welcome email sent via verified EmailJS ({emailjs_verified_template}) to {to_email}")
            return True
        else:
            print(f"[ADMIN] EmailJS returned status: {resp.status_code}, detail: {resp.text}")
    except Exception as ejs_err:
        print(f"[ADMIN] EmailJS fallback failed: {ejs_err}")

    print(f"[ADMIN] Welcome email simulated for {to_email}")
    return False


@app.route('/api/admin/users/create', methods=['POST'])
@admin_required
def create_admin_user():
    """
    Creates an administrator or user account directly from the Admin Portal (Admin-Invite-Admin model).
    Applies comprehensive input validation and dispatches credentials via email.
    """
    import re
    d = request.json or {}
    email = (d.get('email') or '').strip().lower()
    first_name = (d.get('first_name') or '').strip()
    last_name = (d.get('last_name') or '').strip()
    role = (d.get('role') or 'admin').strip().lower()
    phone_number = (d.get('phone_number') or '').strip()
    custom_password = (d.get('password') or '').strip()

    # 1. Email validation
    EMAIL_REGEX = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
    if not email or not re.match(EMAIL_REGEX, email):
        return jsonify({'error': 'Please provide a valid email address (e.g. name@company.com).'}), 400

    # 2. Name validation
    if not first_name or len(first_name) < 2 or len(first_name) > 50:
        return jsonify({'error': 'First name is required and must be between 2 and 50 characters.'}), 400
    if not re.match(r"^[A-Za-z\s\-'.]+$", first_name):
        return jsonify({'error': 'First name contains invalid characters. Use letters, spaces, hyphens, or periods.'}), 400

    if last_name:
        if len(last_name) > 50:
            return jsonify({'error': 'Last name cannot exceed 50 characters.'}), 400
        if not re.match(r"^[A-Za-z\s\-'.]+$", last_name):
            return jsonify({'error': 'Last name contains invalid characters.'}), 400

    # 3. Phone number validation (Philippine mobile format if provided)
    if phone_number:
        clean_phone = re.sub(r'[\s\-()]', '', phone_number)
        if not re.match(r'^(09|\+639)\d{9}$', clean_phone):
            return jsonify({'error': 'Invalid phone number format. Use Philippine format e.g. 09171234567 or +639171234567.'}), 400
        phone_number = clean_phone

    # 4. Custom password validation (if provided)
    if custom_password:
        if len(custom_password) < 8:
            return jsonify({'error': 'Temporary password must be at least 8 characters long.'}), 400
        if not any(c.isdigit() or not c.isalnum() for c in custom_password):
            return jsonify({'error': 'Temporary password must contain at least one number or special character.'}), 400

    # 5. Role validation
    if role not in ['admin', 'owner', 'caretaker']:
        return jsonify({'error': "Role must be 'admin', 'owner', or 'caretaker'."}), 400

    # Generate secure temporary password if not provided
    temp_password = custom_password or f"Clucko@{secrets.token_hex(4).upper()}!"

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT id, email FROM users WHERE LOWER(email) = %s', (email,))
            if cur.fetchone():
                return jsonify({'error': f"An account with email '{email}' already exists."}), 400

            password_hash = generate_password_hash(temp_password)

            cur.execute('''
                INSERT INTO users (first_name, last_name, email, password_hash, phone_number, role, is_active, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, TRUE, NOW())
                RETURNING id, first_name, last_name, email, role, phone_number, created_at
            ''', (first_name, last_name, email, password_hash, phone_number, role))
            new_user = cur.fetchone()

            # If user is owner, also initialize their free subscription tier
            if role == 'owner':
                cur.execute('''
                    INSERT INTO subscriptions (user_id, plan, status, max_farms, max_chickens_per_farm, max_captures, created_at, updated_at)
                    VALUES (%s, 'free', 'active', 1, 30, 0, NOW(), NOW())
                    ON CONFLICT (user_id) DO NOTHING
                ''', (new_user['id'],))

            admin_id = getattr(request, 'user_id', 0)
            log_audit_action(
                cur,
                admin_id,
                'Admin',
                'admin_created' if role == 'admin' else 'user_created',
                'user',
                new_user['id'],
                f"Created new {role.upper()} account for {email} ({first_name} {last_name})",
                {'role': role, 'email': email, 'created_by_admin': admin_id}
            )
            db.commit()

            # Dispatch welcome email with credentials
            email_sent = False
            try:
                email_sent = send_admin_welcome_email(
                    to_email=email,
                    first_name=first_name,
                    last_name=last_name,
                    temp_password=temp_password,
                    role=role
                )
            except Exception as email_err:
                print(f"[ADMIN] Failed to send welcome email to {email}: {email_err}")

            return jsonify({
                'success': True,
                'message': f"Account for {email} ({role.upper()}) created successfully." + (" Credentials sent to user's email!" if email_sent else ""),
                'user': new_user,
                'temporary_password': temp_password,
                'email_sent': email_sent
            })
    finally:
        db.close()


@app.route('/api/admin/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_admin_user(user_id):
    d = request.json or {}
    first_name = (d.get('first_name') or '').strip()
    last_name = (d.get('last_name') or '').strip()
    phone_number = (d.get('phone_number') or '').strip()
    farm_name = (d.get('farm_name') or '').strip()
    farm_location = (d.get('farm_location') or '').strip()
    role = (d.get('role') or '').strip().lower()

    if not first_name:
        return jsonify({'error': 'First name is required'}), 400

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT * FROM users WHERE id = %s', (user_id,))
            existing = cur.fetchone()
            if not existing:
                return jsonify({'error': 'User not found'}), 404

            cur.execute('''
                UPDATE users
                SET first_name = %s,
                    last_name = %s,
                    phone_number = %s,
                    farm_name = %s,
                    farm_location = %s,
                    role = COALESCE(NULLIF(%s, ''), role)
                WHERE id = %s
                RETURNING id, first_name, last_name, email, role, phone_number
            ''', (first_name, last_name, phone_number, farm_name, farm_location, role, user_id))
            updated_user = cur.fetchone()

            log_audit_action(
                cur,
                getattr(request, 'user_id', 0),
                'Admin',
                'user_updated',
                'user',
                user_id,
                f"Updated user profile for {existing['email']} ({first_name} {last_name})",
                {'previous': {'name': f"{existing['first_name']} {existing['last_name']}", 'role': existing['role']},
                 'updated': {'name': f"{first_name} {last_name}", 'role': role or existing['role']}}
            )
            db.commit()

            return jsonify({
                'success': True,
                'message': 'User profile updated successfully',
                'user': updated_user
            })
    finally:
        db.close()


@app.route('/api/admin/users/<int:user_id>/status', methods=['POST'])
@admin_required
def toggle_user_status(user_id):
    d = request.json or {}
    is_active = bool(d.get('is_active'))
    reason = (d.get('reason') or '').strip()

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT * FROM users WHERE id = %s', (user_id,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404

            # Safeguard: Do not suspend currently authenticated admin
            if getattr(request, 'user_id', 0) == user_id and not is_active:
                return jsonify({'error': 'You cannot suspend your own admin account.'}), 400

            if is_active:
                cur.execute('UPDATE users SET is_active = %s, suspension_reason = NULL WHERE id = %s', (True, user_id))
            else:
                cur.execute('UPDATE users SET is_active = %s, suspension_reason = %s WHERE id = %s', (False, reason or 'Violation of platform community guidelines', user_id))

            from db import invalidate_user_suspension_cache
            invalidate_user_suspension_cache(user_id)

            action_type = 'user_activated' if is_active else 'user_suspended'
            desc = f"User {user['email']} was {'reactivated' if is_active else 'suspended'}. Reason: {reason or 'Admin discretion'}"

            log_audit_action(
                cur,
                getattr(request, 'user_id', 0),
                'Admin',
                action_type,
                'user',
                user_id,
                desc,
                {'reason': reason, 'is_active': is_active}
            )

            # If user has a farm, send notification
            cur.execute('SELECT id FROM farms WHERE owner_id = %s LIMIT 1', (user_id,))
            farm = cur.fetchone()
            if farm:
                cur.execute('''
                    INSERT INTO notifications (farm_id, user_id, title, message, type)
                    VALUES (%s, %s, %s, %s, %s)
                ''', (
                    farm['id'],
                    user_id,
                    'Account Status Update' if is_active else 'Account Suspended',
                    f"Your Clucko account has been {'reactivated' if is_active else 'suspended by administration'}. {('Reason: ' + reason) if reason else ''}",
                    'info' if is_active else 'warning'
                ))

            db.commit()
            return jsonify({
                'success': True,
                'message': f"User account has been {'activated' if is_active else 'suspended'}.",
                'is_active': is_active
            })
    finally:
        db.close()


@app.route('/api/admin/users/<int:user_id>/reset-password', methods=['POST'])
@admin_required
def admin_reset_password(user_id):
    d = request.json or {}
    custom_password = (d.get('password') or '').strip()
    
    # Generate temporary password if not provided
    temp_password = custom_password if custom_password else f"Clucko@{secrets.token_hex(4).upper()}"

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT id, email, first_name, last_name FROM users WHERE id = %s', (user_id,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404

            new_hash = generate_password_hash(temp_password)
            cur.execute('UPDATE users SET password_hash = %s WHERE id = %s', (new_hash, user_id))

            log_audit_action(
                cur,
                getattr(request, 'user_id', 0),
                'Admin',
                'password_reset',
                'user',
                user_id,
                f"Password reset by admin for {user['email']}",
                {'user_email': user['email']}
            )
            db.commit()

            return jsonify({
                'success': True,
                'message': f"Password for {user['email']} has been reset successfully.",
                'temporary_password': temp_password
            })
    finally:
        db.close()


@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_admin_user(user_id):
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT id, email, first_name, last_name, role FROM users WHERE id = %s', (user_id,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404

            # Safeguards
            if getattr(request, 'user_id', 0) == user_id:
                return jsonify({'error': 'You cannot delete your own active admin account.'}), 400

            is_superadmin = (getattr(request, 'user_role', '') == 'superadmin') or (getattr(request, 'user_id', 0) == 0)

            if user.get('role') == 'admin' and not is_superadmin:
                cur.execute("SELECT COUNT(*) as admin_cnt FROM users WHERE role = 'admin'")
                if cur.fetchone()['admin_cnt'] <= 1:
                    return jsonify({'error': 'Cannot delete the last remaining administrator account.'}), 400

            cur.execute('DELETE FROM users WHERE id = %s', (user_id,))

            operator_name = 'SuperAdmin (Developer)' if is_superadmin else 'Admin'
            log_audit_action(
                cur,
                getattr(request, 'user_id', 0),
                operator_name,
                'user_deleted',
                'user',
                user_id,
                f"Permanently deleted user account {user['email']} ({user['first_name']} {user['last_name']})"
            )
            db.commit()

            return jsonify({
                'success': True,
                'message': f"User account {user['email']} has been permanently deleted."
            })
    finally:
        db.close()


@app.route('/api/admin/users/bulk-action', methods=['POST'])
@admin_required
def bulk_user_action():
    d = request.json or {}
    user_ids = d.get('user_ids', [])
    action = d.get('action') # 'suspend' | 'activate' | 'delete'

    if not user_ids or not isinstance(user_ids, list):
        return jsonify({'error': 'No users selected'}), 400

    if action not in ('suspend', 'activate', 'delete'):
        return jsonify({'error': 'Invalid bulk action specified'}), 400

    current_admin = getattr(request, 'user_id', 0)
    # Strip current admin ID from bulk actions
    safe_user_ids = [uid for uid in user_ids if uid != current_admin]

    if not safe_user_ids:
        return jsonify({'error': 'No eligible users to modify (cannot modify current admin account in bulk)'}), 400

    db = get_db()
    try:
        with db.cursor() as cur:
            placeholders = ', '.join(['%s'] * len(safe_user_ids))
            if action == 'suspend':
                cur.execute(f"UPDATE users SET is_active = FALSE WHERE id IN ({placeholders})", safe_user_ids)
                log_audit_action(cur, current_admin, 'Admin', 'bulk_suspend', 'users', None, f"Bulk suspended {len(safe_user_ids)} user accounts", {'user_ids': safe_user_ids})
            elif action == 'activate':
                cur.execute(f"UPDATE users SET is_active = TRUE WHERE id IN ({placeholders})", safe_user_ids)
                log_audit_action(cur, current_admin, 'Admin', 'bulk_activate', 'users', None, f"Bulk activated {len(safe_user_ids)} user accounts", {'user_ids': safe_user_ids})
            elif action == 'delete':
                cur.execute(f"DELETE FROM users WHERE id IN ({placeholders}) AND role != 'admin'", safe_user_ids)
                log_audit_action(cur, current_admin, 'Admin', 'bulk_delete', 'users', None, f"Bulk deleted {len(safe_user_ids)} user accounts", {'user_ids': safe_user_ids})

            db.commit()
            return jsonify({
                'success': True,
                'message': f"Bulk {action} successfully executed for {len(safe_user_ids)} users."
            })
    finally:
        db.close()


@app.route('/api/admin/users/export', methods=['GET'])
@admin_required
def export_users_csv():
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT 
                    u.id, u.first_name, u.last_name, u.email, u.phone_number,
                    u.role, 
                    COALESCE(
                        (SELECT f.farm_name FROM farm_members fm JOIN farms f ON f.id = fm.farm_id WHERE fm.user_id = u.id LIMIT 1),
                        u.farm_name
                    ) as farm_name,
                    COALESCE(
                        (SELECT f.farm_location FROM farm_members fm JOIN farms f ON f.id = fm.farm_id WHERE fm.user_id = u.id LIMIT 1),
                        u.farm_location
                    ) as farm_location,
                    (SELECT CONCAT(o.first_name, ' ', COALESCE(o.last_name, '')) 
                     FROM farm_members fm JOIN farms f ON f.id = fm.farm_id JOIN users o ON o.id = f.owner_id 
                     WHERE fm.user_id = u.id LIMIT 1) as assigned_owner_name,
                    u.is_active,
                    u.created_at, u.last_active_at,
                    COALESCE(s.plan, 'none') as active_plan,
                    COALESCE(s.status, 'inactive') as sub_status,
                    (SELECT COUNT(*) FROM farms f WHERE f.owner_id = u.id) as farms_count,
                    (SELECT COUNT(*) FROM chickens c WHERE c.user_id = u.id) as chickens_count,
                    (SELECT COUNT(*) FROM image_captures ic WHERE ic.user_id = u.id) as scans_count
                FROM users u
                LEFT JOIN subscriptions s ON s.user_id = u.id
                ORDER BY u.id ASC
            ''')
            rows = cur.fetchall()

            output = io.StringIO()
            writer = csv.writer(output)

            now_pht = (dt.utcnow() + timedelta(hours=8)).strftime('%Y-%m-%d %I:%M %p PHT')
            writer.writerow(['CLUCKO PRO AI PLATFORM - MASTER USER & ACCOUNT DIRECTORY'])
            writer.writerow(['Report Generation:', now_pht])
            writer.writerow(['Total Accounts In Ledger:', len(rows)])
            writer.writerow([])

            writer.writerow([
                'Account ID', 'Full Name', 'Email Address', 'Phone Number', 
                'Platform Role', 'Assigned Farm / Operation', 'Farm Location', 'Assigned Farm Owner',
                'Account Status', 'Active Subscription Plan', 'Subscription Status', 
                'Farms Owned', 'Chickens Registered', 'AI Diagnostics Run', 
                'Registration Date (PHT)', 'Last Activity (PHT)'
            ])

            for r in rows:
                reg_pht = (r['created_at'] + timedelta(hours=8)).strftime('%b %d, %Y %I:%M %p') if r['created_at'] else '—'
                act_pht = (r['last_active_at'] + timedelta(hours=8)).strftime('%b %d, %Y %I:%M %p') if r['last_active_at'] else 'Never'
                writer.writerow([
                    f"USR-{r['id']:04d}",
                    f"{r['first_name']} {r['last_name']}".strip(),
                    r['email'],
                    r['phone_number'] or '—',
                    r['role'].upper(),
                    r['farm_name'] or 'Unassigned',
                    r['farm_location'] or '—',
                    r['assigned_owner_name'] or 'Self (Owner)',
                    'ACTIVE' if r['is_active'] else 'SUSPENDED',
                    r['active_plan'].upper(),
                    r['sub_status'].upper(),
                    r['farms_count'],
                    r['chickens_count'],
                    r['scans_count'],
                    reg_pht,
                    act_pht
                ])

            csv_data = '\ufeff' + output.getvalue()
            response = Response(csv_data, mimetype='text/csv; charset=utf-8')
            filename = f'clucko_master_users_directory_{dt.now().strftime("%Y%m%d_%H%M")}.csv'
            response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
            response.headers['Access-Control-Expose-Headers'] = 'Content-Disposition'
            return response
    finally:
        db.close()


# ─── 3. SUBSCRIPTIONS, BILLING & REFUND MANAGEMENT ───────────────────────────
@app.route('/api/admin/subscriptions', methods=['GET'])
@admin_required
def get_admin_subscriptions():
    page = max(1, int(request.args.get('page', 1)))
    limit = max(1, min(100, int(request.args.get('limit', 15))))
    offset = (page - 1) * limit
    plan_filter = request.args.get('plan', 'all')
    status_filter = request.args.get('status', 'all')
    account_filter = request.args.get('account', 'all')
    search = (request.args.get('search') or '').strip()

    conditions = []
    params = []

    if plan_filter != 'all':
        conditions.append("s.plan = %s")
        params.append(plan_filter)

    if status_filter != 'all':
        conditions.append("s.status = %s")
        params.append(status_filter)

    if account_filter != 'all':
        try:
            acc_id = int(account_filter)
            conditions.append("s.user_id = %s")
            params.append(acc_id)
        except ValueError:
            pass

    if search:
        pattern = f"%{search}%"
        conditions.append("(u.first_name ILIKE %s OR u.last_name ILIKE %s OR u.email ILIKE %s)")
        params.extend([pattern, pattern, pattern])

    where_sql = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    db = get_db()
    try:
        with db.cursor() as cur:
            # Accounts list for Active Subscriptions dropdown filter
            cur.execute('''
                SELECT DISTINCT u.id, CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) as name, u.email
                FROM subscriptions s
                JOIN users u ON u.id = s.user_id
                ORDER BY name ASC
            ''')
            accounts = cur.fetchall()

            count_query = f'''
                SELECT COUNT(*) as total 
                FROM subscriptions s
                JOIN users u ON u.id = s.user_id
                {where_sql}
            '''
            cur.execute(count_query, params)
            total = cur.fetchone()['total']

            query = f'''
                SELECT 
                    s.id,
                    s.user_id,
                    CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) as user_name,
                    u.email,
                    u.role as user_role,
                    s.plan,
                    s.status,
                    s.price_paid,
                    s.currency,
                    s.payment_gateway,
                    s.max_farms,
                    s.max_chickens_per_farm,
                    s.max_captures,
                    s.captures_used,
                    s.start_date,
                    s.end_date,
                    s.grace_period_end,
                    s.updated_at,
                    (SELECT COUNT(*) FROM farms f WHERE f.owner_id = s.user_id) as farms_count,
                    (SELECT COUNT(*) FROM chickens c WHERE c.user_id = s.user_id) as chickens_count
                FROM subscriptions s
                JOIN users u ON u.id = s.user_id
                {where_sql}
                ORDER BY s.updated_at DESC
                LIMIT %s OFFSET %s
            '''
            cur.execute(query, params + [limit, offset])
            subs = cur.fetchall()

            return jsonify({
                'success': True,
                'subscriptions': subs,
                'accounts': accounts,
                'total': total,
                'page': page,
                'pages': (total + limit - 1) // limit if total > 0 else 1
            })
    finally:
        db.close()


@app.route('/api/admin/subscriptions/<int:user_id>/adjust', methods=['POST'])
@admin_required
def adjust_user_subscription(user_id):
    d = request.json or {}
    new_plan = d.get('plan') # 'pro', 'premium', 'free_trial', 'free'
    duration_days = int(d.get('duration_days', 30))
    reason = (d.get('reason') or 'Admin plan adjustment').strip()

    if new_plan not in ('free_trial', 'pro', 'premium', 'free'):
        return jsonify({'error': 'Invalid plan specified'}), 400

    from routes_subscriptions import PLANS_CONFIG, reload_plans_from_db
    reload_plans_from_db()
    p_config = PLANS_CONFIG.get(new_plan, PLANS_CONFIG['free'])

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT id, email, first_name, last_name FROM users WHERE id = %s', (user_id,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404

            now = dt.utcnow()
            new_end = now + timedelta(days=duration_days)
            new_grace = new_end + timedelta(days=7)

            cur.execute('''
                INSERT INTO subscriptions
                (user_id, plan, status, price_paid, currency, payment_gateway,
                 max_farms, max_chickens_per_farm, max_captures, captures_used,
                 free_trial_used, start_date, end_date, grace_period_end, updated_at)
                VALUES (%s, %s, 'active', %s, 'PHP', 'admin_grant',
                        %s, %s, %s, 0, TRUE, %s, %s, %s, NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    plan = EXCLUDED.plan,
                    status = 'active',
                    price_paid = EXCLUDED.price_paid,
                    payment_gateway = 'admin_grant',
                    max_farms = EXCLUDED.max_farms,
                    max_chickens_per_farm = EXCLUDED.max_chickens_per_farm,
                    max_captures = EXCLUDED.max_captures,
                    start_date = EXCLUDED.start_date,
                    end_date = EXCLUDED.end_date,
                    grace_period_end = EXCLUDED.grace_period_end,
                    updated_at = NOW()
                RETURNING *
            ''', (
                user_id, new_plan, p_config['price'],
                p_config['max_farms'], p_config['max_chickens_per_farm'],
                p_config['max_captures'], now, new_end, new_grace
            ))
            sub = cur.fetchone()

            log_audit_action(
                cur,
                getattr(request, 'user_id', 0),
                'Admin',
                'subscription_adjusted',
                'subscription',
                user_id,
                f"Subscription adjusted to {p_config['name']} for {user['email']} ({duration_days} days). Reason: {reason}",
                {'plan': new_plan, 'duration_days': duration_days, 'reason': reason}
            )

            # Notify user
            cur.execute('SELECT id FROM farms WHERE owner_id = %s LIMIT 1', (user_id,))
            farm = cur.fetchone()
            if farm:
                cur.execute('''
                    INSERT INTO notifications (farm_id, user_id, title, message, type)
                    VALUES (%s, %s, %s, %s, 'info')
                ''', (
                    farm['id'],
                    user_id,
                    'Plan Updated by Admin',
                    f"Your Clucko subscription has been updated to {p_config['name']} valid for {duration_days} days. Reason: {reason}"
                ))

            db.commit()
            return jsonify({
                'success': True,
                'message': f"Subscription successfully updated to {p_config['name']}",
                'subscription': sub
            })
    finally:
        db.close()


@app.route('/api/admin/transactions', methods=['GET'])
@admin_required
def get_admin_transactions():
    page = max(1, int(request.args.get('page', 1)))
    limit = max(1, min(100, int(request.args.get('limit', 15))))
    offset = (page - 1) * limit
    status_filter = request.args.get('status', 'all')
    customer_filter = request.args.get('customer', 'all')
    gateway_filter = request.args.get('gateway', 'all')
    search = (request.args.get('search') or '').strip()

    conditions = []
    params = []

    if status_filter != 'all':
        conditions.append("st.status = %s")
        params.append(status_filter)

    if customer_filter != 'all':
        try:
            cust_id = int(customer_filter)
            conditions.append("st.user_id = %s")
            params.append(cust_id)
        except ValueError:
            pass

    if gateway_filter != 'all':
        conditions.append("st.payment_gateway = %s")
        params.append(gateway_filter)

    if search:
        pattern = f"%{search}%"
        conditions.append('''
            (u.first_name ILIKE %s OR u.last_name ILIKE %s OR u.email ILIKE %s OR COALESCE(st.checkout_session_id, '') ILIKE %s)
        ''')
        params.extend([pattern, pattern, pattern, pattern])

    where_sql = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    db = get_db()
    try:
        with db.cursor() as cur:
            # Customers list for dropdown filter (only accounts who have transaction records)
            cur.execute('''
                SELECT DISTINCT u.id, CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) as name, u.email
                FROM subscription_transactions st
                JOIN users u ON u.id = st.user_id
                ORDER BY name ASC
            ''')
            customers = cur.fetchall()

            cur.execute(f'''
                SELECT COUNT(*) as total 
                FROM subscription_transactions st
                LEFT JOIN users u ON u.id = st.user_id
                {where_sql}
            ''', params)
            total = cur.fetchone()['total']

            cur.execute(f'''
                SELECT 
                    st.id,
                    st.user_id,
                    CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) as user_name,
                    u.email,
                    st.plan,
                    st.amount,
                    st.currency,
                    st.payment_gateway,
                    st.payment_method,
                    st.checkout_session_id,
                    st.status,
                    st.refund_amount,
                    st.refund_reason,
                    st.refunded_at,
                    st.created_at,
                    st.updated_at
                FROM subscription_transactions st
                LEFT JOIN users u ON u.id = st.user_id
                {where_sql}
                ORDER BY st.created_at DESC
                LIMIT %s OFFSET %s
            ''', params + [limit, offset])
            transactions = cur.fetchall()

            # Ledger summaries
            cur.execute('''
                SELECT 
                    COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as paid_sum,
                    COALESCE(SUM(CASE WHEN status = 'refunded' THEN refund_amount ELSE 0 END), 0) as refund_sum,
                    COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
                    COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refund_count
                FROM subscription_transactions
            ''')
            summary = cur.fetchone()

            return jsonify({
                'success': True,
                'transactions': transactions,
                'customers': customers,
                'accounts': customers,
                'total': total,
                'page': page,
                'pages': (total + limit - 1) // limit if total > 0 else 1,
                'summary': {
                    'total_paid': float(summary['paid_sum']),
                    'total_refunded': float(summary['refund_sum']),
                    'paid_count': summary['paid_count'],
                    'refund_count': summary['refund_count']
                }
            })
    finally:
        db.close()


@app.route('/api/admin/refund-requests', methods=['GET'])
@admin_required
def get_admin_refund_requests():
    """Lists all formal refund requests submitted by farm owners."""
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT 
                    srr.id,
                    srr.transaction_id,
                    srr.user_id,
                    CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) as customer_name,
                    u.email as customer_email,
                    st.plan,
                    st.amount,
                    st.currency,
                    st.payment_gateway,
                    st.payment_method,
                    srr.reason,
                    srr.details,
                    srr.status,
                    srr.admin_notes,
                    srr.reviewed_at,
                    srr.created_at
                FROM subscription_refund_requests srr
                JOIN users u ON u.id = srr.user_id
                JOIN subscription_transactions st ON st.id = srr.transaction_id
                ORDER BY srr.created_at DESC
            ''')
            requests = cur.fetchall()
            # Accounts list for Owner Refund Requests dropdown filter
            cur.execute('''
                SELECT DISTINCT u.id, CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) as name, u.email
                FROM subscription_refund_requests srr
                JOIN users u ON u.id = srr.user_id
                ORDER BY name ASC
            ''')
            accounts = cur.fetchall()

            return jsonify({
                'success': True,
                'requests': requests,
                'accounts': accounts
            })
    finally:
        db.close()


@app.route('/api/admin/refund-requests/<int:req_id>/review', methods=['POST'])
@admin_required
def review_refund_request(req_id):
    """Admin endpoint to approve or decline an owner-submitted refund request."""
    d = request.json or {}
    action = d.get('action') # 'approve' | 'reject'
    admin_notes = (d.get('admin_notes') or '').strip()

    if action not in ('approve', 'reject'):
        return jsonify({'error': "Action must be 'approve' or 'reject'."}), 400

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT srr.*, st.amount, st.plan, u.email, u.first_name, u.last_name
                FROM subscription_refund_requests srr
                JOIN subscription_transactions st ON st.id = srr.transaction_id
                JOIN users u ON u.id = srr.user_id
                WHERE srr.id = %s
            ''', (req_id,))
            req_row = cur.fetchone()
            if not req_row:
                return jsonify({'error': 'Refund request not found.'}), 404

            if req_row['status'] != 'pending':
                return jsonify({'error': f"Request has already been marked as '{req_row['status']}'."}), 400

            now = dt.utcnow()
            admin_id = getattr(request, 'user_id', 0)

            if action == 'approve':
                selected_tx_id = d.get('transaction_id')
                target_tx_id = int(selected_tx_id) if selected_tx_id else req_row['transaction_id']

                cur.execute('SELECT * FROM subscription_transactions WHERE id = %s AND user_id = %s', (target_tx_id, req_row['user_id']))
                target_tx = cur.fetchone()
                if not target_tx:
                    return jsonify({'error': 'Selected transaction not found for this user.'}), 404

                if target_tx['status'] != 'paid':
                    return jsonify({'error': f"Transaction #{target_tx_id} is already {target_tx['status']} and cannot be refunded."}), 400

                # Strictly enforce 7-day grace period policy:
                tx_age_days = (now - target_tx['created_at']).total_seconds() / 86400.0 if target_tx.get('created_at') else 999.0
                if tx_age_days > 7.0:
                    return jsonify({
                        'error': f"Cannot process refund for Transaction #{target_tx_id}: purchase was made {int(tx_age_days)} days ago. Platform policy strictly disallows refunds past the 7-day grace period."
                    }), 400

                refund_amount = float(target_tx['amount'])
                cur.execute('''
                    UPDATE subscription_refund_requests
                    SET status = 'approved',
                        transaction_id = %s,
                        admin_notes = %s,
                        reviewed_by = %s,
                        reviewed_at = %s
                    WHERE id = %s
                ''', (target_tx_id, admin_notes or 'Approved by administrator', admin_id, now, req_id))

                cur.execute('''
                    UPDATE subscription_transactions
                    SET status = 'refunded',
                        refund_amount = %s,
                        refund_reason = %s,
                        refunded_at = %s,
                        refunded_by = %s,
                        updated_at = NOW()
                    WHERE id = %s
                ''', (refund_amount, req_row['reason'], now, admin_id, target_tx_id))

                # Bulletproof Stacked Plan Recalculation
                user_id = req_row['user_id']
                new_sub_state = recalculate_user_subscription(user_id, cur)

                cur.execute('SELECT id FROM farms WHERE owner_id = %s LIMIT 1', (user_id,))
                farm = cur.fetchone()
                if farm:
                    if new_sub_state['plan'] != 'free':
                        rem_date_str = (new_sub_state['end_date'] + timedelta(hours=8)).strftime('%b %d, %Y') if new_sub_state.get('end_date') else 'active'
                        notify_msg = f"Your refund request for ₱{refund_amount:,.2f} ({req_row['plan'].upper()} Plan) was approved. The renewed period has been removed. Your existing {new_sub_state['plan'].upper()} Plan remains active until {rem_date_str}."
                    else:
                        notify_msg = f"Your refund request for ₱{refund_amount:,.2f} ({req_row['plan'].upper()} Plan) was approved. ₱{refund_amount:,.2f} has been refunded, and your account has transitioned to the Standard Free tier."

                    cur.execute('''
                        INSERT INTO notifications (farm_id, user_id, title, message, type)
                        VALUES (%s, %s, %s, %s, %s)
                    ''', (
                        farm['id'],
                        user_id,
                        'Refund Request Approved',
                        notify_msg,
                        'billing'
                    ))

                log_audit_action(
                    cur,
                    admin_id,
                    'Admin',
                    'refund_approved',
                    'refund_request',
                    req_id,
                    f"Approved refund request #{req_id} for {req_row['email']}. Amount: ₱{refund_amount:,.2f}. Remaining Plan: {new_sub_state['plan'].upper()}",
                    {'transaction_id': req_row['transaction_id'], 'amount': refund_amount, 'reason': req_row['reason'], 'new_plan': new_sub_state['plan']}
                )
                db.commit()

                return jsonify({
                    'success': True,
                    'message': f"Refund request approved. ₱{refund_amount:,.2f} refunded. Account plan remains on {new_sub_state['plan'].upper()}.",
                    'subscription': new_sub_state
                })

            else:
                cur.execute('''
                    UPDATE subscription_refund_requests
                    SET status = 'rejected',
                        admin_notes = %s,
                        reviewed_by = %s,
                        reviewed_at = %s
                    WHERE id = %s
                ''', (admin_notes or 'Declined after administrative review', admin_id, now, req_id))

                cur.execute('SELECT id FROM farms WHERE owner_id = %s LIMIT 1', (req_row['user_id'],))
                farm = cur.fetchone()
                if farm:
                    cur.execute('''
                        INSERT INTO notifications (farm_id, user_id, title, message, type)
                        VALUES (%s, %s, %s, %s, %s)
                    ''', (
                        farm['id'],
                        req_row['user_id'],
                        'Refund Request Declined',
                        f"Your refund request for {req_row['plan'].upper()} Plan was reviewed and declined. Reason: {admin_notes or 'Does not qualify under standard refund terms'}.",
                        'billing'
                    ))

                log_audit_action(
                    cur,
                    admin_id,
                    'Admin',
                    'refund_rejected',
                    'refund_request',
                    req_id,
                    f"Declined refund request #{req_id} for {req_row['email']}. Reason: {admin_notes}",
                    {'transaction_id': req_row['transaction_id'], 'reason': admin_notes}
                )
                db.commit()

                return jsonify({
                    'success': True,
                    'message': 'Refund request has been declined.'
                })
    finally:
        db.close()


@app.route('/api/admin/transactions/<int:tx_id>/verify-paymongo', methods=['POST'])
@admin_required
def admin_verify_paymongo_transaction(tx_id):
    """
    Directly queries PayMongo gateway to check if a pending checkout session was paid.
    If paid, updates transaction status to 'paid', activates/extends user subscription, and logs audit action.
    """
    from routes_subscriptions import query_paymongo_is_paid, PLANS_CONFIG, reload_plans_from_db
    reload_plans_from_db()

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT st.*, u.email, u.first_name, u.last_name
                FROM subscription_transactions st
                LEFT JOIN users u ON u.id = st.user_id
                WHERE st.id = %s
            ''', (tx_id,))
            tx = cur.fetchone()

            if not tx:
                return jsonify({'error': 'Transaction not found'}), 404

            if tx['status'] == 'paid':
                return jsonify({'success': True, 'paid': True, 'message': 'This transaction is already marked as paid.'})

            session_id = tx.get('checkout_session_id')
            if not session_id:
                return jsonify({'error': 'No checkout session ID associated with this transaction.'}), 400

            is_paid, pay_details, pay_msg = query_paymongo_is_paid(session_id)
            if not is_paid:
                return jsonify({
                    'success': True,
                    'paid': False,
                    'message': f"PayMongo reports: {pay_msg}"
                })

            plan_key = tx.get('plan') or 'pro'
            plan_info = PLANS_CONFIG.get(plan_key, {'name': plan_key.capitalize(), 'duration_days': 30, 'price': float(tx['amount'])})
            duration_days = plan_info.get('duration_days', 30)
            now = dt.utcnow()

            user_id = tx['user_id']
            cur.execute('SELECT * FROM subscriptions WHERE user_id=%s', (user_id,))
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
                    plan_info.get('price', float(tx['amount'])),
                    session_id,
                    plan_info.get('max_farms', 2),
                    plan_info.get('max_chickens_per_farm', 60),
                    plan_info.get('max_captures', 999999),
                    new_start_date,
                    new_end_date,
                    new_grace_date,
                    now,
                    user_id
                ))
            else:
                cur.execute('''
                    INSERT INTO subscriptions
                    (user_id, plan, status, price_paid, currency, payment_gateway,
                     payment_reference, max_farms, max_chickens_per_farm, max_captures,
                     start_date, end_date, grace_period_end)
                    VALUES (%s, %s, 'active', %s, 'PHP', 'paymongo', %s, %s, %s, %s, %s, %s, %s)
                ''', (
                    user_id,
                    plan_key,
                    plan_info.get('price', float(tx['amount'])),
                    session_id,
                    plan_info.get('max_farms', 2),
                    plan_info.get('max_chickens_per_farm', 60),
                    plan_info.get('max_captures', 999999),
                    new_start_date,
                    new_end_date,
                    new_grace_date
                ))

            # Update transaction status to paid
            cur.execute('''
                UPDATE subscription_transactions
                SET status = 'paid',
                    updated_at = %s,
                    payment_method = 'gcash'
                WHERE id = %s
            ''', (now, tx_id))

            is_superadmin = (getattr(request, 'user_role', '') == 'superadmin') or (getattr(request, 'user_id', 0) == 0)
            op_name = 'SuperAdmin (Developer)' if is_superadmin else 'Admin'
            log_audit_action(
                cur,
                getattr(request, 'user_id', 0),
                op_name,
                'payment_verified_paymongo',
                'subscription_transaction',
                tx_id,
                f"Verified PayMongo checkout session {session_id} for user {tx['email']}. Status confirmed 'paid' and plan activated."
            )
            db.commit()

            return jsonify({
                'success': True,
                'paid': True,
                'message': f"Payment confirmed by PayMongo! Transaction #{tx_id} is now PAID and {tx['first_name']}'s {plan_info.get('name', plan_key)} plan is activated."
            })
    finally:
        db.close()


@app.route('/api/admin/transactions/<int:tx_id>/cancel-pending', methods=['POST'])
@admin_required
def admin_cancel_pending_transaction(tx_id):
    """
    Cancels/voids a pending or abandoned checkout transaction.
    Useful for resolving stale checkouts past their GCash session window.
    """
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT st.*, u.email, u.first_name, u.last_name
                FROM subscription_transactions st
                LEFT JOIN users u ON u.id = st.user_id
                WHERE st.id = %s
            ''', (tx_id,))
            tx = cur.fetchone()

            if not tx:
                return jsonify({'error': 'Transaction not found'}), 404

            if tx['status'] != 'pending':
                return jsonify({'error': f"Only pending transactions can be cancelled. Current status: {tx['status']}"}), 400

            reason = (request.json or {}).get('reason') or 'Abandoned Checkout (Expired Session)'

            cur.execute('''
                UPDATE subscription_transactions
                SET status = 'cancelled', refund_reason = %s, updated_at = NOW()
                WHERE id = %s
            ''', (reason, tx_id))

            is_superadmin = (getattr(request, 'user_role', '') == 'superadmin') or (getattr(request, 'user_id', 0) == 0)
            op_name = 'SuperAdmin (Developer)' if is_superadmin else 'Admin'

            log_audit_action(
                cur,
                getattr(request, 'user_id', 0),
                op_name,
                'transaction_cancelled',
                'subscription_transaction',
                tx_id,
                f"Cancelled pending transaction #{tx_id} for {tx.get('email') or 'customer'} (₱{tx['amount']}). Reason: {reason}",
                {'tx_id': tx_id, 'amount': str(tx['amount']), 'previous_status': 'pending', 'reason': reason}
            )
            db.commit()

            return jsonify({
                'success': True,
                'message': f"Transaction #{tx_id} marked as CANCELLED ({reason})."
            })
    finally:
        db.close()


@app.route('/api/admin/transactions/<int:tx_id>/refund', methods=['POST'])
@admin_required
def process_transaction_refund(tx_id):
    d = request.json or {}
    reason = (d.get('reason') or '').strip()
    revert_plan = bool(d.get('revert_plan', True))

    if not reason:
        return jsonify({'error': 'A refund reason is required for compliance and audit.'}), 400

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT st.*, u.email, u.first_name, u.last_name
                FROM subscription_transactions st
                LEFT JOIN users u ON u.id = st.user_id
                WHERE st.id = %s
            ''', (tx_id,))
            tx = cur.fetchone()

            if not tx:
                return jsonify({'error': 'Transaction not found'}), 404

            if tx['status'] == 'refunded':
                return jsonify({'error': 'This transaction has already been refunded.'}), 400

            if tx['status'] != 'paid':
                return jsonify({'error': f"Cannot refund transaction with status '{tx['status']}'."}), 400

            refund_amount = float(tx['amount'])
            now = dt.utcnow()

            cur.execute('''
                UPDATE subscription_transactions
                SET status = 'refunded',
                    refund_amount = %s,
                    refund_reason = %s,
                    refunded_at = %s,
                    refunded_by = %s,
                    updated_at = NOW()
                WHERE id = %s
                RETURNING *
            ''', (refund_amount, reason, now, getattr(request, 'user_id', 0), tx_id))
            updated_tx = cur.fetchone()

            user_id = tx['user_id']
            if revert_plan:
                new_sub_state = recalculate_user_subscription(user_id, cur)
            else:
                cur.execute('SELECT plan, status, end_date FROM subscriptions WHERE user_id = %s', (user_id,))
                new_sub_state = cur.fetchone() or {'plan': 'free', 'status': 'active'}

            log_audit_action(
                cur,
                getattr(request, 'user_id', 0),
                'Admin',
                'subscription_refunded',
                'transaction',
                tx_id,
                f"Refunded ₱{refund_amount:,.2f} to {tx['email']} for {tx['plan']} plan. Reason: {reason}. Remaining Plan: {new_sub_state['plan'].upper()}",
                {'transaction_id': tx_id, 'amount': refund_amount, 'reason': reason, 'revert_plan': revert_plan, 'new_plan': new_sub_state['plan']}
            )

            cur.execute('SELECT id FROM farms WHERE owner_id = %s LIMIT 1', (user_id,))
            farm = cur.fetchone()
            if farm:
                if new_sub_state['plan'] != 'free':
                    rem_date_str = (new_sub_state['end_date'] + timedelta(hours=8)).strftime('%b %d, %Y') if new_sub_state.get('end_date') else 'active'
                    notify_msg = f"Your payment of ₱{refund_amount:,.2f} for the {tx['plan'].title()} plan has been refunded. Reason: {reason}. Your existing {new_sub_state['plan'].upper()} plan remains active until {rem_date_str}."
                else:
                    notify_msg = f"Your payment of ₱{refund_amount:,.2f} for the {tx['plan'].title()} plan has been refunded. Reason: {reason}. Your account has been adjusted to the Standard Free tier."

                cur.execute('''
                    INSERT INTO notifications (farm_id, user_id, title, message, type)
                    VALUES (%s, %s, %s, %s, 'warning')
                ''', (
                    farm['id'],
                    user_id,
                    'Subscription Refund Processed',
                    notify_msg
                ))

            db.commit()

            return jsonify({
                'success': True,
                'message': f"Transaction #{tx_id} refunded successfully. Account plan remains on {new_sub_state['plan'].upper()}.",
                'transaction': updated_tx,
                'subscription': new_sub_state
            })
    finally:
        db.close()


@app.route('/api/admin/subscriptions/<int:user_id>/purchases', methods=['GET'])
@admin_required
def get_user_purchases(user_id):
    """
    Returns the complete itemized purchase history (isa2 jd) for a specific owner account,
    with calculated grace period eligibility (7-day rule), active/refunded status, and current plan state.
    """
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.phone_number,
                       s.plan as current_plan, s.status as sub_status, s.end_date, s.grace_period_end,
                       s.max_farms, s.max_chickens_per_farm, s.max_captures
                FROM users u
                LEFT JOIN subscriptions s ON s.user_id = u.id
                WHERE u.id = %s
            ''', (user_id,))
            user_info = cur.fetchone()
            if not user_info:
                return jsonify({'error': 'User not found'}), 404

            cur.execute('''
                SELECT st.*, 
                       latest_srr.id as refund_request_id, 
                       latest_srr.status as refund_req_status, 
                       latest_srr.reason as refund_req_reason
                FROM subscription_transactions st
                LEFT JOIN LATERAL (
                    SELECT id, status, reason
                    FROM subscription_refund_requests
                    WHERE transaction_id = st.id
                    ORDER BY created_at DESC
                    LIMIT 1
                ) latest_srr ON true
                WHERE st.user_id = %s
                ORDER BY st.created_at DESC, st.id DESC
            ''', (user_id,))
            txs = cur.fetchall()

            now = dt.utcnow()
            enriched_txs = []
            for t in txs:
                created = t['created_at']
                age_days = (now - created).total_seconds() / 86400.0 if created else 999.0
                is_within_grace = (age_days <= 7.0)
                grace_days_left = max(0, 7 - int(age_days)) if is_within_grace else 0

                enriched_txs.append({
                    'id': t['id'],
                    'plan': t['plan'],
                    'amount': float(t['amount']),
                    'currency': t['currency'],
                    'payment_gateway': t['payment_gateway'],
                    'payment_method': t['payment_method'],
                    'checkout_session_id': t['checkout_session_id'],
                    'status': t['status'],
                    'refund_amount': float(t['refund_amount']) if t['refund_amount'] else None,
                    'refund_reason': t['refund_reason'],
                    'refunded_at': t['refunded_at'].isoformat() if t['refunded_at'] else None,
                    'created_at': created.isoformat() if created else None,
                    'age_days': round(age_days, 1),
                    'is_within_grace': is_within_grace,
                    'grace_days_left': grace_days_left,
                    'refund_request_id': t['refund_request_id'],
                    'refund_req_status': t['refund_req_status'],
                    'refund_req_reason': t['refund_req_reason']
                })

            return jsonify({
                'success': True,
                'user': user_info,
                'purchases': enriched_txs,
                'active_purchases_count': len([t for t in enriched_txs if t['status'] == 'paid']),
                'total_paid_volume': sum([t['amount'] for t in enriched_txs if t['status'] == 'paid']),
                'total_refunded_volume': sum([t['refund_amount'] or t['amount'] for t in enriched_txs if t['status'] == 'refunded'])
            })
    finally:
        db.close()


@app.route('/api/admin/subscriptions/<int:user_id>/refund-purchase', methods=['POST'])
@admin_required
def refund_specific_user_purchase(user_id):
    """
    Refunds one or more selected purchases for an owner account.
    Deducts ONLY the specific purchase(s) refunded, recalculates the remaining active plan
    from all other valid paid transactions, and never destroys older valid subscriptions.
    """
    d = request.json or {}
    tx_ids = d.get('transaction_ids') or ([d.get('transaction_id')] if d.get('transaction_id') else [])
    reason = (d.get('reason') or '').strip()

    if not tx_ids:
        return jsonify({'error': 'Please select at least one transaction to refund.'}), 400
    if not reason:
        return jsonify({'error': 'A refund justification reason is required for BIR/Audit compliance.'}), 400

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT id, email, first_name, last_name FROM users WHERE id = %s', (user_id,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404

            # Fetch the requested transactions
            cur.execute('''
                SELECT * FROM subscription_transactions
                WHERE id = ANY(%s) AND user_id = %s
            ''', (tx_ids, user_id))
            target_txs = cur.fetchall()

            if not target_txs:
                return jsonify({'error': 'None of the specified transactions were found for this user.'}), 404

            already_refunded = [t['id'] for t in target_txs if t['status'] == 'refunded']
            if already_refunded:
                return jsonify({'error': f'Transaction(s) {already_refunded} are already refunded.'}), 400

            now = dt.utcnow()
            admin_id = getattr(request, 'user_id', 0)
            total_refund_amount = Decimal('0.00')

            for tx in target_txs:
                amt = Decimal(str(tx['amount']))
                total_refund_amount += amt
                cur.execute('''
                    UPDATE subscription_transactions
                    SET status = 'refunded',
                        refund_amount = %s,
                        refund_reason = %s,
                        refunded_at = %s,
                        refunded_by = %s,
                        updated_at = NOW()
                    WHERE id = %s
                ''', (amt, reason, now, admin_id, tx['id']))

                # Also update any pending refund request for this transaction
                cur.execute('''
                    UPDATE subscription_refund_requests
                    SET status = 'approved',
                        admin_notes = %s,
                        reviewed_by = %s,
                        reviewed_at = %s
                    WHERE transaction_id = %s AND status = 'pending'
                ''', (f"Approved via Admin Purchase Manager: {reason}", admin_id, now, tx['id']))

            # Recalculate subscription from remaining non-refunded paid transactions
            new_sub_state = recalculate_user_subscription(user_id, cur)

            # Notification to user
            cur.execute('SELECT id FROM farms WHERE owner_id = %s LIMIT 1', (user_id,))
            farm = cur.fetchone()
            if farm:
                if new_sub_state['plan'] != 'free':
                    rem_date_str = (new_sub_state['end_date'] + timedelta(hours=8)).strftime('%b %d, %Y') if new_sub_state.get('end_date') else 'active'
                    msg = f"Refund of ₱{float(total_refund_amount):,.2f} for transaction #{', #'.join([str(t['id']) for t in target_txs])} was processed. Your existing {new_sub_state['plan'].upper()} plan remains active until {rem_date_str}."
                else:
                    msg = f"Refund of ₱{float(total_refund_amount):,.2f} for transaction #{', #'.join([str(t['id']) for t in target_txs])} was processed. Your account has returned to the Standard Free tier."

                cur.execute('''
                    INSERT INTO notifications (farm_id, user_id, title, message, type)
                    VALUES (%s, %s, %s, %s, 'billing')
                ''', (farm['id'], user_id, 'Subscription Refund Processed', msg))

            log_audit_action(
                cur,
                admin_id,
                'Admin',
                'purchase_refunded',
                'subscription_transaction',
                tx_ids[0] if len(tx_ids) == 1 else None,
                f"Refunded {len(target_txs)} purchase(s) totaling ₱{float(total_refund_amount):,.2f} for {user['email']}. Remaining Plan: {new_sub_state['plan'].upper()}. Reason: {reason}",
                {'user_id': user_id, 'transaction_ids': [t['id'] for t in target_txs], 'amount': float(total_refund_amount), 'reason': reason, 'new_plan': new_sub_state['plan']}
            )

            db.commit()

            return jsonify({
                'success': True,
                'message': f"Successfully refunded ₱{float(total_refund_amount):,.2f} for {len(target_txs)} transaction(s). Account remains on {new_sub_state['plan'].upper()}.",
                'subscription': new_sub_state
            })
    finally:
        db.close()


@app.route('/api/admin/transactions/export', methods=['GET'])
@admin_required
def export_transactions_csv():
    """
    Exports official General Revenue Ledger compliant with the standard 3-column running balance
    format required by Philippine accounting standards (BIR General Ledger format).
    """
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT 
                    st.id, st.user_id, CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) as user_name,
                    u.email, st.plan, st.amount, st.currency, st.payment_gateway, st.payment_method,
                    st.checkout_session_id, st.status, st.refund_amount, st.refund_reason, 
                    st.refunded_at, st.created_at
                FROM subscription_transactions st
                LEFT JOIN users u ON u.id = st.user_id
                ORDER BY st.created_at ASC
            ''')
            rows = cur.fetchall()

            output = io.StringIO()
            writer = csv.writer(output)

            now_pht = (dt.utcnow() + timedelta(hours=8)).strftime('%Y-%m-%d %I:%M %p PHT')

            # BIR Official Header Block
            writer.writerow(['CLUCKO PRO AI PLATFORM - OFFICIAL REVENUE & TRANSACTION GENERAL LEDGER'])
            writer.writerow(['Account Title & Code:', '401000 - Service Income (SaaS Platform Subscriptions)'])
            writer.writerow(['Official Reporting Currency:', 'Philippine Peso (PHP - ₱)'])
            writer.writerow(['Ledger Generation Timestamp:', now_pht])
            writer.writerow(['Accounting Standard:', 'Standard 3-Column Running Balance Transaction Ledger (BIR Compliant)'])
            writer.writerow([])

            # Standard 6-Column BIR Ledger Headers + Companion Audit Columns
            writer.writerow([
                'Date & Time (PHT)',
                'Particulars / Description',
                'Reference (Ref / OR)',
                'Debit (₱)',
                'Credit (₱)',
                'Running Balance (₱)',
                'Customer Name',
                'Customer Email',
                'Plan Level',
                'Payment Channel',
                'Transaction Status'
            ])

            running_balance = 0.0
            total_debits = 0.0
            total_credits = 0.0

            for r in rows:
                pht_time = (r['created_at'] + timedelta(hours=8)).strftime('%b %d, %Y %I:%M %p') if r['created_at'] else '—'
                plan_name = (r['plan'] or 'pro').upper() + ' Plan'
                gateway_str = (r['payment_gateway'] or 'paymongo').upper()
                method_str = f" ({r['payment_method']})" if r['payment_method'] else ""
                ref_code = f"CRJ-TX#{r['id']:04d}"

                if r['status'] == 'paid':
                    credit = float(r['amount'])
                    debit = 0.0
                    running_balance += credit
                    total_credits += credit
                    particulars = f"Collection for {plan_name} via {gateway_str}{method_str}"
                    status_label = 'PAID (Settled)'
                elif r['status'] == 'refunded':
                    refund_val = float(r['refund_amount'] or r['amount'])
                    credit = 0.0
                    debit = refund_val
                    running_balance -= debit
                    total_debits += debit
                    ref_code = f"CDJ-REF#{r['id']:04d}"
                    reason = f" - Reason: {r['refund_reason']}" if r['refund_reason'] else ""
                    particulars = f"Official Refund Issued for {plan_name}{reason}"
                    status_label = 'REFUNDED'
                else:
                    credit = 0.0
                    debit = 0.0
                    particulars = f"Checkout Session Created ({plan_name}) - Awaiting Authorization"
                    status_label = 'PENDING (Unsettled)'

                writer.writerow([
                    pht_time,
                    particulars,
                    ref_code,
                    f"{debit:,.2f}" if debit > 0 else '0.00',
                    f"{credit:,.2f}" if credit > 0 else '0.00',
                    f"{running_balance:,.2f}",
                    r['user_name'] or 'Unknown User',
                    r['email'] or '—',
                    r['plan'].upper() if r['plan'] else 'PRO',
                    f"{gateway_str}{method_str}",
                    status_label
                ])

            # Summary Totals Row
            writer.writerow([])
            writer.writerow([
                'TOTALS / NET REVENUE',
                'Grand Cumulative Reconciliation',
                '—',
                f"{total_debits:,.2f}",
                f"{total_credits:,.2f}",
                f"{running_balance:,.2f}",
                '—', '—', '—', '—', f"Net Inflow: ₱{running_balance:,.2f}"
            ])

            csv_data = '\ufeff' + output.getvalue()
            response = Response(csv_data, mimetype='text/csv; charset=utf-8')
            filename = f'clucko_general_revenue_ledger_{dt.now().strftime("%Y%m%d_%H%M")}.csv'
            response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
            response.headers['Access-Control-Expose-Headers'] = 'Content-Disposition'
            return response
    finally:
        db.close()


# ─── 4. SUBSCRIPTION PRICING & PLAN CONFIGURATION ─────────────────────────────
@app.route('/api/admin/plans', methods=['GET'])
@admin_required
def get_admin_plans():
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT plan_key, name, price, currency, duration_days,
                       max_farms, max_chickens_per_farm, max_captures,
                       features, badge, updated_at
                FROM subscription_plans_config
                ORDER BY price ASC
            ''')
            rows = cur.fetchall()
            plans = []
            for r in rows:
                features = r['features']
                if isinstance(features, str):
                    try:
                        features = json.loads(features)
                    except Exception:
                        features = [features]
                plans.append({
                    'plan_key': r['plan_key'],
                    'name': r['name'],
                    'price': float(r['price']),
                    'currency': r['currency'] or 'PHP',
                    'duration_days': r['duration_days'],
                    'max_farms': r['max_farms'],
                    'max_chickens_per_farm': r['max_chickens_per_farm'],
                    'max_captures': r['max_captures'],
                    'features': features,
                    'badge': r['badge'] or '',
                    'updated_at': r['updated_at'].isoformat() if r['updated_at'] else None
                })
            return jsonify({'success': True, 'plans': plans})
    finally:
        db.close()


@app.route('/api/admin/plans/<plan_key>', methods=['PUT'])
@admin_required
def update_admin_plan(plan_key):
    """
    Updates the plan pricing, limits, or perks in the database.
    Optionally broadcasts a notice to all registered users on the Clucko App!
    """
    d = request.json or {}
    name = (d.get('name') or '').strip()
    price = float(d.get('price', 0))
    duration_days = int(d.get('duration_days', 30))
    max_farms = int(d.get('max_farms', 1))
    max_chickens_per_farm = int(d.get('max_chickens_per_farm', 20))
    max_captures = int(d.get('max_captures', 30))
    features = d.get('features', [])
    badge = (d.get('badge') or '').strip()
    notify_users = bool(d.get('notify_users', True)) # Automatically notify users

    if not name:
        return jsonify({'error': 'Plan name is required'}), 400
    if price < 0:
        return jsonify({'error': 'Price cannot be negative'}), 400

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT price, name FROM subscription_plans_config WHERE plan_key = %s', (plan_key,))
            existing = cur.fetchone()
            old_price = float(existing['price']) if existing else 0.0

            cur.execute('''
                INSERT INTO subscription_plans_config
                (plan_key, name, price, currency, duration_days, max_farms, max_chickens_per_farm, max_captures, features, badge, updated_at, updated_by)
                VALUES (%s, %s, %s, 'PHP', %s, %s, %s, %s, %s, %s, NOW(), %s)
                ON CONFLICT (plan_key) DO UPDATE SET
                    name = EXCLUDED.name,
                    price = EXCLUDED.price,
                    duration_days = EXCLUDED.duration_days,
                    max_farms = EXCLUDED.max_farms,
                    max_chickens_per_farm = EXCLUDED.max_chickens_per_farm,
                    max_captures = EXCLUDED.max_captures,
                    features = EXCLUDED.features,
                    badge = EXCLUDED.badge,
                    updated_at = NOW(),
                    updated_by = EXCLUDED.updated_by
                RETURNING *
            ''', (
                plan_key, name, price, duration_days, max_farms, max_chickens_per_farm,
                max_captures, json.dumps(features), badge, getattr(request, 'user_id', 0)
            ))
            updated_plan = cur.fetchone()

            # Synchronize in-memory config in routes_subscriptions
            from routes_subscriptions import reload_plans_from_db
            reload_plans_from_db()

            # Record audit log
            log_audit_action(
                cur,
                getattr(request, 'user_id', 0),
                'Admin',
                'plan_pricing_updated',
                'pricing',
                plan_key,
                f"Updated pricing/configuration for {name}: ₱{old_price:,.2f} -> ₱{price:,.2f}",
                {'plan_key': plan_key, 'old_price': old_price, 'new_price': price, 'notify_users': notify_users}
            )

            # Broadcast notice of price update to all users if requested
            if notify_users and abs(price - old_price) > 0.01:
                title = f"Notice: {name} Pricing Update"
                message = f"The subscription price for {name} has been updated to ₱{price:,.2f} (valid for {duration_days} days). Active subscriptions will remain valid at their current rate until renewal."
                broadcast_system_notification(cur, title, message, notif_type='info')

            db.commit()

            return jsonify({
                'success': True,
                'message': f"Plan '{name}' updated successfully! Clucko App users will now see ₱{price:,.2f}.",
                'plan': updated_plan
            })
    finally:
        db.close()


@app.route('/api/admin/broadcast-notification', methods=['POST'])
@admin_required
def broadcast_custom_notice():
    d = request.json or {}
    title = (d.get('title') or '').strip()
    message = (d.get('message') or '').strip()
    notif_type = d.get('type', 'info')

    if not title or not message:
        return jsonify({'error': 'Title and message are required'}), 400

    db = get_db()
    try:
        with db.cursor() as cur:
            broadcast_system_notification(cur, title, message, notif_type=notif_type)
            log_audit_action(
                cur,
                getattr(request, 'user_id', 0),
                'Admin',
                'broadcast_sent',
                'system',
                None,
                f"Broadcast notice sent to all users: '{title}'",
                {'title': title, 'message': message, 'type': notif_type}
            )
            db.commit()
            return jsonify({'success': True, 'message': 'Broadcast notification sent to all active farms!'})
    finally:
        db.close()


# ─── 5. AUDIT LOGS & COMPLIANCE LEDGER ────────────────────────────────────────
@app.route('/api/admin/audit-logs', methods=['GET'])
@admin_required
def get_admin_audit_logs():
    page = max(1, int(request.args.get('page', 1)))
    limit = max(1, min(100, int(request.args.get('limit', 20))))
    offset = (page - 1) * limit
    action_filter = request.args.get('action', 'all')
    target_type = request.args.get('target_type', 'all')
    operator_filter = request.args.get('operator', 'all')
    search = (request.args.get('search') or '').strip()

    conditions = []
    params = []

    if action_filter != 'all':
        conditions.append("action = %s")
        params.append(action_filter)

    if target_type != 'all':
        conditions.append("target_type = %s")
        params.append(target_type)

    if operator_filter != 'all':
        conditions.append("admin_name = %s")
        params.append(operator_filter)

    if search:
        pattern = f"%{search}%"
        conditions.append("(description ILIKE %s OR admin_name ILIKE %s OR COALESCE(target_id, '') ILIKE %s)")
        params.extend([pattern, pattern, pattern])

    where_sql = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    db = get_db()
    try:
        with db.cursor() as cur:
            # Query distinct operators (from logs + registered admins)
            cur.execute('''
                SELECT DISTINCT admin_name FROM admin_audit_logs WHERE admin_name IS NOT NULL AND admin_name != ''
                UNION
                SELECT CONCAT(first_name, ' ', COALESCE(last_name, '')) as admin_name 
                FROM users 
                WHERE role = 'admin' AND first_name IS NOT NULL AND first_name != ''
            ''')
            op_rows = cur.fetchall()
            ops_set = set(r['admin_name'].strip() for r in op_rows if r.get('admin_name') and r['admin_name'].strip())
            ops_set.add('Super Admin')
            ops_set.discard('Admin')
            ops_set.discard('System SuperAdmin')
            operators = sorted(list(ops_set))

            cur.execute(f"SELECT COUNT(*) as total FROM admin_audit_logs {where_sql}", params)
            total = cur.fetchone()['total']

            cur.execute(f'''
                SELECT id, admin_user_id, admin_name, action, target_type,
                       target_id, description, details, ip_address, created_at
                FROM admin_audit_logs
                {where_sql}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            ''', params + [limit, offset])
            logs = cur.fetchall()

            return jsonify({
                'success': True,
                'logs': logs,
                'operators': operators,
                'total': total,
                'page': page,
                'pages': (total + limit - 1) // limit if total > 0 else 1
            })
    finally:
        db.close()


@app.route('/api/admin/audit-logs/export', methods=['GET'])
@admin_required
def export_audit_logs_csv():
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT id, admin_name, action, target_type, target_id, description, ip_address, created_at
                FROM admin_audit_logs
                ORDER BY created_at DESC
            ''')
            rows = cur.fetchall()

            output = io.StringIO()
            writer = csv.writer(output)

            now_pht = (dt.utcnow() + timedelta(hours=8)).strftime('%Y-%m-%d %I:%M %p PHT')
            writer.writerow(['CLUCKO PRO AI PLATFORM - FORENSIC SECURITY & AUDIT TRAIL'])
            writer.writerow(['Compliance Standard:', 'Data Privacy Act of 2012 (RA 10173) & ISO 27001 Access Ledger'])
            writer.writerow(['Audit Export Timestamp:', now_pht])
            writer.writerow(['Total Recorded Audit Events:', len(rows)])
            writer.writerow([])

            writer.writerow([
                'Log Event ID', 'Timestamp (PHT)', 'Admin Account', 'Action Tag', 
                'Target Entity', 'Target Record ID', 'Particulars / Description', 'Terminal IP Address'
            ])

            for r in rows:
                pht_time = (r['created_at'] + timedelta(hours=8)).strftime('%b %d, %Y %I:%M:%S %p') if r['created_at'] else '—'
                writer.writerow([
                    f"AUD-{r['id']:05d}",
                    pht_time,
                    r['admin_name'],
                    r['action'].upper(),
                    r['target_type'].upper(),
                    r['target_id'] or '—',
                    r['description'],
                    r['ip_address'] or '127.0.0.1'
                ])

            csv_data = '\ufeff' + output.getvalue()
            response = Response(csv_data, mimetype='text/csv; charset=utf-8')
            filename = f'clucko_forensic_audit_trail_{dt.now().strftime("%Y%m%d_%H%M")}.csv'
            response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
            response.headers['Access-Control-Expose-Headers'] = 'Content-Disposition'
            return response
    finally:
        db.close()


# ─── Account Suspension Appeals Review ────────────────────────────────────────
@app.route('/api/admin/appeals', methods=['GET'])
@admin_required
def get_account_appeals():
    """
    Fetches user account suspension appeals for administrative review.
    """
    status_filter = request.args.get('status', 'all')
    db = get_db()
    try:
        with db.cursor() as cur:
            sql = '''
                SELECT a.id, a.user_id, a.user_email, a.user_name, a.reason,
                       a.appeal_text, a.status, a.admin_notes, a.created_at, a.resolved_at,
                       u.role as user_role, u.is_active as current_active
                FROM account_appeals a
                LEFT JOIN users u ON u.id = a.user_id
            '''
            params = []
            if status_filter != 'all':
                sql += ' WHERE a.status = %s'
                params.append(status_filter)
            sql += ' ORDER BY a.created_at DESC LIMIT 100'

            cur.execute(sql, params)
            appeals = cur.fetchall()
            return jsonify({'success': True, 'appeals': appeals})
    finally:
        db.close()


@app.route('/api/admin/appeals/<int:appeal_id>/action', methods=['POST'])
@admin_required
def handle_account_appeal_action(appeal_id):
    """
    Processes an account suspension appeal: approves and reactivates user, or rejects.
    """
    d = request.json or {}
    action = d.get('action')  # 'approve' or 'reject'
    admin_notes = (d.get('admin_notes') or '').strip()

    if action not in ('approve', 'reject'):
        return jsonify({'error': 'action must be approve or reject'}), 400

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT * FROM account_appeals WHERE id = %s', (appeal_id,))
            appeal = cur.fetchone()
            if not appeal:
                return jsonify({'error': 'Appeal record not found'}), 404

            user_id = appeal['user_id']
            new_status = 'approved' if action == 'approve' else 'rejected'

            cur.execute('''
                UPDATE account_appeals
                SET status = %s, admin_notes = %s, resolved_at = NOW()
                WHERE id = %s
            ''', (new_status, admin_notes, appeal_id))

            if action == 'approve' and user_id:
                # Reactivate user account
                cur.execute('UPDATE users SET is_active = TRUE, suspension_reason = NULL WHERE id = %s', (user_id,))
                from db import invalidate_user_suspension_cache
                invalidate_user_suspension_cache(user_id)

                # Send approval notification
                cur.execute('SELECT id FROM farms WHERE owner_id = %s LIMIT 1', (user_id,))
                f_row = cur.fetchone()
                farm_id = f_row['id'] if f_row else None
                cur.execute('''
                    INSERT INTO notifications (farm_id, user_id, title, message, type)
                    VALUES (%s, %s, 'Account Appeal Approved!', 'Your account suspension appeal has been approved by administration. Full access has been restored.', 'success')
                ''', (farm_id, user_id))

            # Log audit
            log_audit_action(
                cur,
                getattr(request, 'user_id', 0),
                'Admin',
                f'appeal_{new_status}',
                'user',
                user_id or 0,
                f"Appeal #{appeal_id} for {appeal['user_email']} was {new_status}. Notes: {admin_notes or 'None'}",
                {'appeal_id': appeal_id, 'action': action, 'admin_notes': admin_notes}
            )

            db.commit()
            return jsonify({
                'success': True,
                'message': f"Appeal has been {new_status}."
            })
    finally:
        db.close()
