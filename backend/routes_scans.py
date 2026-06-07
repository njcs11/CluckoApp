from flask import request, jsonify
import json
from app import app
from db import get_db, token_required

@app.route('/api/scans', methods=['POST'])
@token_required
def save_scan():
    d = request.json
    required = ['chicken_id','image_type','predicted_condition','confidence_score','severity_level']
    if not all(d.get(k) is not None for k in required):
        return jsonify({'error': 'Missing fields'}), 400
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT id FROM chickens WHERE id=%s AND user_id=%s', (d['chicken_id'], request.user_id))
            if not cur.fetchone():
                return jsonify({'error': 'Chicken not found'}), 404
            cur.execute('INSERT INTO image_captures (chicken_id,user_id,image_type) VALUES (%s,%s,%s)',
                        (d['chicken_id'],request.user_id,d['image_type']))
            image_id = cur.lastrowid
            cur.execute('''
                INSERT INTO detection_results
                (image_id,predicted_condition,confidence_score,severity_level,all_predictions,detected_symptoms)
                VALUES (%s,%s,%s,%s,%s,%s)
            ''', (image_id,d['predicted_condition'],d['confidence_score'],d['severity_level'],
                  json.dumps(d.get('all_predictions',[])),json.dumps(d.get('symptoms',[]))))
            detection_id = cur.lastrowid
            cur.execute('SELECT id FROM diseases WHERE disease_name=%s', (d['predicted_condition'],))
            disease = cur.fetchone()
            symptoms_str = ', '.join(d.get('symptoms',[]))
            cur.execute('''
                INSERT INTO health_history (chicken_id,disease_id,observation,confidence_score,scan_type)
                VALUES (%s,%s,%s,%s,%s)
            ''', (d['chicken_id'],disease['id'] if disease else None,
                  f"{d['predicted_condition']} detected. Symptoms: {symptoms_str}",
                  d['confidence_score'],d['image_type']))
            if d['severity_level'] != 'none':
                alert_msgs = {
                    'critical': f"🚨 EMERGENCY: {d['predicted_condition']} detected! Isolate immediately.",
                    'high':     f"⚠️ WARNING: {d['predicted_condition']} detected. See vet today.",
                    'moderate': f"⚠️ NOTICE: Early signs of {d['predicted_condition']} detected.",
                }
                cur.execute('''
                    INSERT INTO alerts (chicken_id,detection_id,alert_message,alert_level)
                    VALUES (%s,%s,%s,%s)
                ''', (d['chicken_id'],detection_id,
                      alert_msgs.get(d['severity_level'],f"{d['predicted_condition']} detected"),
                      'critical' if d['severity_level']=='critical' else 'warning'))
                status_map = {'none':'HEALTHY','moderate':'WARNING','high':'WARNING','critical':'CRITICAL'}
                color_map  = {'none':'#4CAF50','moderate':'#FF9800','high':'#FF9800','critical':'#f44336'}
                cur.execute('UPDATE chickens SET status=%s,status_color=%s,updated_at=NOW() WHERE id=%s',
                            (status_map[d['severity_level']],color_map[d['severity_level']],d['chicken_id']))
            db.commit()
        return jsonify({'success':True,'image_id':image_id,'detection_id':detection_id})
    except Exception as e:
        db.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

@app.route('/api/alerts', methods=['GET'])
@token_required
def get_alerts():
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT a.*,c.chicken_name,c.qr_code FROM alerts a
                JOIN chickens c ON a.chicken_id=c.id
                WHERE c.user_id=%s ORDER BY a.created_at DESC LIMIT 30
            ''', (request.user_id,))
            return jsonify(cur.fetchall())
    finally:
        db.close()

@app.route('/api/alerts/read-all', methods=['PUT'])
@token_required
def mark_all_read():
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                UPDATE alerts a JOIN chickens c ON a.chicken_id=c.id
                SET a.is_read=1 WHERE c.user_id=%s
            ''', (request.user_id,))
            db.commit()
        return jsonify({'success': True})
    finally:
        db.close()

@app.route('/api/reports', methods=['GET'])
@token_required
def get_reports():
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT ic.*,c.chicken_name,c.qr_code,
                       dr.predicted_condition,dr.confidence_score,dr.severity_level,dr.detected_at
                FROM image_captures ic
                JOIN chickens c ON ic.chicken_id=c.id
                LEFT JOIN detection_results dr ON dr.image_id=ic.id
                WHERE c.user_id=%s ORDER BY ic.capture_datetime DESC LIMIT 20
            ''', (request.user_id,))
            scans = cur.fetchall()
            cur.execute('''
                SELECT dr.predicted_condition,COUNT(*) as count,AVG(dr.confidence_score) as avg_confidence
                FROM detection_results dr
                JOIN image_captures ic ON dr.image_id=ic.id
                JOIN chickens c ON ic.chicken_id=c.id
                WHERE c.user_id=%s GROUP BY dr.predicted_condition ORDER BY count DESC
            ''', (request.user_id,))
            breakdown = cur.fetchall()
        return jsonify({'scans':scans,'breakdown':breakdown})
    finally:
        db.close()