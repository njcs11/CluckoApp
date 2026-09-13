from flask import request, jsonify
from db import get_db, token_required
from app import app


def get_accessible_farm_ids(cur, user_id):
    """Returns a list of farm IDs accessible to the user (as owner or caretaker)."""
    cur.execute('''
        SELECT DISTINCT f.id FROM farms f
        LEFT JOIN farm_members fm ON fm.farm_id = f.id
        WHERE f.owner_id = %s OR fm.user_id = %s
    ''', (user_id, user_id))
    rows = cur.fetchall()
    return [r['id'] if isinstance(r, dict) else r[0] for r in rows]


# ─── GET /api/notifications ──────────────────────────────────────────────────
@app.route('/api/notifications', methods=['GET'])
@token_required
def get_notifications():
    db = get_db()
    try:
        with db.cursor() as cur:
            farm_ids = get_accessible_farm_ids(cur, request.user_id)
            if not farm_ids:
                return jsonify([])

            placeholders = ', '.join(['%s'] * len(farm_ids))
            query = f'''
                SELECT 
                    n.id,
                    n.farm_id,
                    f.farm_name,
                    n.user_id,
                    CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) AS creator_name,
                    u.role AS creator_role,
                    n.title,
                    n.message,
                    n.type,
                    n.chicken_id,
                    n.chicken_name,
                    n.created_at,
                    CASE WHEN nr.read_at IS NOT NULL THEN 1 ELSE 0 END AS is_read
                FROM notifications n
                JOIN farms f ON f.id = n.farm_id
                LEFT JOIN users u ON u.id = n.user_id
                LEFT JOIN notification_reads nr 
                    ON nr.notification_id = n.id AND nr.user_id = %s
                WHERE n.farm_id IN ({placeholders})
                ORDER BY n.created_at DESC
                LIMIT 50
            '''
            cur.execute(query, (request.user_id, *farm_ids))
            rows = cur.fetchall()

            # Format rows
            results = []
            for r in rows:
                results.append({
                    'id': str(r['id']),
                    'farm_id': r['farm_id'],
                    'farm_name': r['farm_name'],
                    'user_id': r['user_id'],
                    'creator_name': r['creator_name'] or 'Farm Member',
                    'creator_role': r['creator_role'] or 'member',
                    'title': r['title'],
                    'message': r['message'],
                    'type': r['type'] or 'info',
                    'chickenId': str(r['chicken_id']) if r['chicken_id'] else None,
                    'chickenName': r['chicken_name'] or None,
                    'timestamp': r['created_at'].isoformat() if hasattr(r['created_at'], 'isoformat') else str(r['created_at']),
                    'read': bool(r['is_read']),
                })
            return jsonify(results)
    finally:
        db.close()


# ─── POST /api/notifications ─────────────────────────────────────────────────
@app.route('/api/notifications', methods=['POST'])
@token_required
def create_notification():
    d = request.json or {}
    farm_id = d.get('farm_id')
    title = d.get('title')
    message = d.get('message')
    notif_type = d.get('type', 'info')
    chicken_id = d.get('chicken_id')
    chicken_name = d.get('chicken_name')

    if not title or not message:
        return jsonify({'error': 'title and message required'}), 400

    db = get_db()
    try:
        with db.cursor() as cur:
            accessible = get_accessible_farm_ids(cur, request.user_id)
            if farm_id:
                if int(farm_id) not in accessible:
                    return jsonify({'error': 'No access to specified farm'}), 403
                target_farm_id = int(farm_id)
            else:
                if not accessible:
                    return jsonify({'error': 'User has no associated farms'}), 400
                target_farm_id = accessible[0]

            cur.execute('''
                INSERT INTO notifications 
                (farm_id, user_id, title, message, type, chicken_id, chicken_name)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            ''', (target_farm_id, request.user_id, title, message, notif_type, chicken_id, chicken_name))
            notif_id = cur.lastrowid
            db.commit()

            return jsonify({
                'success': True,
                'id': str(notif_id),
                'farm_id': target_farm_id,
            }), 201
    except Exception as e:
        db.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


