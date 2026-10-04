from flask import request, jsonify
import json
from app import app
from db import get_db, token_required

@app.route('/api/scans', methods=['POST'])
@token_required
def save_scan():
    d = request.json or {}
    required = ['chicken_id','image_type','predicted_condition','confidence_score','severity_level']
    if not all(d.get(k) is not None for k in required):
        return jsonify({'error': 'Missing required scan fields'}), 400

    try:
        chicken_id = int(d['chicken_id'])
        if chicken_id <= 0:
            return jsonify({'error': 'Invalid chicken_id'}), 400
    except (ValueError, TypeError):
        return jsonify({'error': 'chicken_id must be a valid integer'}), 400

    try:
        conf_score = float(d['confidence_score'])
        if not (0.0 <= conf_score <= 100.0):
            return jsonify({'error': 'confidence_score must be between 0.0 and 100.0'}), 400
    except (ValueError, TypeError):
        return jsonify({'error': 'confidence_score must be a numeric value'}), 400

    severity = str(d['severity_level']).strip().lower()
    if severity not in ('none', 'moderate', 'high', 'critical'):
        return jsonify({'error': "severity_level must be one of: 'none', 'moderate', 'high', 'critical'"}), 400

    raw_img_type = str(d.get('image_type', 'other')).strip().lower()
    if raw_img_type in ('eye', 'head'):
        img_type = 'eye'
    elif raw_img_type in ('wing',):
        img_type = 'wing'
    elif raw_img_type in ('posture', 'body', 'full', 'auto'):
        img_type = 'posture'
    elif raw_img_type in ('feces', 'droppings'):
        img_type = 'feces'
    elif raw_img_type in ('other',):
        img_type = 'other'
    else:
        try:
            from app import get_valid_module_ids
            valid_mods = get_valid_module_ids()
        except Exception:
            valid_mods = ['eye', 'wing']
        if raw_img_type in valid_mods:
            img_type = raw_img_type
        else:
            return jsonify({'error': f"image_type must be one of: 'eye', 'wing', 'posture', 'feces', 'other' or registered module: {', '.join(valid_mods)}"}), 400

    pred_cond = str(d['predicted_condition']).strip()[:100]
    raw_img_url = d.get('image_url') or d.get('photo_url')
    if raw_img_url and str(raw_img_url).strip().lower().startswith('javascript:'):
        return jsonify({'error': 'Invalid image URL protocol'}), 400
    image_url = str(raw_img_url).strip() if raw_img_url else None

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT c.id, c.chicken_name, c.farm_id FROM chickens c
                LEFT JOIN farm_members fm ON fm.farm_id = c.farm_id AND fm.user_id = %s
                LEFT JOIN farms f ON f.id = c.farm_id
                WHERE c.id = %s AND (c.user_id = %s OR fm.user_id = %s OR f.owner_id = %s)
            ''', (request.user_id, chicken_id, request.user_id, request.user_id, request.user_id))
            chicken_row = cur.fetchone()
            if not chicken_row:
                return jsonify({'error': 'Chicken not found or no access'}), 404

            # Idempotency check: prevent duplicate save within 4 seconds by same user for same chicken & condition
            cur.execute('''
                SELECT dr.id, dr.image_id FROM detection_results dr
                JOIN image_captures ic ON ic.id = dr.image_id
                WHERE ic.chicken_id = %s AND ic.user_id = %s
                  AND dr.predicted_condition = %s
                  AND ic.capture_datetime >= NOW() - INTERVAL '4 SECOND'
                ORDER BY ic.capture_datetime DESC LIMIT 1
            ''', (chicken_id, request.user_id, pred_cond))
            dup_scan = cur.fetchone()
            if dup_scan:
                return jsonify({
                    'success': True,
                    'duplicate_ignored': True,
                    'image_id': dup_scan['image_id'],
                    'detection_id': dup_scan['id']
                }), 200

            # Check subscription capture quota
            farm_id = chicken_row.get('farm_id')
            owner_id = request.user_id
            if farm_id:
                cur.execute('SELECT owner_id FROM farms WHERE id = %s', (farm_id,))
                f_owner = cur.fetchone()
                if f_owner and f_owner.get('owner_id'):
                    owner_id = f_owner['owner_id']

            from routes_subscriptions import get_effective_subscription
            sub = get_effective_subscription(owner_id, cur, db)
            if sub:
                max_captures = sub['limits']['max_captures']
                current_captures = sub['usage']['captures_count']
                if current_captures >= max_captures:
                    return jsonify({
                        'error': f"Capture limit reached ({current_captures}/{max_captures}). Please upgrade to Pro or Premium for unlimited disease scans.",
                        'code': 'PLAN_CAPTURE_LIMIT_EXCEEDED',
                        'max_captures': max_captures,
                        'current_captures': current_captures,
                        'plan': sub['plan'],
                        'plan_name': sub['plan_name']
                    }), 403

            cur.execute('INSERT INTO image_captures (chicken_id,user_id,image_type,image_url) VALUES (%s,%s,%s,%s)',
                        (chicken_id, request.user_id, img_type, image_url))
            image_id = cur.lastrowid

            # Monotonically increment captures_used on owner's subscription
            # Deleting a chicken later will cascade delete image_captures, but will NOT undo used scan credits.
            cur.execute('''
                UPDATE subscriptions
                SET captures_used = COALESCE(captures_used, 0) + 1, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = %s
            ''', (owner_id,))
            all_preds_data = d.get('all_predictions') or []
            gradcam_img = d.get('gradcam_image')
            if gradcam_img:
                if isinstance(all_preds_data, dict):
                    all_preds_data['gradcam_image'] = gradcam_img
                else:
                    all_preds_data = {'predictions': all_preds_data, 'gradcam_image': gradcam_img}

            cur.execute('''
                INSERT INTO detection_results
                (image_id,predicted_condition,confidence_score,severity_level,all_predictions,detected_symptoms)
                VALUES (%s,%s,%s,%s,%s,%s)
            ''', (image_id, pred_cond, conf_score, severity,
                  json.dumps(all_preds_data), json.dumps(d.get('symptoms',[]))))
            detection_id = cur.lastrowid
            cur.execute('SELECT id FROM diseases WHERE disease_name=%s', (pred_cond,))
            disease = cur.fetchone()
            symptoms_str = ', '.join(str(s)[:50] for s in d.get('symptoms',[]))
            cur.execute('''
                INSERT INTO health_history (chicken_id,user_id,image_id,disease_id,observation,confidence_score,scan_type,image_url)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ''', (chicken_id, request.user_id, image_id, disease['id'] if disease else None,
                  f"{pred_cond} detected. Symptoms: {symptoms_str}"[:500],
                  conf_score, img_type, image_url))
            # If the chicken does not have a photo yet (or only has a truncated one), set its photo from this scan
            if image_url and len(image_url) > 100:
                cur.execute('''
                    UPDATE chickens 
                    SET photo_url = %s 
                    WHERE id = %s AND (photo_url IS NULL OR photo_url = '' OR LENGTH(photo_url) <= 1000)
                ''', (image_url, chicken_id))

            high_conf = bool(d.get('high_confidence_alert', False))
            if severity != 'none' or high_conf:
                alert_msgs = {
                    'critical': f"🚨 EMERGENCY: {pred_cond} detected! Isolate immediately.",
                    'high':     f"⚠️ WARNING: {pred_cond} detected. See vet today.",
                    'moderate': f"⚠️ NOTICE: Early signs of {pred_cond} detected.",
                }
                alert_level = 'critical' if (high_conf or severity == 'critical') else 'warning'
                default_msg = f"🚨 EMERGENCY: {pred_cond} detected! Isolate immediately." if high_conf else f"{pred_cond} detected"
                alert_msg = alert_msgs.get('critical' if high_conf else severity, default_msg)

                cur.execute('''
                    INSERT INTO alerts (chicken_id,detection_id,alert_message,alert_level)
                    VALUES (%s,%s,%s,%s)
                ''', (chicken_id, detection_id, alert_msg, alert_level))
            
            # Fetch user info to include in farm-scoped notification
            cur.execute('SELECT first_name, last_name, role FROM users WHERE id=%s', (request.user_id,))
            user_row = cur.fetchone()
            user_name = f"{user_row['first_name']} {user_row['last_name'] or ''}".strip() if user_row else 'User'
            user_role = (user_row['role'] if user_row else 'member').capitalize()

            farm_id = chicken_row.get('farm_id')
            if not farm_id:
                cur.execute('SELECT id FROM farms WHERE owner_id=%s LIMIT 1', (request.user_id,))
                f_row = cur.fetchone()
                if f_row:
                    farm_id = f_row['id']

            if farm_id:
                cond = pred_cond
                conf = round(conf_score, 1)
                sev = severity
                chicken_name = chicken_row['chicken_name']

                if cond.lower() == 'healthy':
                    notif_title = f"Healthy Check: {chicken_name}"
                    notif_msg = f"{chicken_name} was checked as Healthy ({conf}%) by {user_name} ({user_role})."
                    notif_type = 'success'
                elif sev == 'critical' or high_conf:
                    notif_title = f"🚨 Critical: {cond} in {chicken_name}"
                    notif_msg = f"{cond} ({conf}%) captured by {user_name} ({user_role}). Immediate isolation recommended."
                    notif_type = 'alert'
                else:
                    notif_title = f"⚠️ Alert: {cond} in {chicken_name}"
                    notif_msg = f"{cond} ({conf}%) captured by {user_name} ({user_role}). Keep monitoring closely."
                    notif_type = 'warning'

                cur.execute('''
                    INSERT INTO notifications (farm_id, user_id, title, message, type, chicken_id, chicken_name)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                ''', (farm_id, request.user_id, notif_title, notif_msg, notif_type, chicken_id, chicken_name))

            status_map = {'none':'HEALTHY','moderate':'WARNING','high':'WARNING','critical':'CRITICAL'}
            color_map  = {'none':'#4CAF50','moderate':'#FF9800','high':'#FF9800','critical':'#f44336'}
            final_status = 'CRITICAL' if high_conf else status_map.get(severity, 'HEALTHY')
            final_color  = '#f44336' if high_conf else color_map.get(severity, '#4CAF50')
            cur.execute('UPDATE chickens SET status=%s,status_color=%s,updated_at=NOW() WHERE id=%s',
                        (final_status, final_color, chicken_id))
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
                SELECT DISTINCT a.*,c.chicken_name,c.qr_code FROM alerts a
                JOIN chickens c ON a.chicken_id=c.id
                LEFT JOIN farm_members fm ON fm.farm_id = c.farm_id AND fm.user_id = %s
                LEFT JOIN farms f ON f.id = c.farm_id
                WHERE c.user_id=%s OR fm.user_id=%s OR f.owner_id=%s
                ORDER BY a.created_at DESC LIMIT 30
            ''', (request.user_id, request.user_id, request.user_id, request.user_id))
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
                UPDATE alerts a
                JOIN chickens c ON a.chicken_id=c.id
                LEFT JOIN farm_members fm ON fm.farm_id = c.farm_id AND fm.user_id = %s
                LEFT JOIN farms f ON f.id = c.farm_id
                SET a.is_read=1
                WHERE c.user_id=%s OR fm.user_id=%s OR f.owner_id=%s
            ''', (request.user_id, request.user_id, request.user_id, request.user_id))
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
                SELECT ic.*, c.chicken_name, c.qr_code,
                    dr.predicted_condition, dr.confidence_score, dr.severity_level, dr.detected_at
                FROM image_captures ic
                JOIN chickens c ON ic.chicken_id = c.id
                LEFT JOIN detection_results dr ON dr.image_id = ic.id
                WHERE c.user_id = %s
                   OR c.farm_id IN (
                       SELECT id FROM farms WHERE owner_id = %s
                       UNION
                       SELECT farm_id FROM farm_members WHERE user_id = %s
                   )
                ORDER BY ic.capture_datetime DESC LIMIT 20
            ''', (request.user_id, request.user_id, request.user_id))
            scans = cur.fetchall()
            cur.execute('''
                SELECT dr.predicted_condition, COUNT(*) as count, AVG(dr.confidence_score) as avg_confidence
                FROM detection_results dr
                JOIN image_captures ic ON dr.image_id = ic.id
                JOIN chickens c ON ic.chicken_id = c.id
                WHERE c.user_id = %s
                   OR c.farm_id IN (
                       SELECT id FROM farms WHERE owner_id = %s
                       UNION
                       SELECT farm_id FROM farm_members WHERE user_id = %s
                   )
                GROUP BY dr.predicted_condition ORDER BY count DESC
            ''', (request.user_id, request.user_id, request.user_id))
            breakdown = cur.fetchall()
        return jsonify({'scans':scans,'breakdown':breakdown})
    finally:
        db.close()

