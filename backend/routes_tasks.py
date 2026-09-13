from flask import request, jsonify
from datetime import datetime
from app import app
from db import get_db, token_required


def init_tasks_table():
    """Ensure the tasks table exists in MySQL."""
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                CREATE TABLE IF NOT EXISTS tasks (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    farm_id INT NOT NULL,
                    created_by_user_id INT NOT NULL,
                    assigned_to_user_id INT NULL,
                    title VARCHAR(255) NOT NULL,
                    description TEXT NULL,
                    due_date VARCHAR(50) NOT NULL,
                    due_time VARCHAR(50) NULL,
                    color VARCHAR(50) DEFAULT '#4CAF50',
                    icon VARCHAR(50) DEFAULT 'calendar',
                    completed BOOLEAN DEFAULT FALSE,
                    completed_by_user_id INT NULL,
                    completed_at TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_farm_due (farm_id, due_date),
                    INDEX idx_assigned (assigned_to_user_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ''')
            db.commit()
    except Exception as e:
        print(f"[TASKS] Table init warning: {e}")
    finally:
        db.close()


# Run table initialization on import
init_tasks_table()


def _get_accessible_farms(cur, user_id):
    """Returns accessible farms dict keyed by farm_id."""
    cur.execute('''
        SELECT DISTINCT f.id, f.farm_name, f.owner_id,
               CASE WHEN f.owner_id = %s THEN 'owner' ELSE COALESCE(fm.role, 'caretaker') END AS user_role
        FROM farms f
        LEFT JOIN farm_members fm ON fm.farm_id = f.id AND fm.user_id = %s
        WHERE f.owner_id = %s OR fm.user_id = %s
    ''', (user_id, user_id, user_id, user_id))
    return {r['id']: r for r in cur.fetchall()}


# ─── GET /api/tasks ──────────────────────────────────────────────────────────
@app.route('/api/tasks', methods=['GET'])
@token_required
def get_tasks():
    farm_id_param = request.args.get('farm_id')
    db = get_db()
    try:
        with db.cursor() as cur:
            accessible_farms = _get_accessible_farms(cur, request.user_id)
            if not accessible_farms:
                return jsonify([])

            # Get user global role
            cur.execute('SELECT role, first_name, last_name FROM users WHERE id=%s', (request.user_id,))
            user_info = cur.fetchone() or {'role': 'caretaker'}
            global_role = user_info.get('role', 'caretaker')

            if farm_id_param:
                fid = int(farm_id_param)
                if fid not in accessible_farms:
                    return jsonify({'error': 'No access to specified farm'}), 403
                target_farm_ids = [fid]
            else:
                target_farm_ids = list(accessible_farms.keys())

            placeholders = ', '.join(['%s'] * len(target_farm_ids))

            # Role-specific filtering:
            # Owners see all tasks across target farms.
            # Caretakers only see tasks for their farm that are either assigned to them OR open (assigned_to IS NULL).
            if global_role == 'owner':
                query = f'''
                    SELECT 
                        t.id, t.farm_id, f.farm_name,
                        t.created_by_user_id,
                        CONCAT(u_c.first_name, ' ', COALESCE(u_c.last_name, '')) AS creator_name,
                        u_c.role AS creator_role,
                        t.assigned_to_user_id,
                        CONCAT(u_a.first_name, ' ', COALESCE(u_a.last_name, '')) AS assignee_name,
                        u_a.role AS assignee_role,
                        t.title, t.description, t.due_date, t.due_time,
                        t.color, t.icon, t.completed,
                        t.completed_by_user_id,
                        CONCAT(u_comp.first_name, ' ', COALESCE(u_comp.last_name, '')) AS completer_name,
                        u_comp.role AS completer_role,
                        t.completed_at, t.created_at, t.updated_at
                    FROM tasks t
                    JOIN farms f ON f.id = t.farm_id
                    LEFT JOIN users u_c ON u_c.id = t.created_by_user_id
                    LEFT JOIN users u_a ON u_a.id = t.assigned_to_user_id
                    LEFT JOIN users u_comp ON u_comp.id = t.completed_by_user_id
                    WHERE t.farm_id IN ({placeholders})
                    ORDER BY t.due_date ASC, t.created_at DESC
                '''
                cur.execute(query, tuple(target_farm_ids))
            else:
                query = f'''
                    SELECT 
                        t.id, t.farm_id, f.farm_name,
                        t.created_by_user_id,
                        CONCAT(u_c.first_name, ' ', COALESCE(u_c.last_name, '')) AS creator_name,
                        u_c.role AS creator_role,
                        t.assigned_to_user_id,
                        CONCAT(u_a.first_name, ' ', COALESCE(u_a.last_name, '')) AS assignee_name,
                        u_a.role AS assignee_role,
                        t.title, t.description, t.due_date, t.due_time,
                        t.color, t.icon, t.completed,
                        t.completed_by_user_id,
                        CONCAT(u_comp.first_name, ' ', COALESCE(u_comp.last_name, '')) AS completer_name,
                        u_comp.role AS completer_role,
                        t.completed_at, t.created_at, t.updated_at
                    FROM tasks t
                    JOIN farms f ON f.id = t.farm_id
                    LEFT JOIN users u_c ON u_c.id = t.created_by_user_id
                    LEFT JOIN users u_a ON u_a.id = t.assigned_to_user_id
                    LEFT JOIN users u_comp ON u_comp.id = t.completed_by_user_id
                    WHERE t.farm_id IN ({placeholders})
                      AND (t.assigned_to_user_id = %s OR t.assigned_to_user_id IS NULL)
                    ORDER BY t.due_date ASC, t.created_at DESC
                '''
                cur.execute(query, (*target_farm_ids, request.user_id))

            rows = cur.fetchall()
            results = []
            for r in rows:
                results.append({
                    'id': str(r['id']),
                    'farm_id': r['farm_id'],
                    'farm_name': r['farm_name'],
                    'created_by_user_id': r['created_by_user_id'],
                    'creator_name': (r['creator_name'] or 'Farm Member').strip(),
                    'creator_role': (r['creator_role'] or 'owner').capitalize(),
                    'assigned_to_user_id': r['assigned_to_user_id'],
                    'assignee_name': (r['assignee_name'] or 'All Caretakers').strip() if r['assigned_to_user_id'] else 'All Caretakers',
                    'assignee_role': (r['assignee_role'] or '').capitalize() if r['assigned_to_user_id'] else None,
                    'title': r['title'],
                    'description': r['description'] or '',
                    'note': r['description'] or '',
                    'date': r['due_date'],
                    'time': r['due_time'] or '',
                    'color': r['color'] or '#4CAF50',
                    'icon': r['icon'] or 'calendar',
                    'completed': bool(r['completed']),
                    'completed_by_user_id': r['completed_by_user_id'],
                    'completer_name': (r['completer_name'] or '').strip() if r['completed_by_user_id'] else None,
                    'completer_role': (r['completer_role'] or '').capitalize() if r['completed_by_user_id'] else None,
                    'completed_at': r['completed_at'].isoformat() if r['completed_at'] else None,
                    'created_at': r['created_at'].isoformat() if hasattr(r['created_at'], 'isoformat') else str(r['created_at']),
                })
            return jsonify(results)
    finally:
        db.close()


# ─── POST /api/tasks ─────────────────────────────────────────────────────────
@app.route('/api/tasks', methods=['POST'])
@token_required
def create_task():
    d = request.json or {}
    title = (d.get('title') or '').strip()
    due_date = (d.get('date') or d.get('due_date') or '').strip()
    description = (d.get('note') or d.get('description') or '').strip()
    due_time = (d.get('time') or d.get('due_time') or '').strip()
    color = d.get('color') or '#4CAF50'
    icon = d.get('icon') or 'calendar'
    farm_id = d.get('farm_id')
    assigned_to = d.get('assigned_to_user_id')

    if not title:
        return jsonify({'error': 'Title is required'}), 400
    if not due_date:
        return jsonify({'error': 'Due date is required'}), 400

    db = get_db()
    try:
        with db.cursor() as cur:
            accessible = _get_accessible_farms(cur, request.user_id)
            if not accessible:
                return jsonify({'error': 'User has no farm access'}), 403

            if farm_id:
                farm_id = int(farm_id)
                if farm_id not in accessible:
                    return jsonify({'error': 'No access to specified farm'}), 403
            else:
                farm_id = list(accessible.keys())[0]

            farm_name = accessible[farm_id]['farm_name']

            # Validate assignee if specified
            assignee_name = None
            if assigned_to:
                assigned_to = int(assigned_to)
                cur.execute('''
                    SELECT u.first_name, u.last_name, u.role FROM users u
                    JOIN farm_members fm ON fm.user_id = u.id
                    WHERE u.id = %s AND fm.farm_id = %s
                ''', (assigned_to, farm_id))
                assignee_row = cur.fetchone()
                if not assignee_row:
                    return jsonify({'error': 'Assigned user is not a member of this farm'}), 400
                assignee_name = f"{assignee_row['first_name']} {assignee_row['last_name'] or ''}".strip()

            cur.execute('''
                INSERT INTO tasks
                (farm_id, created_by_user_id, assigned_to_user_id, title, description,
                 due_date, due_time, color, icon, completed)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, FALSE)
            ''', (farm_id, request.user_id, assigned_to, title, description,
                  due_date, due_time, color, icon))
            task_id = cur.lastrowid

            # Creator details
            cur.execute('SELECT first_name, last_name, role FROM users WHERE id=%s', (request.user_id,))
            creator_row = cur.fetchone()
            c_name = f"{creator_row['first_name']} {creator_row['last_name'] or ''}".strip() if creator_row else 'Farm Member'
            c_role = (creator_row['role'] if creator_row else 'owner').capitalize()

            # Create farm-scoped notification
            notif_title = f"New Task: {title}"
            if assignee_name:
                notif_msg = f"{c_name} ({c_role}) assigned a task for {farm_name}: \"{title}\" (Assigned to: {assignee_name})."
            else:
                notif_msg = f"{c_name} ({c_role}) created a task for {farm_name}: \"{title}\" (All Caretakers)."

            cur.execute('''
                INSERT INTO notifications (farm_id, user_id, title, message, type)
                VALUES (%s, %s, %s, %s, 'info')
            ''', (farm_id, request.user_id, notif_title, notif_msg))

            db.commit()

            return jsonify({
                'success': True,
                'id': str(task_id),
                'farm_id': farm_id,
                'farm_name': farm_name,
                'title': title,
                'description': description,
                'note': description,
                'date': due_date,
                'time': due_time,
                'color': color,
                'icon': icon,
                'completed': False,
                'created_by_user_id': request.user_id,
                'creator_name': c_name,
                'creator_role': c_role,
                'assigned_to_user_id': assigned_to,
                'assignee_name': assignee_name or 'All Caretakers',
            }), 201
    except Exception as e:
        db.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


# ─── PUT /api/tasks/<id>/complete ────────────────────────────────────────────
@app.route('/api/tasks/<int:task_id>/complete', methods=['PUT'])
@token_required
def toggle_task_complete(task_id):
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT t.*, f.farm_name, f.owner_id FROM tasks t
                JOIN farms f ON f.id = t.farm_id
                WHERE t.id = %s
            ''', (task_id,))
            task = cur.fetchone()
            if not task:
                return jsonify({'error': 'Task not found'}), 404

            accessible = _get_accessible_farms(cur, request.user_id)
            if task['farm_id'] not in accessible:
                return jsonify({'error': 'No access to this farm'}), 403

            # Check completion permission:
            # Farm owner, task creator, or assigned caretaker (or any farm caretaker if unassigned)
            is_owner = task['owner_id'] == request.user_id
            is_creator = task['created_by_user_id'] == request.user_id
            is_assignee = task['assigned_to_user_id'] == request.user_id or task['assigned_to_user_id'] is None

            if not (is_owner or is_creator or is_assignee):
                return jsonify({'error': 'You are not assigned to complete this task'}), 403

            current_completed = bool(task['completed'])
            new_completed = not current_completed

            # Get user info
            cur.execute('SELECT first_name, last_name, role FROM users WHERE id=%s', (request.user_id,))
            u_row = cur.fetchone()
            u_name = f"{u_row['first_name']} {u_row['last_name'] or ''}".strip() if u_row else 'User'
            u_role = (u_row['role'] if u_row else 'member').capitalize()

            if new_completed:
                cur.execute('''
                    UPDATE tasks
                    SET completed = TRUE, completed_by_user_id = %s, completed_at = NOW()
                    WHERE id = %s
                ''', (request.user_id, task_id))

                # Post completion notification
                notif_title = f"Task Completed: {task['title']}"
                notif_msg = f"{u_name} ({u_role}) completed task \"{task['title']}\" on {task['farm_name']}."
                cur.execute('''
                    INSERT INTO notifications (farm_id, user_id, title, message, type)
                    VALUES (%s, %s, %s, %s, 'success')
                ''', (task['farm_id'], request.user_id, notif_title, notif_msg))
            else:
                cur.execute('''
                    UPDATE tasks
                    SET completed = FALSE, completed_by_user_id = NULL, completed_at = NULL
                    WHERE id = %s
                ''', (task_id,))

            db.commit()
            return jsonify({
                'success': True,
                'id': str(task_id),
                'completed': new_completed,
                'completed_by_user_id': request.user_id if new_completed else None,
                'completer_name': u_name if new_completed else None,
                'completer_role': u_role if new_completed else None,
            })
    except Exception as e:
        db.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


