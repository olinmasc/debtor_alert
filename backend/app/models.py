"""
models.py — SQLAlchemy ORM models for Debtor and Invoice.
"""

from sqlalchemy import (
    Column, Integer, String, Numeric, Date, DateTime, ForeignKey, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class Debtor(Base):
    """
    A debtor / customer / party as known in Tally.
    `tally_ledger_name` is the unique key used for matching during CSV imports.
    """
    __tablename__ = "debtors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tally_ledger_name = Column(String(255), unique=True, nullable=False, index=True)
    contact_name = Column(String(255), nullable=True)
    phone_number = Column(String(20), nullable=True)

    # one-to-many relationship with invoices
    invoices = relationship("Invoice", back_populates="debtor", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Debtor(id={self.id}, name='{self.tally_ledger_name}')>"


class Invoice(Base):
    """
    An outstanding receivable invoice.
    - status: 'Open' (money owed) or 'Paid' (settled / reconciled).
    - reminder_count / last_reminded_date: tracks WhatsApp follow-ups.
    """
    __tablename__ = "invoices"

    invoice_no = Column(String(100), primary_key=True)
    debtor_id = Column(Integer, ForeignKey("debtors.id", ondelete="CASCADE"), nullable=False)
    invoice_date = Column(Date, nullable=True)
    pending_amount = Column(Numeric(14, 2), nullable=False, default=0)
    status = Column(String(10), nullable=False, default="Open", index=True)
    last_reminded_date = Column(DateTime(timezone=True), nullable=True)
    reminder_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # relationship back to debtor
    debtor = relationship("Debtor", back_populates="invoices")

    # composite index for common query pattern
    __table_args__ = (
        Index("ix_invoices_debtor_status", "debtor_id", "status"),
    )

    def __repr__(self):
        return f"<Invoice(no='{self.invoice_no}', amount={self.pending_amount}, status='{self.status}')>"


class UploadHistory(Base):
    """
    Tracks each file upload — filename, timestamp, and summary counts.
    """
    __tablename__ = "upload_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    filename = Column(String(500), nullable=False)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    file_size_bytes = Column(Integer, nullable=True)
    debtors_created = Column(Integer, nullable=False, default=0)
    invoices_created = Column(Integer, nullable=False, default=0)
    invoices_updated = Column(Integer, nullable=False, default=0)
    invoices_reconciled = Column(Integer, nullable=False, default=0)

    def __repr__(self):
        return f"<UploadHistory(id={self.id}, file='{self.filename}')>"
