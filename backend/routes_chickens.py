from flask import request, jsonify
from app import app
from db import get_db, token_required

@app.route('/api/chickens', methods=['GET'])
@token_required
def get_chickens():
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT * FROM chickens WHERE user_id=%s ORDER BY created_at DESC', (request.user_id,))
            return jsonify(cur.fetchall())
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
            cur.execute('''
                INSERT INTO chickens (user_id,qr_code,chicken_name,breed,age,weight,color,location,photo_url)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ''', (request.user_id,d['qr_code'],d['chicken_name'],
                  d.get('breed',''),d.get('age',''),d.get('weight',''),
                  d.get('color',''),d.get('location',''),d.get('photo_url','')))
            db.commit()
            cur.execute('SELECT * FROM chickens WHERE id=%s', (cur.lastrowid,))
            return jsonify(cur.fetchone())
    except Exception as e:
        if 'Duplicate entry' in str(e):
            return jsonify({'error': 'QR code already exists'}), 400
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

@app.route('/api/chickens/<int:cid>', methods=['GET'])
@token_required
def get_chicken(cid):
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT * FROM chickens WHERE id=%s AND user_id=%s', (cid, request.user_id))
            chicken = cur.fetchone()
        if not chicken:
            return jsonify({'error': 'Not found'}), 404
        return jsonify(chicken)
    finally:
        db.close()

@app.route('/api/chickens/<int:cid>', methods=['DELETE'])
@token_required
def delete_chicken(cid):
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('DELETE FROM chickens WHERE id=%s AND user_id=%s', (cid, request.user_id))
            db.commit()
        return jsonify({'success': True})
    finally:
        db.close()

@app.route('/api/chickens/<int:cid>/history', methods=['GET'])
@token_required
def get_chicken_history(cid):
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT hh.*, d.disease_name, d.severity, d.color
                FROM health_history hh
                LEFT JOIN diseases d ON hh.disease_id = d.id
                WHERE hh.chicken_id=%s
                ORDER BY hh.recorded_at DESC
            ''', (cid,))
            return jsonify(cur.fetchall())
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