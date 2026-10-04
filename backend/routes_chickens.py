from flask import request, jsonify
import json
from app import app
from db import get_db, token_required

@app.route('/api/chickens', methods=['GET'])
@token_required
def get_chickens():
    raw_farm_id = request.args.get('farm_id')
    farm_id = None
    if raw_farm_id and str(raw_farm_id).strip().lower() not in ('', 'all', 'undefined', 'null', 'none'):
        try:
            farm_id = int(raw_farm_id)
        except (ValueError, TypeError):
            farm_id = None

    db = get_db()
    try:
        with db.cursor() as cur:
            if farm_id:
                cur.execute('''
                    SELECT f.id FROM farms f
                    LEFT JOIN farm_members fm ON fm.farm_id = f.id AND fm.user_id = %s
                    WHERE f.id = %s AND (f.owner_id = %s OR fm.user_id = %s)
                ''', (request.user_id, farm_id, request.user_id, request.user_id))
                if not cur.fetchone():
                    return jsonify({'error': 'No access to this farm'}), 403
                cur.execute('''
                    SELECT c.id, c.user_id, c.farm_id, c.qr_code, c.chicken_name, c.location,
                           c.status, c.status_color, c.created_at, c.updated_at,
                           COALESCE(
                               NULLIF(c.photo_url, ''),
                               (SELECT ic.image_url FROM image_captures ic 
                                WHERE ic.chicken_id = c.id AND ic.image_url IS NOT NULL 
                                ORDER BY ic.capture_datetime DESC LIMIT 1),
                               (SELECT hh.image_url FROM health_history hh 
                                WHERE hh.chicken_id = c.id AND hh.image_url IS NOT NULL 
                                ORDER BY hh.recorded_at DESC LIMIT 1)
                           ) AS photo_url,
                           f.farm_name,
                           TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) as added_by_name,
                           u.role as added_by_role
                    FROM chickens c
                    LEFT JOIN farms f ON f.id = c.farm_id
                    LEFT JOIN users u ON u.id = c.user_id
                    WHERE c.farm_id=%s ORDER BY c.created_at DESC
                ''', (farm_id,))
            else:
                cur.execute('''
                    SELECT c.id, c.user_id, c.farm_id, c.qr_code, c.chicken_name, c.location,
                           c.status, c.status_color, c.created_at, c.updated_at,
                           COALESCE(
                               NULLIF(c.photo_url, ''),
                               (SELECT ic.image_url FROM image_captures ic 
                                WHERE ic.chicken_id = c.id AND ic.image_url IS NOT NULL 
                                ORDER BY ic.capture_datetime DESC LIMIT 1),
                               (SELECT hh.image_url FROM health_history hh 
                                WHERE hh.chicken_id = c.id AND hh.image_url IS NOT NULL 
                                ORDER BY hh.recorded_at DESC LIMIT 1)
                           ) AS photo_url,
                           f.farm_name,
                           TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) as added_by_name,
                           u.role as added_by_role
                    FROM chickens c
                    LEFT JOIN farms f ON f.id = c.farm_id
                    LEFT JOIN users u ON u.id = c.user_id
                    WHERE c.user_id = %s
                       OR c.farm_id IN (
                           SELECT id FROM farms WHERE owner_id = %s
                           UNION
                           SELECT farm_id FROM farm_members WHERE user_id = %s
                       )
                    ORDER BY c.created_at DESC
                ''', (request.user_id, request.user_id, request.user_id))
            chickens = cur.fetchall()
        return jsonify(chickens)
    except Exception as e:
        print(f"[ERROR in get_chickens]: {e}")
        return jsonify({'error': 'Failed to retrieve chickens', 'details': str(e)}), 500
    finally:
        db.close()


