"""
schemas.py — Pydantic models for API requests and responses.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


# ── Debtor ──────────────────────────────────────────────────────────────

class DebtorBase(BaseModel):
    tally_ledger_name: str
    contact_name: Optional[str] = None
    phone_number: Optional[str] = None


class DebtorOut(DebtorBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class DebtorUpdate(BaseModel):
    """Partial update — all fields optional."""
    contact_name: Optional[str] = None
    phone_number: Optional[str] = None


# ── Invoice ─────────────────────────────────────────────────────────────

class InvoiceOut(BaseModel):
    invoice_no: str
    debtor_id: int
    invoice_date: Optional[date] = None
    pending_amount: Decimal
    status: str
    last_reminded_date: Optional[datetime] = None
    reminder_count: int

    # joined debtor info (populated manually)
    debtor_name: Optional[str] = None
    contact_name: Optional[str] = None
    phone_number: Optional[str] = None
    days_overdue: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# ── Upload Result ───────────────────────────────────────────────────────

class UploadResult(BaseModel):
    debtors_created: int
    invoices_created: int
    invoices_updated: int
    invoices_reconciled: int   # open → paid (missing from upload)
    errors: List[str] = []


# ── Upload History ──────────────────────────────────────────────────────

class UploadHistoryOut(BaseModel):
    id: int
    filename: str
    uploaded_at: datetime
    file_size_bytes: Optional[int] = None
    debtors_created: int
    invoices_created: int
    invoices_updated: int
    invoices_reconciled: int

    model_config = ConfigDict(from_attributes=True)
