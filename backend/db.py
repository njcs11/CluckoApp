import pymysql
import jwt
from functools import wraps
from flask import request, jsonify

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',
    'database': 'clucko_db',
    'cursorclass': pymysql.cursors.DictCursor
}

SECRET_KEY = 'clucko_secret_key_2026'

def get_db():
    return pymysql.connect(**DB_CONFIG)

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '').strip()
        if not auth_header:
            return jsonify({'error': 'Token missing'}), 401

        token = auth_header.replace('Bearer ', '').strip()
        if not token or token.lower() in ('null', 'undefined', 'none'):
            return jsonify({'error': 'Token missing'}), 401

        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            user_id = data.get('user_id')
            if not user_id:
                return jsonify({'error': 'Invalid token'}), 401
            request.user_id = user_id
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except Exception:
            return jsonify({'error': 'Invalid token'}), 401

        return f(*args, **kwargs)
    return decorated