@app.route('/api/chickens', methods=['POST'])
@token_required
def create_chicken():
    d = request.json or {}
    chicken_name = str(d.get('chicken_name', '')).strip()
    qr_code = str(d.get('qr_code', '')).strip()
    if not chicken_name or len(chicken_name) > 100:
        return jsonify({'error': 'chicken_name is required (maximum 100 characters)'}), 400
    if not qr_code or len(qr_code) > 64:
        return jsonify({'error': 'qr_code is required (maximum 64 characters)'}), 400

    location = str(d.get('location', '')).strip()[:200]
    raw_photo = d.get('photo_url')
    if raw_photo and str(raw_photo).strip().lower().startswith('javascript:'):
        return jsonify({'error': 'Invalid photo URL protocol'}), 400
    photo_url = str(raw_photo).strip() if raw_photo else None
    db = get_db()
    try:
        with db.cursor() as cur:
            farm_id = d.get('farm_id')
            if farm_id:
                cur.execute('''
                    SELECT f.id FROM farms f
                    LEFT JOIN farm_members fm ON fm.farm_id = f.id AND fm.user_id = %s
                    WHERE f.id = %s AND (f.owner_id = %s OR fm.user_id = %s)
                ''', (request.user_id, farm_id, request.user_id, request.user_id))
                if not cur.fetchone():
                    return jsonify({'error': 'No access to this farm'}), 403

            # Check subscription chicken quota per farm
            owner_id = request.user_id
            if farm_id:
                cur.execute('SELECT owner_id FROM farms WHERE id = %s', (farm_id,))
                f_owner = cur.fetchone()
                if f_owner and f_owner.get('owner_id'):
                    owner_id = f_owner['owner_id']

            from routes_subscriptions import get_effective_subscription
            sub = get_effective_subscription(owner_id, cur, db)
            if sub:
                max_chickens = sub['limits']['max_chickens_per_farm']
                if farm_id:
                    cur.execute('SELECT COUNT(*) as cnt FROM chickens WHERE farm_id = %s', (farm_id,))
                else:
                    cur.execute('SELECT COUNT(*) as cnt FROM chickens WHERE user_id = %s AND farm_id IS NULL', (owner_id,))
                current_chickens = cur.fetchone()['cnt']
                if current_chickens >= max_chickens:
                    return jsonify({
                        'error': f"Chicken limit reached ({current_chickens}/{max_chickens}). Please upgrade your plan to add more chickens.",
                        'code': 'PLAN_CHICKEN_LIMIT_EXCEEDED',
                        'max_chickens': max_chickens,
                        'current_chickens': current_chickens,
                        'plan': sub['plan'],
                        'plan_name': sub['plan_name']
                    }), 403

            # Uniqueness check scoped per farm (or per user if unassigned)
            if farm_id:
                cur.execute('''
                    SELECT id FROM chickens
                    WHERE farm_id = %s AND qr_code = %s
                ''', (farm_id, qr_code))
            else:
                cur.execute('''
                    SELECT id FROM chickens
                    WHERE farm_id IS NULL AND user_id = %s AND qr_code = %s
                ''', (request.user_id, qr_code))
            if cur.fetchone():
                return jsonify({'error': 'QR code already exists in this farm'}), 400

            # Unique gamefowl name check per farm (case-insensitive)
            if farm_id:
                cur.execute('''
                    SELECT id FROM chickens
                    WHERE farm_id = %s AND LOWER(TRIM(chicken_name)) = LOWER(TRIM(%s))
                ''', (farm_id, chicken_name))
            else:
                cur.execute('''
                    SELECT id FROM chickens
                    WHERE farm_id IS NULL AND user_id = %s AND LOWER(TRIM(chicken_name)) = LOWER(TRIM(%s))
                ''', (request.user_id, chicken_name))
            if cur.fetchone():
                return jsonify({'error': f'A gamefowl named "{chicken_name}" already exists in this farm'}), 400

            # Idempotency check: prevent duplicate chicken creation within 4 seconds by same user
            cur.execute('''
                SELECT * FROM chickens
                WHERE user_id = %s AND chicken_name = %s
                  AND (farm_id = %s OR (farm_id IS NULL AND %s IS NULL))
                  AND created_at >= NOW() - INTERVAL '4 SECOND'
                ORDER BY created_at DESC LIMIT 1
            ''', (request.user_id, chicken_name, farm_id, farm_id))
            dup_chicken = cur.fetchone()
            if dup_chicken:
                return jsonify(dup_chicken), 200

            cur.execute('''
                INSERT INTO chickens
                (user_id, farm_id, qr_code, chicken_name, location, photo_url)
                VALUES (%s, %s, %s, %s, %s, %s)
            ''', (request.user_id, farm_id, qr_code, chicken_name,
                  location, photo_url))
            chicken_id = cur.lastrowid

            if farm_id:
                cur.execute('SELECT first_name, last_name, role FROM users WHERE id=%s', (request.user_id,))
                u_row = cur.fetchone()
                u_name = f"{u_row['first_name']} {u_row['last_name'] or ''}".strip() if u_row else 'User'
                u_role = (u_row['role'] if u_row else 'member').capitalize()
                cur.execute('''
                    INSERT INTO notifications (farm_id, user_id, title, message, type, chicken_id, chicken_name)
                    VALUES (%s, %s, %s, %s, 'info', %s, %s)
                ''', (farm_id, request.user_id, f"New Gamefowl Added: {chicken_name}",
                      f"{chicken_name} ({qr_code}) was registered by {u_name} ({u_role}).",
                      chicken_id, chicken_name))

            db.commit()
            cur.execute('SELECT * FROM chickens WHERE id=%s', (chicken_id,))
            chicken = cur.fetchone()
        return jsonify(chicken)
    except Exception as e:
        if 'Duplicate entry' in str(e) or 'duplicate key' in str(e).lower() or 'unique' in str(e).lower():
            return jsonify({'error': 'QR code already exists in this farm'}), 400
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

