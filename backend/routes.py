import uuid
import os
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request

from config import FRONTEND_BASE_URL, TEMPO_CHAIN_ID, TEMPO_RPC_URL
from database import get_db, row_to_dict, get_placeholder, DATABASE_URL
from models import CreateInvoiceRequest, MarkPaidRequest, CreateContactRequest
from middleware import is_valid_address
import psycopg2.extras

router = APIRouter()


def get_cursor(conn):
    if DATABASE_URL:
        return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    return conn.cursor()


@router.get("/diagnostic")
def diagnostic():
    db_status = "not connected"
    db_error = None
    try:
        with get_db() as conn:
            cursor = get_cursor(conn)
            cursor.execute("SELECT 1")
            db_status = "connected"
    except Exception as e:
        db_error = str(e)

    return {
        "status": "online",
        "database": {
            "type": "PostgreSQL" if DATABASE_URL else "SQLite",
            "connected": db_status == "connected",
            "error": db_error,
            "url_provided": bool(DATABASE_URL)
        },
        "environment": {
            "vercel": bool(os.getenv("VERCEL")),
            "frontend_base_url": FRONTEND_BASE_URL
        }
    }


# ── invoices ──────────────────────────────────────────────

@router.post("/invoices", status_code=201)
def create_invoice(req: CreateInvoiceRequest, request: Request):
    # Validate addresses
    if not is_valid_address(req.merchantAddress):
        raise HTTPException(status_code=400, detail="invalid merchant address")
    if not is_valid_address(req.tokenAddress):
        raise HTTPException(status_code=400, detail="invalid token address")

    inv_id = str(uuid.uuid4())
    memo = req.memo or f"INV-{inv_id[:8]}"
    payment_link = f"{FRONTEND_BASE_URL}/?invoiceId={inv_id}"
    now = datetime.utcnow().isoformat() + "Z"
    p = get_placeholder()

    with get_db() as conn:
        cursor = get_cursor(conn)
        cursor.execute(
            f"""INSERT INTO invoices 
               (id, merchant_address, customer_email, amount, token_address, memo, status, created_at, payment_link, tempo_chain_id, tempo_rpc)
               VALUES ({p}, {p}, {p}, {p}, {p}, {p}, 'PENDING', {p}, {p}, {p}, {p})""",
            (inv_id, req.merchantAddress, req.customerEmail, str(req.amount), req.tokenAddress, memo, now, payment_link, TEMPO_CHAIN_ID, TEMPO_RPC_URL),
        )
        conn.commit()
        cursor.execute(f"SELECT * FROM invoices WHERE id = {p}", (inv_id,))
        row = cursor.fetchone()

    return row_to_dict(row)


@router.get("/invoices")
def list_invoices(wallet: str = ""):
    p = get_placeholder()
    with get_db() as conn:
        cursor = get_cursor(conn)
        if wallet:
            cursor.execute(
                f"SELECT * FROM invoices WHERE LOWER(merchant_address) = LOWER({p}) OR LOWER(payer_address) = LOWER({p}) ORDER BY created_at DESC",
                (wallet, wallet),
            )
        else:
            cursor.execute("SELECT * FROM invoices ORDER BY created_at DESC")
        rows = cursor.fetchall()
    return [row_to_dict(r) for r in rows]


@router.get("/invoices/{invoice_id}")
def get_invoice(invoice_id: str):
    p = get_placeholder()
    with get_db() as conn:
        cursor = get_cursor(conn)
        cursor.execute(f"SELECT * FROM invoices WHERE id = {p}", (invoice_id,))
        row = cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="invoice not found")
    return row_to_dict(row)


@router.delete("/invoices/{invoice_id}", status_code=204)
def delete_invoice(invoice_id: str, request: Request):
    p = get_placeholder()
    caller = request.state.wallet

    # Ownership check: only the merchant can delete their invoice
    with get_db() as conn:
        cursor = get_cursor(conn)
        cursor.execute(f"SELECT * FROM invoices WHERE id = {p}", (invoice_id,))
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="invoice not found")
        inv = row_to_dict(row)
        if caller and inv.get("merchantAddress", "").lower() != caller:
            raise HTTPException(status_code=403, detail="not your invoice")

        cursor.execute(f"DELETE FROM invoices WHERE id = {p}", (invoice_id,))
        conn.commit()
    return None


