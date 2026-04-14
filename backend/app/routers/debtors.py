"""
debtors.py — Debtor CRUD endpoints.

GET  /api/debtors          — list all debtors (optional ?missing_phone=true filter)
PATCH /api/debtors/{id}    — update phone_number / contact_name
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from ..models import Debtor
from ..schemas import DebtorOut, DebtorUpdate

router = APIRouter()


@router.get("/debtors", response_model=List[DebtorOut])
def list_debtors(
    missing_phone: Optional[bool] = Query(None, description="If true, return only debtors without a phone number"),
    db: Session = Depends(get_db),
):
    """Return all debtors, optionally filtered to those missing a phone number."""
    query = db.query(Debtor)
    if missing_phone:
        query = query.filter(
            (Debtor.phone_number == None) | (Debtor.phone_number == "")
        )
    return query.order_by(Debtor.tally_ledger_name).all()


@router.patch("/debtors/{debtor_id}", response_model=DebtorOut)
def update_debtor(
    debtor_id: int,
    payload: DebtorUpdate,
    db: Session = Depends(get_db),
):
    """Update a debtor's contact_name and/or phone_number."""
    debtor = db.query(Debtor).filter(Debtor.id == debtor_id).first()
    if not debtor:
        raise HTTPException(404, f"Debtor with id {debtor_id} not found.")

    if payload.contact_name is not None:
        debtor.contact_name = payload.contact_name
    if payload.phone_number is not None:
        debtor.phone_number = payload.phone_number

    db.commit()
    db.refresh(debtor)
    return debtor