import re

@app.route('/api/chickens/next-code', methods=['GET'])
@token_required
def get_next_chicken_code():
    farm_id = request.args.get('farm_id')
    db = get_db()
    try:
        with db.cursor() as cur:
            if farm_id:
                cur.execute('SELECT qr_code FROM chickens WHERE farm_id = %s', (farm_id,))
            else:
                cur.execute('SELECT qr_code FROM chickens WHERE farm_id IS NULL AND user_id = %s', (request.user_id,))
            rows = cur.fetchall()

            existing_codes = set()
            nums = []
            for r in rows:
                code = (r.get('qr_code') or '').strip()
                if not code:
                    continue
                existing_codes.add(code.upper())
                m = re.search(r'(?:CK|CH)[-_]?(\d+)', code, re.IGNORECASE)
                if m:
                    try:
                        nums.append(int(m.group(1)))
                    except ValueError:
                        pass

            candidate_num = (max(nums) + 1) if nums else 1
            while f"CK-{candidate_num:03d}".upper() in existing_codes:
                candidate_num += 1

            return jsonify({'next_code': f"CK-{candidate_num:03d}"})
    finally:
        db.close()

def _resolve_chicken(cur, user_id, cid, farm_id=None):
    """Resolve chicken by numeric id or qr_code string, checking access permissions."""
    if not farm_id and request and hasattr(request, 'args'):
        farm_id = request.args.get('farm_id')

    select_fields = '''
        c.id, c.user_id, c.farm_id, c.qr_code, c.chicken_name, c.location,
        c.status, c.status_color, c.created_at, c.updated_at,
        COALESCE(
            NULLIF(c.photo_url, ''),
            (SELECT hh.image_url FROM health_history hh 
             WHERE hh.chicken_id = c.id AND hh.image_url IS NOT NULL AND LENGTH(hh.image_url) > 100 
             ORDER BY hh.recorded_at DESC LIMIT 1),
            (SELECT ic.image_url FROM image_captures ic 
             WHERE ic.chicken_id = c.id AND ic.image_url IS NOT NULL AND LENGTH(ic.image_url) > 100 
             ORDER BY ic.capture_datetime DESC LIMIT 1)
        ) AS photo_url,
        f.farm_name,
        TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) as added_by_name,
        u.role as added_by_role
    '''

    if str(cid).isdigit():
        if farm_id:
            cur.execute(f'''
                SELECT {select_fields} FROM chickens c
                LEFT JOIN farm_members fm ON fm.farm_id = c.farm_id AND fm.user_id = %s
                LEFT JOIN farms f ON f.id = c.farm_id
                LEFT JOIN users u ON u.id = c.user_id
                WHERE (c.id = %s OR (c.qr_code = %s AND c.farm_id = %s))
                  AND (c.user_id = %s OR fm.user_id = %s OR f.owner_id = %s)
                LIMIT 1
            ''', (user_id, int(cid), str(cid), farm_id, user_id, user_id, user_id))
        else:
            cur.execute(f'''
                SELECT {select_fields} FROM chickens c
                LEFT JOIN farm_members fm ON fm.farm_id = c.farm_id AND fm.user_id = %s
                LEFT JOIN farms f ON f.id = c.farm_id
                LEFT JOIN users u ON u.id = c.user_id
                WHERE (c.id = %s OR c.qr_code = %s) AND (c.user_id = %s OR fm.user_id = %s OR f.owner_id = %s)
                LIMIT 1
            ''', (user_id, int(cid), str(cid), user_id, user_id, user_id))
    else:
        if farm_id:
            cur.execute(f'''
                SELECT {select_fields} FROM chickens c
                LEFT JOIN farm_members fm ON fm.farm_id = c.farm_id AND fm.user_id = %s
                LEFT JOIN farms f ON f.id = c.farm_id
                LEFT JOIN users u ON u.id = c.user_id
                WHERE c.qr_code = %s AND c.farm_id = %s
                  AND (c.user_id = %s OR fm.user_id = %s OR f.owner_id = %s)
                LIMIT 1
            ''', (user_id, str(cid), farm_id, user_id, user_id, user_id))
        else:
            cur.execute(f'''
                SELECT {select_fields} FROM chickens c
                LEFT JOIN farm_members fm ON fm.farm_id = c.farm_id AND fm.user_id = %s
                LEFT JOIN farms f ON f.id = c.farm_id
                LEFT JOIN users u ON u.id = c.user_id
                WHERE c.qr_code = %s AND (c.user_id = %s OR fm.user_id = %s OR f.owner_id = %s)
                LIMIT 1
            ''', (user_id, str(cid), user_id, user_id, user_id))
    return cur.fetchone()


