import sys
import os
import json

sys.path.insert(0, os.path.dirname(__file__))
from db import get_db
from routes_subscriptions import PLANS_CONFIG

def run_migration():
    print("Connecting to Supabase database...")
    db = get_db()
    try:
        with db.cursor() as cur:
            # 1. Check existing tables
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """)
            existing = set(r['table_name'] for r in cur.fetchall())
            print(f"Existing tables in DB ({len(existing)}): {sorted(list(existing))}")

            # 2. Create admin_audit_logs
            print("Creating admin_audit_logs if not exists...")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS admin_audit_logs (
                    id SERIAL PRIMARY KEY,
                    admin_user_id INTEGER DEFAULT 0,
                    admin_name VARCHAR(255) NOT NULL,
                    action VARCHAR(100) NOT NULL,
                    target_type VARCHAR(100),
                    target_id VARCHAR(100),
                    description TEXT,
                    details JSONB,
                    ip_address VARCHAR(100),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_audit_target ON admin_audit_logs(target_type, target_id);
                CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_logs(created_at DESC);
            """)

            # 3. Create subscription_plans_config
            print("Creating subscription_plans_config if not exists...")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS subscription_plans_config (
                    id SERIAL PRIMARY KEY,
                    plan_key VARCHAR(50) UNIQUE NOT NULL,
                    name VARCHAR(100) NOT NULL,
                    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                    currency VARCHAR(10) DEFAULT 'PHP',
                    duration_days INTEGER DEFAULT 30,
                    max_farms INTEGER DEFAULT 1,
                    max_chickens_per_farm INTEGER DEFAULT 20,
                    max_captures INTEGER DEFAULT 100,
                    features JSONB,
                    badge VARCHAR(100) DEFAULT '',
                    updated_by VARCHAR(100) DEFAULT 'system',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # 4. Create subscription_refund_requests
            print("Creating subscription_refund_requests if not exists...")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS subscription_refund_requests (
                    id SERIAL PRIMARY KEY,
                    transaction_id INTEGER REFERENCES subscription_transactions(id) ON DELETE CASCADE,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    reason TEXT,
                    details TEXT,
                    status VARCHAR(50) DEFAULT 'pending',
                    admin_notes TEXT,
                    reviewed_by INTEGER,
                    reviewed_at TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_srr_user ON subscription_refund_requests(user_id);
                CREATE INDEX IF NOT EXISTS idx_srr_tx ON subscription_refund_requests(transaction_id);
            """)

            # 5. Create account_appeals
            print("Creating account_appeals if not exists...")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS account_appeals (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    user_email VARCHAR(255) NOT NULL,
                    user_name VARCHAR(255),
                    reason TEXT,
                    appeal_text TEXT,
                    status VARCHAR(50) DEFAULT 'pending',
                    admin_notes TEXT,
                    resolved_at TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_appeals_status ON account_appeals(status);
            """)

            # 6. Create password_reset_codes
            print("Creating password_reset_codes if not exists...")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS password_reset_codes (
                    email VARCHAR(255) PRIMARY KEY,
                    code VARCHAR(20) NOT NULL,
                    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    attempts INTEGER DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # 7. Seed subscription_plans_config from PLANS_CONFIG
            print("Seeding subscription_plans_config...")
            for plan_key, cfg in PLANS_CONFIG.items():
                cur.execute("""
                    INSERT INTO subscription_plans_config
                    (plan_key, name, price, currency, duration_days, max_farms, max_chickens_per_farm, max_captures, features, badge, updated_at, updated_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), 'system_init')
                    ON CONFLICT (plan_key) DO UPDATE SET
                        name = EXCLUDED.name,
                        price = EXCLUDED.price,
                        duration_days = EXCLUDED.duration_days,
                        max_farms = EXCLUDED.max_farms,
                        max_chickens_per_farm = EXCLUDED.max_chickens_per_farm,
                        max_captures = EXCLUDED.max_captures,
                        features = EXCLUDED.features,
                        badge = EXCLUDED.badge
                """, (
                    plan_key,
                    cfg['name'],
                    cfg['price'],
                    cfg.get('currency', 'PHP'),
                    cfg.get('duration_days', 30),
                    cfg.get('max_farms', 1),
                    cfg.get('max_chickens_per_farm', 20),
                    cfg.get('max_captures', 30),
                    json.dumps(cfg.get('features', [])),
                    cfg.get('badge', '')
                ))

            db.commit()

            # Confirm final tables
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """)
            updated_tables = set(r['table_name'] for r in cur.fetchall())
            print(f"SUCCESS! Database now contains {len(updated_tables)} tables: {sorted(list(updated_tables))}")

    except Exception as e:
        db.rollback()
        print(f"Error during migration: {e}")
        raise e
    finally:
        db.close()

if __name__ == '__main__':
    run_migration()