@app.route('/api/scans/qr', methods=['POST'])
@token_required
def record_qr_scan():
    d = request.json or {}
    chicken_id = d.get('chicken_id')
    if not chicken_id:
        return jsonify({'error': 'chicken_id required'}), 400

    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT c.id, c.chicken_name, c.farm_id, c.status, c.status_color, c.photo_url FROM chickens c
                LEFT JOIN farm_members fm ON fm.farm_id = c.farm_id AND fm.user_id = %s
                LEFT JOIN farms f ON f.id = c.farm_id
                WHERE (c.id = %s OR c.qr_code = %s) AND (c.user_id = %s OR fm.user_id = %s OR f.owner_id = %s)
            ''', (request.user_id, chicken_id, str(chicken_id), request.user_id, request.user_id, request.user_id))
            chicken = cur.fetchone()
            if not chicken:
                return jsonify({'error': 'Chicken not found or access denied'}), 404

            farm_id = chicken.get('farm_id')
            cur.execute('''
                INSERT INTO qr_scans (chicken_id, user_id, farm_id, scanned_at)
                VALUES (%s, %s, %s, NOW())
            ''', (chicken['id'], request.user_id, farm_id))
            scan_id = cur.lastrowid
            db.commit()

            cur.execute('SELECT first_name, last_name, role FROM users WHERE id=%s', (request.user_id,))
            user_row = cur.fetchone()
            scanner_name = f"{user_row['first_name'] or ''} {user_row['last_name'] or ''}".strip() or 'User' if user_row else 'User'
            scanner_role = (user_row['role'] or 'member').capitalize() if user_row else 'Member'

            return jsonify({
                'success': True,
                'scan_id': scan_id,
                'chicken_id': chicken['id'],
                'chicken_name': chicken['chicken_name'],
                'scanner_name': scanner_name,
                'scanner_role': scanner_role,
                'scanner_label': f"{scanner_name} ({scanner_role})"
            })
    except Exception as e:
        db.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

@app.route('/api/scans/qr', methods=['GET'])
@token_required
def get_qr_scans():
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
            query = '''
                SELECT 
                    qs.id,
                    qs.chicken_id,
                    qs.farm_id,
                    qs.user_id,
                    qs.scanned_at,
                    c.chicken_name,
                    c.qr_code,
                    c.status as chicken_status,
                    c.status_color as chicken_status_color,
                    c.photo_url as chicken_photo,
                    f.farm_name,
                    u.first_name as scanner_first_name,
                    u.last_name as scanner_last_name,
                    u.role as scanner_role
                FROM qr_scans qs
                JOIN chickens c ON qs.chicken_id = c.id
                LEFT JOIN farms f ON qs.farm_id = f.id
                JOIN users u ON qs.user_id = u.id
                LEFT JOIN farm_members fm ON fm.farm_id = c.farm_id AND fm.user_id = %s
                WHERE (c.user_id = %s OR fm.user_id = %s OR f.owner_id = %s)
            '''
            params = [request.user_id, request.user_id, request.user_id, request.user_id]
            if farm_id is not None:
                query += ' AND qs.farm_id = %s'
                params.append(farm_id)

            query += ' ORDER BY qs.scanned_at DESC LIMIT 60'
            cur.execute(query, tuple(params))
            rows = cur.fetchall()

            results = []
            for r in rows:
                s_name = f"{r.get('scanner_first_name') or ''} {r.get('scanner_last_name') or ''}".strip() or 'User'
                s_role = (r.get('scanner_role') or 'member').capitalize()
                dt = r.get('scanned_at')
                results.append({
                    'id': str(r['id']),
                    'chicken_id': str(r['chicken_id']),
                    'chicken_name': r.get('chicken_name') or 'Chicken',
                    'qr_code': r.get('qr_code') or '',
                    'status': r.get('chicken_status') or 'HEALTHY',
                    'status_color': r.get('chicken_status_color') or '#4CAF50',
                    'photo_url': r.get('chicken_photo'),
                    'farm_id': r.get('farm_id'),
                    'farm_name': r.get('farm_name') or 'Unassigned',
                    'scanned_at': dt.isoformat() if hasattr(dt, 'isoformat') else str(dt),
                    'scanner_name': s_name,
                    'scanner_role': s_role,
                    'scanner_label': f"{s_name} ({s_role})",
                })
            return jsonify(results)
    except Exception as e:
        print(f"[ERROR in get_qr_scans]: {e}")
        return jsonify({'error': 'Failed to retrieve qr scans', 'details': str(e)}), 500
    finally:
        db.close()