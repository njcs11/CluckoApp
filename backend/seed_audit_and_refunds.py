import sys
import os
import json
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from db import get_db

def seed_audit_and_refunds():
    print("Connecting to Supabase to seed Audit Logs and Refund Requests...")
    db = get_db()
    try:
        with db.cursor() as cur:
            # 1. Fetch available users and transactions
            cur.execute("SELECT id, first_name, last_name, email, role FROM users ORDER BY id ASC")
            users = cur.fetchall()
            user_map = {u['id']: u for u in users}
            print(f"Found {len(users)} users.")

            cur.execute("SELECT id, user_id, plan, amount, status, created_at FROM subscription_transactions ORDER BY id ASC")
            txs = cur.fetchall()
            tx_map = {t['id']: t for t in txs}
            print(f"Found {len(txs)} transactions.")

            # Pick valid user IDs
            admin_user_id = users[0]['id'] if users else 1
            demo_user_1 = next((u for u in users if 'tadlan' in u['email'].lower() or 'jas' in u['email'].lower()), users[0])
            demo_user_2 = next((u for u in users if 'dom' in u['email'].lower() or 'nicole' in u['email'].lower()), users[-1])

            # 2. Seed realistic Admin Audit Logs
            now = datetime.utcnow()
            audit_events = [
                (
                    admin_user_id,
                    "Super Admin",
                    "system_init",
                    "system",
                    "0",
                    "Clucko AI Core Engine v2.1 initialized with MobileNetV2 architecture and Supabase secure pooling.",
                    {"component": "ai_engine", "architecture": "MobileNetV2", "status": "active"},
                    "127.0.0.1",
                    now - timedelta(days=28, hours=4)
                ),
                (
                    admin_user_id,
                    "Super Admin",
                    "plan_pricing_updated",
                    "plan",
                    "pro",
                    "Updated Pro Account tier pricing to PHP 479.00 / 90 days with unlimited AI disease captures.",
                    {"plan_key": "pro", "price": 479.0, "currency": "PHP", "duration_days": 90},
                    "192.168.1.8",
                    now - timedelta(days=21, hours=2)
                ),
                (
                    admin_user_id,
                    "Super Admin",
                    "plan_pricing_updated",
                    "plan",
                    "premium",
                    "Configured Premium Account tier at PHP 1,099.00 / 365 days (Full Year multi-farm suite).",
                    {"plan_key": "premium", "price": 1099.0, "currency": "PHP", "duration_days": 365},
                    "192.168.1.8",
                    now - timedelta(days=21, hours=1)
                ),
                (
                    admin_user_id,
                    "Super Admin",
                    "user_status_verified",
                    "user",
                    str(demo_user_1['id']),
                    f"Verified farm owner credentials and active biosecurity status for {demo_user_1['email']}.",
                    {"email": demo_user_1['email'], "action": "verify_active", "verified": True},
                    "192.168.1.8",
                    now - timedelta(days=14, hours=6)
                ),
                (
                    admin_user_id,
                    "Super Admin",
                    "user_status_verified",
                    "user",
                    str(demo_user_2['id']),
                    f"Biosecurity compliance audit completed for farm operations of {demo_user_2['email']}.",
                    {"email": demo_user_2['email'], "action": "verify_active", "verified": True},
                    "192.168.1.8",
                    now - timedelta(days=7, hours=3)
                ),
                (
                    admin_user_id,
                    "Super Admin",
                    "security_policy_enforced",
                    "system",
                    "auth",
                    "Enforced Row Level Security (RLS) and token expiration safeguards across all endpoints.",
                    {"policy": "RLS_2026", "encryption": "JWT_HS256"},
                    "127.0.0.1",
                    now - timedelta(days=3, hours=5)
                ),
                (
                    admin_user_id,
                    "Super Admin",
                    "refund_reviewed",
                    "subscription",
                    "23" if 23 in tx_map else "1",
                    "Approved 7-day grace period refund request under platform consumer terms (RA 7394).",
                    {"transaction_id": 23 if 23 in tx_map else 1, "decision": "approved", "notes": "Authorized by platform admin."},
                    "192.168.1.8",
                    now - timedelta(days=1, hours=2)
                ),
            ]

            print(f"Inserting {len(audit_events)} audit log records...")
            for ev in audit_events:
                cur.execute("""
                    INSERT INTO admin_audit_logs
                    (admin_user_id, admin_name, action, target_type, target_id, description, details, ip_address, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    ev[0], ev[1], ev[2], ev[3], ev[4], ev[5], json.dumps(ev[6]), ev[7], ev[8]
                ))

            # 3. Seed realistic Refund Requests tied to actual transactions
            # Check transaction 23 (status is 'refunded')
            refund_records = []
            if 23 in tx_map:
                tx23 = tx_map[23]
                # If tx23 user_id is not in users table, map to an existing user
                target_user_id = tx23['user_id'] if tx23['user_id'] in user_map else demo_user_1['id']
                refund_records.append((
                    23,
                    target_user_id,
                    "Accidental duplicate billing during mobile farm checkout",
                    "Owner inadvertently selected Premium plan renewal twice within the 7-day grace period.",
                    "approved",
                    "Full refund approved per 7-day cooling-off policy. Payment returned to source account.",
                    admin_user_id,
                    now - timedelta(days=1, hours=2),
                    now - timedelta(days=1, hours=8)
                ))

            # Find a paid transaction to add a realistic reviewed/pending refund request
            paid_tx = next((t for t in txs if t['status'] == 'paid' and t['id'] != 23), None)
            if paid_tx:
                t_user_id = paid_tx['user_id'] if paid_tx['user_id'] in user_map else demo_user_2['id']
                refund_records.append((
                    paid_tx['id'],
                    t_user_id,
                    "Requested cancellation within initial test period",
                    "User testing mobile deployment; requested refund assistance.",
                    "pending",
                    "Request received and queued for administrative review.",
                    None,
                    None,
                    now - timedelta(hours=18)
                ))

            print(f"Inserting {len(refund_records)} refund request records...")
            for rr in refund_records:
                cur.execute("""
                    INSERT INTO subscription_refund_requests
                    (transaction_id, user_id, reason, details, status, admin_notes, reviewed_by, reviewed_at, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, rr)

            db.commit()
            print("Successfully populated Audit Trail and Refund Requests!")

            # Verify
            cur.execute("SELECT COUNT(*) as c FROM admin_audit_logs")
            print(f"Total admin_audit_logs in database: {cur.fetchone()['c']}")
            cur.execute("SELECT COUNT(*) as c FROM subscription_refund_requests")
            print(f"Total subscription_refund_requests in database: {cur.fetchone()['c']}")

    except Exception as e:
        db.rollback()
        print(f"Error seeding records: {e}")
        raise e
    finally:
        db.close()

if __name__ == '__main__':
    seed_audit_and_refunds()

