from flask import request, jsonify
from db import get_db, token_required
from app import app
import random
import string


def generate_farm_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))


def get_user_role(user_id, cur):
    cur.execute('SELECT role FROM users WHERE id=%s', (user_id,))
    user = cur.fetchone()
    return user['role'] if user else 'caretaker'


# ─── GET all farms ────────────────────────────────────────────────────────────
@app.route('/api/farms', methods=['GET'])
@token_required
def get_farms():
    db = get_db()
    try:
        with db.cursor() as cur:
            role = get_user_role(request.user_id, cur)
            if role == 'owner':
                cur.execute('''
                    SELECT f.*,
                      CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) as owner_name,
                      u.email as owner_email,
                      COUNT(DISTINCT fm.user_id) as caretaker_count,
                      COUNT(DISTINCT c.id) as chicken_count
                    FROM farms f
                    LEFT JOIN users u ON u.id = f.owner_id
                    LEFT JOIN farm_members fm ON fm.farm_id = f.id AND fm.role = 'caretaker'
                    LEFT JOIN chickens c ON c.farm_id = f.id
                    WHERE f.owner_id = %s
                    GROUP BY f.id, u.id
                    ORDER BY f.created_at DESC
                ''', (request.user_id,))
            else:
                cur.execute('''
                    SELECT f.*,
                      CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) as owner_name,
                      u.email as owner_email,
                      COUNT(DISTINCT fm2.user_id) as caretaker_count,
                      COUNT(DISTINCT c.id) as chicken_count
                    FROM farms f
                    LEFT JOIN users u ON u.id = f.owner_id
                    JOIN farm_members fm ON fm.farm_id = f.id AND fm.user_id = %s
                    LEFT JOIN farm_members fm2 ON fm2.farm_id = f.id AND fm2.role = 'caretaker'
                    LEFT JOIN chickens c ON c.farm_id = f.id
                    GROUP BY f.id, u.id
                    ORDER BY f.created_at DESC
                ''', (request.user_id,))
            farms = cur.fetchall()
        return jsonify(farms)
    finally:
        db.close()


# ─── CREATE farm (owner only) ─────────────────────────────────────────────────
@app.route('/api/farms', methods=['POST'])
@token_required
def create_farm():
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT role FROM users WHERE id=%s', (request.user_id,))
            user = cur.fetchone()
            if user['role'] != 'owner':
                return jsonify({'error': 'Only owners can create farms'}), 403

            d = request.json
            if not d.get('farm_name'):
                return jsonify({'error': 'Farm name required'}), 400

            while True:
                code = generate_farm_code()
                cur.execute('SELECT id FROM farms WHERE farm_code=%s', (code,))
                if not cur.fetchone():
                    break

            cur.execute('''
                INSERT INTO farms (owner_id, farm_name, farm_location, farm_code, description, latitude, longitude)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            ''', (request.user_id, d['farm_name'],
                  d.get('farm_location', ''), code, d.get('description', ''),
                  d.get('latitude'), d.get('longitude')))
            farm_id = cur.lastrowid

            cur.execute('''
                INSERT INTO farm_members (farm_id, user_id, role)
                VALUES (%s, %s, 'owner')
            ''', (farm_id, request.user_id))

            db.commit()
            cur.execute('SELECT * FROM farms WHERE id=%s', (farm_id,))
            farm = cur.fetchone()
        return jsonify(farm)
    finally:
        db.close()


# ─── UPDATE farm (owner only) ─────────────────────────────────────────────────
@app.route('/api/farms/<int:farm_id>', methods=['PUT'])
@token_required
def update_farm(farm_id):
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT owner_id FROM farms WHERE id=%s', (farm_id,))
            farm = cur.fetchone()
            if not farm or farm['owner_id'] != request.user_id:
                return jsonify({'error': 'Only farm owner can edit this farm'}), 403

            d = request.json
            cur.execute('''
                UPDATE farms
                SET farm_name = %s, farm_location = %s, description = %s,
                    latitude = %s, longitude = %s
                WHERE id = %s
            ''', (
                d.get('farm_name'), d.get('farm_location'), d.get('description'),
                d.get('latitude'), d.get('longitude'), farm_id
            ))
            db.commit()
            cur.execute('SELECT * FROM farms WHERE id=%s', (farm_id,))
            updated = cur.fetchone()
        return jsonify(updated)
    finally:
        db.close()


