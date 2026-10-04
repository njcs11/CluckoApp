"""
Enable Row Level Security (RLS) on all public tables in Supabase
to resolve Supabase Security Advisor warnings/errors.
"""
import psycopg2
from db import SUPABASE_CONFIG

def main():
    print("Connecting to Supabase PostgreSQL...")
    conn = psycopg2.connect(**SUPABASE_CONFIG)
    cur = conn.cursor()

    cur.execute("""
        SELECT tablename, rowsecurity
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename;
    """)
    tables = cur.fetchall()

    print(f"Found {len(tables)} tables in schema 'public':")
    for t, rls in tables:
        print(f"  {t}: {'ENABLED' if rls else 'DISABLED'}")

    print("\nApplying ALTER TABLE ... ENABLE ROW LEVEL SECURITY...")
    for t, _ in tables:
        cur.execute(f'ALTER TABLE public."{t}" ENABLE ROW LEVEL SECURITY;')
        print(f"  [OK] Enabled RLS on public.{t}")

    conn.commit()

    cur.execute("""
        SELECT tablename, rowsecurity
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename;
    """)
    updated = cur.fetchall()
    print("\nVerification - Final RLS Status:")
    all_ok = True
    for t, rls in updated:
        status = "ENABLED (Secure)" if rls else "DISABLED (Insecure)"
        print(f"  {t}: {status}")
        if not rls:
            all_ok = False

    conn.close()

    if all_ok:
        print("\nSUCCESS: All public tables have Row Level Security enabled!")
    else:
        print("\nWARNING: Some tables could not be enabled.")

if __name__ == "__main__":
    main()