# ─── PUT /api/tasks/<id> ─────────────────────────────────────────────────────
@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
@token_required
def update_task(task_id):
    d = request.json or {}
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT t.*, f.owner_id FROM tasks t
                JOIN farms f ON f.id = t.farm_id
                WHERE t.id = %s
            ''', (task_id,))
            task = cur.fetchone()
            if not task:
                return jsonify({'error': 'Task not found'}), 404

            # Must be farm owner or creator
            if task['owner_id'] != request.user_id and task['created_by_user_id'] != request.user_id:
                return jsonify({'error': 'Only the farm owner or creator can edit this task'}), 403

            title = d.get('title', task['title'])
            description = d.get('note', d.get('description', task['description']))
            due_date = d.get('date', d.get('due_date', task['due_date']))
            due_time = d.get('time', d.get('due_time', task['due_time']))
            color = d.get('color', task['color'])
            icon = d.get('icon', task['icon'])
            assigned_to = d.get('assigned_to_user_id', task['assigned_to_user_id'])

            cur.execute('''
                UPDATE tasks
                SET title = %s, description = %s, due_date = %s, due_time = %s,
                    color = %s, icon = %s, assigned_to_user_id = %s
                WHERE id = %s
            ''', (title, description, due_date, due_time, color, icon, assigned_to, task_id))
            db.commit()

            return jsonify({'success': True, 'id': str(task_id)})
    finally:
        db.close()


# ─── DELETE /api/tasks/<id> ──────────────────────────────────────────────────
@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
@token_required
def delete_task(task_id):
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute('''
                SELECT t.*, f.owner_id FROM tasks t
                JOIN farms f ON f.id = t.farm_id
                WHERE t.id = %s
            ''', (task_id,))
            task = cur.fetchone()
            if not task:
                return jsonify({'error': 'Task not found'}), 404

            if task['owner_id'] != request.user_id and task['created_by_user_id'] != request.user_id:
                return jsonify({'error': 'Only the farm owner or creator can delete this task'}), 403

            cur.execute('DELETE FROM tasks WHERE id = %s', (task_id,))
            db.commit()
            return jsonify({'success': True, 'id': str(task_id)})
    finally:
        db.close()