# ─── GET single farm ──────────────────────────────────────────────────────────
@app.route('/api/farms/<int:farm_id>', methods=['GET'])
@token_required
def get_farm(farm_id):
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT f.*,
                       CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) as owner_name,
                       u.email as owner_email
                FROM farms f
                LEFT JOIN users u ON u.id = f.owner_id
                LEFT JOIN farm_members fm ON fm.farm_id = f.id AND fm.user_id = %s
                WHERE f.id = %s AND (f.owner_id = %s OR fm.user_id = %s)
            ''', (request.user_id, farm_id, request.user_id, request.user_id))
            farm = cur.fetchone()
            if not farm:
                return jsonify({'error': 'Farm not found or no access'}), 404

            cur.execute('''
                SELECT u.id, u.first_name, u.last_name, u.email,
                       u.phone_number, fm.role, fm.joined_at
                FROM farm_members fm
                JOIN users u ON fm.user_id = u.id
                WHERE fm.farm_id = %s
                ORDER BY fm.role DESC, fm.joined_at ASC
            ''', (farm_id,))
            members = cur.fetchall()

            cur.execute('''
                SELECT * FROM chickens WHERE farm_id = %s
                ORDER BY created_at DESC
            ''', (farm_id,))
            chickens = cur.fetchall()

        return jsonify({'farm': farm, 'members': members, 'chickens': chickens})
    finally:
        db.close()


# ─── DELETE farm (owner only) ─────────────────────────────────────────────────
@app.route('/api/farms/<int:farm_id>', methods=['DELETE'])
@token_required
def delete_farm(farm_id):
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT owner_id FROM farms WHERE id=%s', (farm_id,))
            farm = cur.fetchone()
            if not farm or farm['owner_id'] != request.user_id:
                return jsonify({'error': 'Only farm owner can delete this farm'}), 403
            cur.execute('DELETE FROM farms WHERE id=%s', (farm_id,))
            db.commit()
        return jsonify({'success': True})
    finally:
        db.close()


# ─── JOIN farm via farm code (caretaker) ─────────────────────────────────────
@app.route('/api/farms/join', methods=['POST'])
@token_required
def join_farm():
    d = request.json
    farm_code = d.get('farm_code', '').strip().upper()
    if not farm_code:
        return jsonify({'error': 'Farm code required'}), 400

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT * FROM farms WHERE farm_code=%s', (farm_code,))
            farm = cur.fetchone()
            if not farm:
                return jsonify({'error': 'Invalid farm code. Check with your farm owner.'}), 404

            cur.execute('''
                SELECT id FROM farm_members
                WHERE farm_id=%s AND user_id=%s
            ''', (farm['id'], request.user_id))
            if cur.fetchone():
                return jsonify({'error': 'Already a member of this farm'}), 400

            cur.execute('''
                INSERT INTO farm_members (farm_id, user_id, role)
                VALUES (%s, %s, 'caretaker')
            ''', (farm['id'], request.user_id))

            cur.execute('''
                UPDATE users SET role='caretaker'
                WHERE id=%s AND role != 'owner'
            ''', (request.user_id,))

            db.commit()

        return jsonify({
            'success': True,
            'farm_name': farm['farm_name'],
            'farm_id': farm['id']
        })
    finally:
        db.close()


# ─── GET farm members ─────────────────────────────────────────────────────────
@app.route('/api/farms/<int:farm_id>/members', methods=['GET'])
@token_required
def get_farm_members(farm_id):
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT u.id, u.first_name, u.last_name,
                       u.email, fm.role, fm.joined_at
                FROM farm_members fm
                JOIN users u ON fm.user_id = u.id
                WHERE fm.farm_id = %s
                ORDER BY fm.role DESC
            ''', (farm_id,))
            members = cur.fetchall()
        return jsonify(members)
    finally:
        db.close()


# ─── REMOVE member from farm (owner only) ────────────────────────────────────
@app.route('/api/farms/<int:farm_id>/members/<int:member_id>', methods=['DELETE'])
@token_required
def remove_member(farm_id, member_id):
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT owner_id FROM farms WHERE id=%s', (farm_id,))
            farm = cur.fetchone()
            if not farm or farm['owner_id'] != request.user_id:
                return jsonify({'error': 'Only farm owner can remove members'}), 403

            cur.execute('''
                DELETE FROM farm_members
                WHERE farm_id=%s AND user_id=%s AND role='caretaker'
            ''', (farm_id, member_id))
            db.commit()
        return jsonify({'success': True})
    finally:
        db.close()