@app.route('/api/chickens/<cid>', methods=['GET'])
@token_required
def get_chicken(cid):
    db = get_db()
    try:
        with db.cursor() as cur:
            chicken = _resolve_chicken(cur, request.user_id, cid)
            if not chicken:
                return jsonify({'error': 'Not found or no access'}), 404
            return jsonify(chicken)
    finally:
        db.close()


@app.route('/api/chickens/<cid>', methods=['DELETE'])
@token_required
def delete_chicken(cid):
    db = get_db()
    try:
        with db.cursor() as cur:
            chicken = _resolve_chicken(cur, request.user_id, cid)
            if not chicken:
                return jsonify({'error': 'Not found or no access'}), 404
            real_id = chicken['id'] if isinstance(chicken, dict) else chicken[0]
            cur.execute('DELETE FROM chickens WHERE id=%s', (real_id,))
            db.commit()
        return jsonify({'success': True})
    finally:
        db.close()


@app.route('/api/chickens/<cid>/history', methods=['GET'])
@token_required
def get_chicken_history(cid):
    db = get_db()
    try:
        with db.cursor() as cur:
            chicken = _resolve_chicken(cur, request.user_id, cid)
            if not chicken:
                return jsonify({'error': 'Not found or no access'}), 404

            real_id = chicken['id'] if isinstance(chicken, dict) else chicken[0]

            cur.execute('''
                SELECT hh.*, 
                       COALESCE(hh.image_url, ic.image_url) AS image_url,
                       d.disease_name, d.severity, d.color,
                       CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) AS captured_by_name,
                       u.role AS captured_by_role,
                       u.email AS captured_by_email,
                       dr.all_predictions
                FROM health_history hh
                LEFT JOIN image_captures ic ON hh.image_id = ic.id
                LEFT JOIN detection_results dr ON dr.image_id = hh.image_id
                LEFT JOIN diseases d ON hh.disease_id = d.id
                LEFT JOIN users u ON hh.user_id = u.id
                WHERE hh.chicken_id=%s
                ORDER BY hh.recorded_at DESC
            ''', (real_id,))
            rows = cur.fetchall()
            for r in rows:
                ap = r.get('all_predictions')
                if isinstance(ap, str):
                    try:
                        ap = json.loads(ap)
                    except Exception:
                        ap = {}
                if isinstance(ap, dict):
                    r['gradcam_image'] = ap.get('gradcam_image')
                else:
                    r['gradcam_image'] = None
            return jsonify(rows)
    finally:
        db.close()


