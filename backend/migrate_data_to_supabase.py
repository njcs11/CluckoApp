import os
import sys
import json
import pymysql
import psycopg2
from psycopg2.extras import execute_values

# Connection settings
MYSQL_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',
    'database': 'clucko_db',
    'cursorclass': pymysql.cursors.DictCursor
}

from db import SUPABASE_CONFIG

TABLES_ORDER = [
    'users',
    'farms',
    'farm_members',
    'chickens',
    'diseases',
    'image_captures',
    'detection_results',
    'health_history',
    'alerts',
    'notifications',
    'notification_reads',
    'qr_scans',
    'tasks'
]

def run_migration():
    print("=" * 60)
    print("CLUCKO DATABASE MIGRATION: MySQL -> Supabase (PostgreSQL)")
    print("=" * 60)

    # 1. Connect to Supabase
    print("\n1. Connecting to Supabase PostgreSQL...")
    try:
        pg_conn = psycopg2.connect(**SUPABASE_CONFIG)
        pg_conn.autocommit = False
        print("   [OK] Connected to Supabase PostgreSQL successfully!")
    except Exception as e:
        print(f"   [ERROR] Failed to connect to Supabase: {e}")
        sys.exit(1)

    # 2. Connect to local MySQL
    print("\n2. Connecting to local MySQL (clucko_db)...")
    try:
        my_conn = pymysql.connect(**MYSQL_CONFIG)
        print("   [OK] Connected to local MySQL successfully!")
    except Exception as e:
        print(f"   [ERROR] Could not connect to local MySQL: {e}")
        pg_conn.close()
        sys.exit(1)

    # 3. Transfer data table by table
    print("\n3. Transferring data from MySQL to Supabase...")
    with my_conn.cursor() as my_cur, pg_conn.cursor() as pg_cur:
        for table in TABLES_ORDER:
            my_cur.execute(f"SELECT * FROM `{table}`")
            rows = my_cur.fetchall()
            count = len(rows)

            if count == 0:
                print(f"   - {table}: 0 rows (empty, skipping)")
                continue

            # Column names
            cols = list(rows[0].keys())
            col_identifiers = ', '.join([f'"{c}"' for c in cols])
            placeholders = ', '.join(['%s'] * len(cols))

            # Conflict handling
            if table == 'notification_reads':
                conflict_clause = 'ON CONFLICT ("notification_id", "user_id") DO NOTHING'
            elif 'id' in cols:
                # Update all non-id columns on conflict
                updates = [f'"{c}" = EXCLUDED."{c}"' for c in cols if c != 'id']
                if updates:
                    conflict_clause = f'ON CONFLICT ("id") DO UPDATE SET {", ".join(updates)}'
                else:
                    conflict_clause = 'ON CONFLICT ("id") DO NOTHING'
            else:
                conflict_clause = ''

            insert_query = f'INSERT INTO "{table}" ({col_identifiers}) VALUES ({placeholders}) {conflict_clause}'

            # Prepare values with type conversions
            val_tuples = []
            for r in rows:
                val_row = []
                for c in cols:
                    val = r[c]
                    if table == 'detection_results' and c in ('all_predictions', 'detected_symptoms'):
                        if isinstance(val, (dict, list)):
                            val = json.dumps(val)
                        elif val is None or val == '':
                            val = json.dumps([])
                        elif isinstance(val, str):
                            # Ensure it's valid JSON
                            try:
                                json.loads(val)
                            except Exception:
                                val = json.dumps([])
                    elif table == 'tasks' and c == 'completed':
                        val = bool(val) if val is not None else False
                    elif table == 'alerts' and c == 'is_read':
                        val = bool(val) if val is not None else False
                    elif table == 'chickens' and c == 'status_color':
                        if not val:
                            val = '#4CAF50'
                    val_row.append(val)
                val_tuples.append(tuple(val_row))

            # Insert rows
            try:
                for val in val_tuples:
                    pg_cur.execute(insert_query, val)
                pg_conn.commit()
                print(f"   - {table}: {count} rows migrated successfully [OK]")
            except Exception as err:
                pg_conn.rollback()
                print(f"   - {table}: FAILED ({err})")
                raise err

            # Reset serial sequence if table has 'id' column
            if 'id' in cols and table != 'notification_reads':
                try:
                    pg_cur.execute(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE((SELECT MAX(id) FROM \"{table}\"), 1));")
                    pg_conn.commit()
                    print(f"     Sequence for '{table}' updated to MAX(id)")
                except Exception as seq_err:
                    print(f"     (Notice updating sequence for {table}: {seq_err})")

    my_conn.close()
    pg_conn.close()

    print("\n" + "=" * 60)
    print("MIGRATION COMPLETE! All data is now live on Supabase!")
    print("=" * 60)

if __name__ == '__main__':
    run_migration()
