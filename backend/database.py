import sqlite3
import os
import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from config import DB_PATH, DATABASE_URL


@contextmanager
def get_db():
    if DATABASE_URL:
        # PostgreSQL (Supabase)
        try:
            conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
            yield conn
        except Exception as e:
            print(f"ERROR: Could not connect to PostgreSQL: {e}")
            raise
        finally:
            if 'conn' in locals():
                conn.close()
    else:
        # SQLite (Local)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()


def get_placeholder():
    return "%s" if DATABASE_URL else "?"


def init_db():
    if not DATABASE_URL:
        # Check if we are in a production/serverless environment like Vercel
        # Vercel's filesystem is read-only except for /tmp
        if os.getenv("VERCEL") or os.getenv("NOW_REGION"):
            print("WARNING: DATABASE_URL not set in production. Skipping SQLite initialization as filesystem is read-only.")
            return

    try:
        with get_db() as conn:
            cursor = conn.cursor()
            p = get_placeholder()
            
            # Note: SQLite uses 'id TEXT PRIMARY KEY', Postgres uses same.
            cursor.execute(f"""
                CREATE TABLE IF NOT EXISTS invoices (
                    id TEXT PRIMARY KEY,
                    merchant_address TEXT NOT NULL,
                    customer_email TEXT DEFAULT '',
                    amount TEXT NOT NULL,
                    token_address TEXT NOT NULL,
                    memo TEXT NOT NULL,
                    status TEXT DEFAULT 'PENDING',
                    created_at TEXT NOT NULL,
                    paid_at TEXT,
                    expires_at TEXT,
                    payment_link TEXT,
                    tempo_tx_hash TEXT DEFAULT '',
                    payer_address TEXT DEFAULT '',
                    tempo_chain_id TEXT,
                    tempo_rpc TEXT,
                    stablecoin_name TEXT DEFAULT 'USD Stablecoin',
                    fee_sponsored TEXT DEFAULT 'false'
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS contacts (
                    id TEXT PRIMARY KEY,
                    owner_wallet TEXT NOT NULL,
                    name TEXT NOT NULL,
                    wallet_address TEXT NOT NULL,
                    email TEXT DEFAULT '',
                    phone TEXT DEFAULT ''
                )
            """)
            conn.commit()

            # ── migrations for existing databases ──
            migrations = [
                "ALTER TABLE contacts ADD COLUMN phone TEXT DEFAULT ''",
                "ALTER TABLE invoices ADD COLUMN fee_sponsored TEXT DEFAULT 'false'",
            ]
            for sql in migrations:
                try:
                    cursor.execute(sql)
                    conn.commit()
                except Exception:
                    # Column already exists — ignore
                    if DATABASE_URL:
                        conn.rollback()

        print("database initialized")
    except Exception as e:
        print(f"Error initializing database: {e}")
        if not DATABASE_URL:
            print("CRITICAL: DATABASE_URL (Postgres) is not set.")
            print("Vercel's filesystem is read-only, so SQLite ('payme.db') will FAIL.")
            print("Please set DATABASE_URL in your Vercel Environment Variables.")


def row_to_dict(row) -> dict:
    if not row:
        return {}
        
    # sqlite3.Row or RealDictRow/dict
    try:
        r = dict(row)
    except (TypeError, ValueError):
        # Fallback if it's a tuple (shouldn't happen with our cursors)
        return {}

    return {
        "id": r.get("id"),
        "merchantAddress": r.get("merchant_address"),
        "customerEmail": r.get("customer_email") or "",
        "amount": r.get("amount"),
        "tokenAddress": r.get("token_address"),
        "memo": r.get("memo"),
        "status": r.get("status"),
        "createdAt": r.get("created_at"),
        "paidAt": r.get("paid_at"),
        "expiresAt": r.get("expires_at"),
        "paymentLink": r.get("payment_link"),
        "tempoTxHash": r.get("tempo_tx_hash") or "",
        "payerAddress": r.get("payer_address") or "",
        "tempoChainId": r.get("tempo_chain_id"),
        "tempoRpc": r.get("tempo_rpc"),
        "stablecoinName": r.get("stablecoin_name"),
        "feeSponsored": r.get("fee_sponsored", "false") == "true",
    }