@app.route('/api/chickens/<cid>', methods=['PUT'])
@token_required
def update_chicken(cid):
    db = get_db()
    try:
        with db.cursor() as cur:
            chicken = _resolve_chicken(cur, request.user_id, cid)
            if not chicken:
                return jsonify({'error': 'Not found or no access'}), 404

            real_id = chicken['id'] if isinstance(chicken, dict) else chicken[0]

            d = request.json or {}
            updates = {}
            if 'chicken_name' in d and d['chicken_name']:
                updates['chicken_name'] = str(d['chicken_name']).strip()[:100]
            if 'location' in d:
                updates['location'] = str(d.get('location') or '').strip()[:200]
            if 'photo_url' in d:
                p_url = str(d.get('photo_url') or '').strip()
                if p_url.lower().startswith('javascript:'):
                    return jsonify({'error': 'Invalid photo URL protocol'}), 400
                updates['photo_url'] = p_url
            if 'farm_id' in d:
                updates['farm_id'] = int(d['farm_id']) if d['farm_id'] is not None else None

            if not updates:
                return jsonify({'error': 'Nothing to update'}), 400

            # If moving chicken to a different farm, verify permissions and quota
            if 'farm_id' in updates and updates['farm_id'] is not None:
                new_farm_id = updates['farm_id']
                cur.execute('''
                    SELECT f.id, f.owner_id FROM farms f
                    LEFT JOIN farm_members fm ON fm.farm_id = f.id AND fm.user_id = %s
                    WHERE f.id = %s AND (f.owner_id = %s OR fm.user_id = %s)
                ''', (request.user_id, new_farm_id, request.user_id, request.user_id))
                target_farm = cur.fetchone()
                if not target_farm:
                    return jsonify({'error': 'No access to destination farm'}), 403

                from routes_subscriptions import get_effective_subscription
                target_owner = target_farm['owner_id']
                sub = get_effective_subscription(target_owner, cur, db)
                if sub:
                    max_chickens = sub['limits']['max_chickens_per_farm']
                    cur.execute('SELECT COUNT(*) as cnt FROM chickens WHERE farm_id = %s', (new_farm_id,))
                    current_chickens = cur.fetchone()['cnt']
                    if current_chickens >= max_chickens:
                        return jsonify({
                            'error': f"Destination farm chicken limit reached ({current_chickens}/{max_chickens}). Upgrade required.",
                            'code': 'PLAN_CHICKEN_LIMIT_EXCEEDED'
                        }), 403

            # If chicken_name or farm_id is being updated, verify unique name in destination farm
            if 'chicken_name' in updates or 'farm_id' in updates:
                target_farm_id = updates.get('farm_id', chicken.get('farm_id') if isinstance(chicken, dict) else None)
                new_name = updates.get('chicken_name', chicken.get('chicken_name') if isinstance(chicken, dict) else None)
                if new_name:
                    if target_farm_id:
                        cur.execute('''
                            SELECT id FROM chickens
                            WHERE farm_id = %s AND LOWER(TRIM(chicken_name)) = LOWER(TRIM(%s)) AND id != %s
                        ''', (target_farm_id, new_name, real_id))
                    else:
                        cur.execute('''
                            SELECT id FROM chickens
                            WHERE farm_id IS NULL AND user_id = %s AND LOWER(TRIM(chicken_name)) = LOWER(TRIM(%s)) AND id != %s
                        ''', (request.user_id, new_name, real_id))
                    if cur.fetchone():
                        return jsonify({'error': f'A gamefowl named "{new_name}" already exists in this farm'}), 400

            set_clause = ', '.join(f'{k}=%s' for k in updates)
            cur.execute(f'UPDATE chickens SET {set_clause} WHERE id=%s', (*updates.values(), real_id))
            db.commit()

            cur.execute('SELECT * FROM chickens WHERE id=%s', (real_id,))
            updated = cur.fetchone()
        return jsonify(updated)
    finally:
        db.close()

@app.route('/api/stats', methods=['GET'])
@token_required
def get_stats():
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT COUNT(*) as total,
                  SUM(status='HEALTHY') as healthy,
                  SUM(status='WARNING') as warning,
                  SUM(status='CRITICAL') as critical
                FROM chickens WHERE user_id=%s
            ''', (request.user_id,))
            return jsonify(cur.fetchone())
    finally:
        db.close()