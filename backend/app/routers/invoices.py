"""
invoices.py — Invoice query & action endpoints.

GET   /api/invoices                   — list open invoices with debtor info + days_overdue
PATCH /api/invoices/{invoice_no}/remind — record that a reminder was sent
"""

from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

from ..database import get_db
from ..models import Invoice, Debtor
from ..schemas import InvoiceOut

router = APIRouter()


@router.get("/invoices", response_model=List[InvoiceOut])
def list_invoices(
    status: Optional[str] = Query("Open", description="Filter by status: Open, Paid, or All"),
    db: Session = Depends(get_db),
):
    """
    Return invoices joined with debtor info.
    Computes `days_overdue` dynamically from invoice_date.
    """
    query = db.query(Invoice).options(joinedload(Invoice.debtor))

    if status and status.lower() != "all":
        query = query.filter(Invoice.status == status)

    invoices = query.order_by(Invoice.invoice_date.asc()).all()
    today = date.today()

    results: list[InvoiceOut] = []
    for inv in invoices:
        days_overdue = (today - inv.invoice_date).days if inv.invoice_date else 0
        results.append(
            InvoiceOut(
                invoice_no=inv.invoice_no,
                debtor_id=inv.debtor_id,
                invoice_date=inv.invoice_date,
                pending_amount=inv.pending_amount,
                status=inv.status,
                last_reminded_date=inv.last_reminded_date,
                reminder_count=inv.reminder_count,
                debtor_name=inv.debtor.tally_ledger_name if inv.debtor else None,
                contact_name=inv.debtor.contact_name if inv.debtor else None,
                phone_number=inv.debtor.phone_number if inv.debtor else None,
                days_overdue=days_overdue,
            )
        )

    # sort by most overdue first
    results.sort(key=lambda x: x.days_overdue or 0, reverse=True)
    return results


@router.patch("/invoices/{invoice_no}/remind")
def record_reminder(
    invoice_no: str,
    db: Session = Depends(get_db),
):
    """Increment reminder_count and set last_reminded_date to now."""
    invoice = db.query(Invoice).filter(Invoice.invoice_no == invoice_no).first()
    if not invoice:
        raise HTTPException(404, f"Invoice '{invoice_no}' not found.")

    invoice.reminder_count += 1
    invoice.last_reminded_date = datetime.now(timezone.utc)
    db.commit()
    db.refresh(invoice)

    return {
        "invoice_no": invoice.invoice_no,
        "reminder_count": invoice.reminder_count,
        "last_reminded_date": invoice.last_reminded_date.isoformat(),
    }


@router.patch("/invoices/{invoice_no}/paid")
def mark_invoice_paid(
    invoice_no: str,
    db: Session = Depends(get_db),
):
    """Mark an invoice as Paid."""
    invoice = db.query(Invoice).filter(Invoice.invoice_no == invoice_no).first()
    if not invoice:
        raise HTTPException(404, f"Invoice '{invoice_no}' not found.")

    invoice.status = "Paid"
    db.commit()
    db.refresh(invoice)

    return {
        "invoice_no": invoice.invoice_no,
        "status": invoice.status,
    }
