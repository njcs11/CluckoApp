from flask import request, jsonify
import hashlib, jwt
from datetime import datetime, timedelta
from app import app
from db import get_db, token_required, SECRET_KEY

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    d = request.json
    if not all(d.get(k) for k in ['first_name','last_name','email','password']):
        return jsonify({'error': 'Missing required fields'}), 400
    pw_hash = hashlib.sha256(d['password'].encode()).hexdigest()
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT id FROM users WHERE email=%s', (d['email'],))
            if cur.fetchone():
                return jsonify({'error': 'Email already registered'}), 400
            cur.execute('''
                INSERT INTO users (first_name,last_name,email,password_hash,phone_number,farm_name,farm_location)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
            ''', (d['first_name'],d['last_name'],d['email'],pw_hash,
                  d.get('phone_number',''),d.get('farm_name',f"{d['first_name']}'s Farm"),
                  d.get('farm_location','Davao City')))
            db.commit()
            user_id = cur.lastrowid
        token = jwt.encode({'user_id':user_id,'exp':datetime.utcnow()+timedelta(days=30)}, SECRET_KEY, algorithm='HS256')
        return jsonify({'success':True,'token':token,'user_id':user_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

@app.route('/api/auth/login', methods=['POST'])
def login():
    d = request.json
    if not d.get('email') or not d.get('password'):
        return jsonify({'error': 'Email and password required'}), 400
    pw_hash = hashlib.sha256(d['password'].encode()).hexdigest()
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT * FROM users WHERE email=%s AND password_hash=%s', (d['email'],pw_hash))
            user = cur.fetchone()
        if not user:
            return jsonify({'error': 'Invalid email or password'}), 401
        token = jwt.encode({'user_id':user['id'],'exp':datetime.utcnow()+timedelta(days=30)}, SECRET_KEY, algorithm='HS256')
        user.pop('password_hash', None)
        return jsonify({'success':True,'token':token,'user':user})
    finally:
        db.close()

@app.route('/api/auth/profile', methods=['GET'])
@token_required
def get_profile():
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT id,first_name,last_name,email,phone_number,profile_image,farm_name,farm_location,role,created_at FROM users WHERE id=%s', (request.user_id,))
            return jsonify(cur.fetchone())
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
            db.commit()
        return jsonify({'success': True})
    finally:
        db.close()

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    return jsonify({'success': True})