# ─── PUT /api/notifications/<nid>/read ───────────────────────────────────────
@app.route('/api/notifications/<int:nid>/read', methods=['PUT'])
@token_required
def mark_notification_read(nid):
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                INSERT IGNORE INTO notification_reads (notification_id, user_id)
                VALUES (%s, %s)
            ''', (nid, request.user_id))
            db.commit()
            return jsonify({'success': True})
    finally:
        db.close()


# ─── PUT /api/notifications/read-all ─────────────────────────────────────────
@app.route('/api/notifications/read-all', methods=['PUT'])
@token_required
def mark_all_notifications_read():
    db = get_db()
    try:
        with db.cursor() as cur:
            farm_ids = get_accessible_farm_ids(cur, request.user_id)
            if not farm_ids:
                return jsonify({'success': True})

            placeholders = ', '.join(['%s'] * len(farm_ids))
            cur.execute(f'''
                INSERT IGNORE INTO notification_reads (notification_id, user_id)
                SELECT n.id, %s FROM notifications n
                WHERE n.farm_id IN ({placeholders})
            ''', (request.user_id, *farm_ids))
            db.commit()
            return jsonify({'success': True})
    finally:
        db.close()


# ─── DELETE /api/notifications/<nid> ─────────────────────────────────────────
@app.route('/api/notifications/<int:nid>', methods=['DELETE'])
@token_required
def delete_notification(nid):
    db = get_db()
    try:
        with db.cursor() as cur:
            # Check ownership or admin role
            farm_ids = get_accessible_farm_ids(cur, request.user_id)
            if not farm_ids:
                return jsonify({'error': 'Not found or no access'}), 404

            placeholders = ', '.join(['%s'] * len(farm_ids))
            cur.execute(f'''
                SELECT id FROM notifications 
                WHERE id = %s AND farm_id IN ({placeholders})
            ''', (nid, *farm_ids))
            if not cur.fetchone():
                return jsonify({'error': 'Not found or no access'}), 404

            # Mark as read or delete
            cur.execute('DELETE FROM notification_reads WHERE notification_id = %s', (nid,))
            cur.execute('DELETE FROM notifications WHERE id = %s', (nid,))
            db.commit()
            return jsonify({'success': True})
    finally:
        db.close()


# ─── DELETE /api/notifications (clear all) ───────────────────────────────────
@app.route('/api/notifications', methods=['DELETE'])
@token_required
def clear_all_notifications():
    db = get_db()
    try:
        with db.cursor() as cur:
            farm_ids = get_accessible_farm_ids(cur, request.user_id)
            if not farm_ids:
                return jsonify({'success': True})

            placeholders = ', '.join(['%s'] * len(farm_ids))
            # Mark all as read for this user so they don't see them again
            cur.execute(f'''
                INSERT IGNORE INTO notification_reads (notification_id, user_id)
                SELECT n.id, %s FROM notifications n
                WHERE n.farm_id IN ({placeholders})
            ''', (request.user_id, *farm_ids))
            db.commit()
            return jsonify({'success': True})
    finally:
        db.close()


# ─── GET /api/activities ─────────────────────────────────────────────────────
@app.route('/api/activities', methods=['GET'])
@token_required
def get_activities():
    """
    Returns real recent activities across all farms accessible to the user,
    with full attribution (who captured/checked it), chicken info, and diagnosis.
    """
    db = get_db()
    try:
        with db.cursor() as cur:
            farm_ids = get_accessible_farm_ids(cur, request.user_id)
            if not farm_ids:
                return jsonify([])

            placeholders = ', '.join(['%s'] * len(farm_ids))
            query = f'''
                SELECT 
                    ic.id AS image_id,
                    ic.chicken_id,
                    c.chicken_name,
                    c.qr_code,
                    c.farm_id,
                    f.farm_name,
                    ic.image_url,
                    ic.capture_datetime AS timestamp,
                    dr.predicted_condition,
                    dr.confidence_score,
                    dr.severity_level,
                    CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) AS captured_by_name,
                    u.role AS captured_by_role
                FROM image_captures ic
                JOIN chickens c ON ic.chicken_id = c.id
                JOIN farms f ON f.id = c.farm_id
                LEFT JOIN detection_results dr ON dr.image_id = ic.id
                LEFT JOIN users u ON u.id = ic.user_id
                WHERE f.id IN ({placeholders})
                ORDER BY ic.capture_datetime DESC
                LIMIT 30
            '''
            cur.execute(query, farm_ids)
            rows = cur.fetchall()

            activities = []
            for r in rows:
                cond = r['predicted_condition'] or 'Healthy'
                sev = (r['severity_level'] or 'none').lower()
                status = 'Critical' if sev == 'critical' else 'Warning' if sev in ('warning', 'moderate', 'high') else 'Healthy'
                activities.append({
                    'id': str(r['image_id']),
                    'chicken_id': str(r['chicken_id']),
                    'chicken_name': r['chicken_name'],
                    'qr_code': r['qr_code'],
                    'farm_id': r['farm_id'],
                    'farm_name': r['farm_name'],
                    'condition': cond,
                    'confidence': round(float(r['confidence_score']), 1) if r['confidence_score'] is not None else 0,
                    'severity': sev,
                    'status': status,
                    'captured_by_name': r['captured_by_name'] or 'Farm Member',
                    'captured_by_role': (r['captured_by_role'] or 'member').capitalize(),
                    'image_url': r['image_url'],
                    'timestamp': r['timestamp'].isoformat() if hasattr(r['timestamp'], 'isoformat') else str(r['timestamp']),
                })
            return jsonify(activities)
    finally:
        db.close()
