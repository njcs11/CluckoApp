"""
Migration script to create subscription tables in Supabase PostgreSQL
and safely grandfather existing accounts.
"""
from db import get_db
from datetime import datetime, timedelta

def migrate():
    db = get_db()
    try:
        with db.cursor() as cur:
            print("Creating subscriptions and subscription_transactions tables...")
            
            cur.execute('''
                CREATE TABLE IF NOT EXISTS subscriptions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    plan VARCHAR(50) NOT NULL DEFAULT 'free_trial',
                    status VARCHAR(50) NOT NULL DEFAULT 'active',
                    price_paid NUMERIC(10, 2) DEFAULT 0.00,
                    currency VARCHAR(10) DEFAULT 'PHP',
                    payment_gateway VARCHAR(50) DEFAULT NULL,
                    payment_reference VARCHAR(255) DEFAULT NULL,
                    max_farms INTEGER NOT NULL DEFAULT 1,
                    max_chickens_per_farm INTEGER NOT NULL DEFAULT 20,
                    max_captures INTEGER NOT NULL DEFAULT 30,
                    captures_used INTEGER NOT NULL DEFAULT 0,
                    free_trial_used BOOLEAN NOT NULL DEFAULT TRUE,
                    start_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    end_date TIMESTAMP NOT NULL,
                    grace_period_end TIMESTAMP NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT unique_user_active_sub UNIQUE (user_id)
                );
            ''')
            
            cur.execute('''
                CREATE TABLE IF NOT EXISTS subscription_transactions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
                    plan VARCHAR(50) NOT NULL,
                    amount NUMERIC(10, 2) NOT NULL,
                    currency VARCHAR(10) DEFAULT 'PHP',
                    payment_gateway VARCHAR(50) NOT NULL,
                    payment_method VARCHAR(50) DEFAULT NULL,
                    checkout_session_id VARCHAR(255) DEFAULT NULL,
                    checkout_url TEXT DEFAULT NULL,
                    status VARCHAR(50) NOT NULL DEFAULT 'pending',
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            ''')
            
            cur.execute('CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_sub_tx_user ON subscription_transactions(user_id);')
            
            db.commit()
            print("Tables created successfully.")
            
            # Grandfather existing owner accounts!
            cur.execute("SELECT id, email, first_name, last_name FROM users WHERE role = 'owner'")
            owners = cur.fetchall()
            print(f"Found {len(owners)} existing owner accounts.")
            
            now = datetime.utcnow()
            pro_end = now + timedelta(days=30)
            pro_grace = pro_end + timedelta(days=7)
            
            trial_end = now + timedelta(days=30)
            trial_grace = trial_end + timedelta(days=7)
            
            for owner in owners:
                u_id = owner['id']
                # Check how many farms this owner currently owns
                cur.execute("SELECT COUNT(*) as farm_cnt FROM farms WHERE owner_id = %s", (u_id,))
                fc = cur.fetchone()['farm_cnt']
                
                # Check captures count
                cur.execute("SELECT COUNT(*) as cap_cnt FROM image_captures WHERE user_id = %s", (u_id,))
                cc = cur.fetchone()['cap_cnt']
                
                # Check if subscription record already exists
                cur.execute("SELECT id FROM subscriptions WHERE user_id = %s", (u_id,))
                existing_sub = cur.fetchone()
                
                if not existing_sub:
                    if fc >= 2:
                        # Existing owner with 2+ farms (e.g. tadlan@gmail.com):
                        # Grant complimentary 30-Day Pro Plan! 2 farms, 70 chickens/farm, unlimited captures!
                        print(f"Grandfathering user {owner['email']} (has {fc} farms) -> PRO PLAN (Early Adopter Gift)")
                        cur.execute('''
                            INSERT INTO subscriptions 
                            (user_id, plan, status, price_paid, currency, payment_gateway,
                             max_farms, max_chickens_per_farm, max_captures, captures_used,
                             free_trial_used, start_date, end_date, grace_period_end)
                            VALUES (%s, 'pro', 'active', 0.00, 'PHP', 'early_adopter_gift',
                                    2, 70, 999999, %s, TRUE, %s, %s, %s)
                        ''', (u_id, cc, now, pro_end, pro_grace))
                    else:
                        # Existing owner with 1 farm:
                        # Give 30-day Free Trial with 1 farm, 20 chickens, 30 captures
                        print(f"Setting user {owner['email']} (has {fc} farm) -> FREE TRIAL PLAN (30 days)")
                        cur.execute('''
                            INSERT INTO subscriptions 
                            (user_id, plan, status, price_paid, currency, payment_gateway,
                             max_farms, max_chickens_per_farm, max_captures, captures_used,
                             free_trial_used, start_date, end_date, grace_period_end)
                            VALUES (%s, 'free_trial', 'active', 0.00, 'PHP', 'system',
                                    1, 20, 30, %s, TRUE, %s, %s, %s)
                        ''', (u_id, min(cc, 30), now, trial_end, trial_grace))
            
            db.commit()
            print("Grandfathering migration completed successfully!")
            
    except Exception as e:
        db.rollback()
        print(f"Migration error: {e}")
        raise e
    finally:
        db.close()

if __name__ == '__main__':
    migrate()
