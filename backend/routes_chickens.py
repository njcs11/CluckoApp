from flask import request, jsonify
from app import app
from db import get_db, token_required

@app.route('/api/chickens', methods=['GET'])
@token_required
def get_chickens():
    farm_id = request.args.get('farm_id')
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
                    SELECT c.*, f.farm_name FROM chickens c
                    LEFT JOIN farms f ON f.id = c.farm_id
                    WHERE c.farm_id=%s ORDER BY c.created_at DESC
                ''', (farm_id,))
            else:
                cur.execute('''
                    SELECT DISTINCT c.*, f.farm_name FROM chickens c
                    LEFT JOIN farm_members fm ON fm.farm_id = c.farm_id AND fm.user_id = %s
                    LEFT JOIN farms f ON f.id = c.farm_id
                    WHERE c.user_id = %s OR fm.user_id = %s OR f.owner_id = %s
                    ORDER BY c.created_at DESC
                ''', (request.user_id, request.user_id,
                      request.user_id, request.user_id))
            chickens = cur.fetchall()
        return jsonify(chickens)
    finally:
        db.close()


@app.route('/api/chickens', methods=['POST'])
@token_required
def create_chicken():
    d = request.json
    if not d.get('chicken_name') or not d.get('qr_code'):
        return jsonify({'error': 'chicken_name and qr_code required'}), 400
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

            # Idempotency check: prevent duplicate chicken creation within 4 seconds by same user
            cur.execute('''
                SELECT * FROM chickens
                WHERE user_id = %s AND chicken_name = %s
                  AND (farm_id = %s OR (farm_id IS NULL AND %s IS NULL))
                  AND created_at >= NOW() - INTERVAL 4 SECOND
                ORDER BY created_at DESC LIMIT 1
            ''', (request.user_id, d['chicken_name'], farm_id, farm_id))
            dup_chicken = cur.fetchone()
            if dup_chicken:
                return jsonify(dup_chicken), 200

            cur.execute('''
                INSERT INTO chickens
                (user_id, farm_id, qr_code, chicken_name, location, photo_url)
                VALUES (%s, %s, %s, %s, %s, %s)
            ''', (request.user_id, farm_id, d['qr_code'], d['chicken_name'],
                  d.get('location', ''), d.get('photo_url', '')))
            chicken_id = cur.lastrowid

            if farm_id:
                cur.execute('SELECT first_name, last_name, role FROM users WHERE id=%s', (request.user_id,))
                u_row = cur.fetchone()
                u_name = f"{u_row['first_name']} {u_row['last_name'] or ''}".strip() if u_row else 'User'
                u_role = (u_row['role'] if u_row else 'member').capitalize()
                cur.execute('''
                    INSERT INTO notifications (farm_id, user_id, title, message, type, chicken_id, chicken_name)
                    VALUES (%s, %s, %s, %s, 'info', %s, %s)
                ''', (farm_id, request.user_id, f"New Gamefowl Added: {d['chicken_name']}",
                      f"{d['chicken_name']} ({d['qr_code']}) was registered by {u_name} ({u_role}).",
                      chicken_id, d['chicken_name']))

            db.commit()
            cur.execute('SELECT * FROM chickens WHERE id=%s', (chicken_id,))
            chicken = cur.fetchone()
        return jsonify(chicken)
    except Exception as e:
        if 'Duplicate entry' in str(e):
            return jsonify({'error': 'QR code already exists'}), 400
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

def _resolve_chicken(cur, user_id, cid):
    """Resolve chicken by numeric id or qr_code string, checking access permissions."""
    if str(cid).isdigit():
        cur.execute('''
            SELECT c.* FROM chickens c
            LEFT JOIN farm_members fm ON fm.farm_id = c.farm_id AND fm.user_id = %s
            LEFT JOIN farms f ON f.id = c.farm_id
            WHERE (c.id = %s OR c.qr_code = %s) AND (c.user_id = %s OR fm.user_id = %s OR f.owner_id = %s)
            LIMIT 1
        ''', (user_id, int(cid), str(cid), user_id, user_id, user_id))
    else:
        cur.execute('''
            SELECT c.* FROM chickens c
            LEFT JOIN farm_members fm ON fm.farm_id = c.farm_id AND fm.user_id = %s
            LEFT JOIN farms f ON f.id = c.farm_id
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
                SELECT hh.*, d.disease_name, d.severity, d.color,
                       CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) AS captured_by_name,
                       u.role AS captured_by_role,
                       u.email AS captured_by_email
                FROM health_history hh
                LEFT JOIN diseases d ON hh.disease_id = d.id
                LEFT JOIN users u ON hh.user_id = u.id
                WHERE hh.chicken_id=%s
                ORDER BY hh.recorded_at DESC
            ''', (real_id,))
            return jsonify(cur.fetchall())
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

            d = request.json
            allowed = ['chicken_name', 'farm_id', 'photo_url', 'location']
            updates = {k: v for k, v in d.items() if k in allowed}
            if not updates:
                return jsonify({'error': 'Nothing to update'}), 400

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