@router.post("/invoices/{invoice_id}/pay")
def mark_paid(invoice_id: str, req: MarkPaidRequest, request: Request):
    # Validate payer address if provided
    if req.payerAddress and not is_valid_address(req.payerAddress):
        raise HTTPException(status_code=400, detail="invalid payer address")

    now = datetime.utcnow().isoformat() + "Z"
    p = get_placeholder()
    with get_db() as conn:
        cursor = get_cursor(conn)
        cursor.execute(
            f"UPDATE invoices SET status = 'PAID', paid_at = {p}, tempo_tx_hash = {p}, payer_address = {p} WHERE id = {p}",
            (now, req.txHash, req.payerAddress, invoice_id),
        )
        conn.commit()
        cursor.execute(f"SELECT * FROM invoices WHERE id = {p}", (invoice_id,))
        row = cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="invoice not found")
    return row_to_dict(row)


# ── contacts ──────────────────────────────────────────────

def _contact_to_dict(row) -> dict:
    try:
        r = dict(row)
    except (TypeError, ValueError):
        return {}
    return {
        "id": r.get("id"),
        "ownerWallet": r.get("owner_wallet"),
        "name": r.get("name"),
        "address": r.get("wallet_address"),
        "email": r.get("email") or "",
        "phone": r.get("phone") or "",
    }


@router.get("/contacts")
def list_contacts(wallet: str = ""):
    p = get_placeholder()
    with get_db() as conn:
        cursor = get_cursor(conn)
        if wallet:
            cursor.execute(
                f"SELECT * FROM contacts WHERE LOWER(owner_wallet) = LOWER({p})",
                (wallet,),
            )
        else:
            cursor.execute("SELECT * FROM contacts")
        rows = cursor.fetchall()
    return [_contact_to_dict(r) for r in rows]


@router.get("/contacts/lookup")
def lookup_contact(wallet: str = "", email: str = "", phone: str = ""):
    """Lookup a contact by email or phone within the user's address book."""
    if not wallet:
        raise HTTPException(status_code=400, detail="wallet is required")
    if not email and not phone:
        raise HTTPException(status_code=400, detail="email or phone required")

    p = get_placeholder()
    with get_db() as conn:
        cursor = get_cursor(conn)
        if email:
            cursor.execute(
                f"SELECT * FROM contacts WHERE LOWER(owner_wallet) = LOWER({p}) AND LOWER(email) = LOWER({p})",
                (wallet, email),
            )
        else:
            cursor.execute(
                f"SELECT * FROM contacts WHERE LOWER(owner_wallet) = LOWER({p}) AND phone = {p}",
                (wallet, phone),
            )
        row = cursor.fetchone()

    if row is None:
        return {"found": False, "contact": None}
    return {"found": True, "contact": _contact_to_dict(row)}


@router.post("/contacts", status_code=201)
def create_contact(req: CreateContactRequest, request: Request):
    # Validate wallet addresses
    if not is_valid_address(req.ownerWallet):
        raise HTTPException(status_code=400, detail="invalid owner wallet address")
    if not is_valid_address(req.walletAddress):
        raise HTTPException(status_code=400, detail="invalid contact wallet address")

    # Ownership: caller must match owner
    caller = request.state.wallet
    if caller and req.ownerWallet.lower() != caller:
        raise HTTPException(status_code=403, detail="wallet mismatch")

    contact_id = str(uuid.uuid4())
    p = get_placeholder()
    with get_db() as conn:
        cursor = get_cursor(conn)
        cursor.execute(
            f"INSERT INTO contacts (id, owner_wallet, name, wallet_address, email, phone) VALUES ({p}, {p}, {p}, {p}, {p}, {p})",
            (contact_id, req.ownerWallet, req.name, req.walletAddress, req.email, req.phone),
        )
        conn.commit()
        cursor.execute(f"SELECT * FROM contacts WHERE id = {p}", (contact_id,))
        row = cursor.fetchone()
    return _contact_to_dict(row)


@router.delete("/contacts/{contact_id}", status_code=204)
def delete_contact(contact_id: str, request: Request):
    p = get_placeholder()
    caller = request.state.wallet

    # Ownership check: only the owner can delete their contact
    with get_db() as conn:
        cursor = get_cursor(conn)
        cursor.execute(f"SELECT * FROM contacts WHERE id = {p}", (contact_id,))
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="contact not found")
        contact = _contact_to_dict(row)
        if caller and contact.get("ownerWallet", "").lower() != caller:
            raise HTTPException(status_code=403, detail="not your contact")

        cursor.execute(f"DELETE FROM contacts WHERE id = {p}", (contact_id,))
        conn.commit()
    return None
