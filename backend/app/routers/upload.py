"""
upload.py — POST /api/upload

Accepts a CSV, Excel, or XML file exported from Tally's "Outstanding Receivables" report.
Performs:
  1. Smart header detection & column standardization via Pandas.
  2. Upsert logic — create debtors/invoices or update existing ones.
  3. Auto-reconciliation — mark invoices as 'Paid' if they vanished from the file.
"""

import io
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Debtor, Invoice, UploadHistory
from ..schemas import UploadResult, UploadHistoryOut

router = APIRouter()

# ── Column-name mapping ────────────────────────────────────────────────
# Tally exports vary wildly.  We try several known patterns.
COLUMN_MAP = {
    "tally_ledger_name": [
        "party", "party name", "ledger", "ledger name",
        "customer", "customer name", "debtor", "debtor name",
        "particulars", "name", "tally_ledger_name",
    ],
    "invoice_no": [
        "invoice no", "invoice no.", "invoice number", "inv no",
        "bill no", "bill number", "ref no", "voucher no",
        "vch no", "reference", "invoice_no",
    ],
    "date": [
        "date", "invoice date", "bill date", "voucher date",
        "inv date", "invoice_date",
    ],
    "amount": [
        "amount", "pending amount", "outstanding", "balance",
        "pending", "due amount", "receivable", "debit",
        "pending_amount",
    ],
}


def _normalise_col(col: str) -> str:
    """Lowercase, strip, collapse whitespace, remove special chars."""
    return re.sub(r"[^a-z0-9 ]", "", col.lower().strip())


def _detect_columns(df: pd.DataFrame) -> dict[str, Optional[str]]:
    """
    Map our canonical column names to actual DataFrame column names.
    Returns {canonical_name: actual_column_name_or_None}.
    """
    mapping: dict[str, Optional[str]] = {}
    normalised = {_normalise_col(c): c for c in df.columns}

    for canonical, candidates in COLUMN_MAP.items():
        found = None
        for cand in candidates:
            norm_cand = _normalise_col(cand)
            if norm_cand in normalised:
                found = normalised[norm_cand]
                break
        mapping[canonical] = found

    return mapping


def _sanitize_xml(raw_bytes: bytes) -> bytes:
    """
    Clean raw XML bytes so ElementTree can parse them.
    Tally exports commonly have:
      - Invalid character references like &#0; &#1; ... &#31; (except &#9; &#10; &#13;)
      - Bare & characters not escaped as &amp;
      - Control characters embedded directly in text
    """
    # Decode to string — try utf-8 first, then latin-1 as fallback
    try:
        text = raw_bytes.decode("utf-8", errors="replace")
    except Exception:
        text = raw_bytes.decode("latin-1", errors="replace")

    # 1. Remove invalid XML character references (&#0; through &#31; except tab/newline/cr)
    #    Also handles &#x0; hex variants
    text = re.sub(r"&#x?0*[0-8bceBCE];", "", text)        # &#0;..&#8;, &#11;, &#12;, &#14;, &#15;
    text = re.sub(r"&#x?0*1[0-9a-fA-F];", "", text)       # &#16;..&#31;
    text = re.sub(r"&#0*([0-8]|1[0-1]|1[4-9]|2[0-9]|3[01]);", "", text)

    # 2. Remove raw control characters (bytes 0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)

    # 3. Fix bare ampersands: & not followed by a valid entity or # reference
    text = re.sub(r"&(?!(?:amp|lt|gt|apos|quot|#\d+|#x[0-9a-fA-F]+);)", "&amp;", text)

    return text.encode("utf-8")


def _parse_xml(raw_bytes: bytes) -> pd.DataFrame:
    """
    Parse a Tally XML export into a flat DataFrame.
    Handles common Tally XML structures:
      - <ENVELOPE><BODY><DATA>...<TALLYMESSAGE>...<VOUCHER>... (detailed)
      - Flat rows like <ROW><FIELD1>val</FIELD1>...</ROW>
    Falls back to flattening all leaf elements into rows.
    """
    # Sanitize before parsing — Tally XMLs are notoriously messy
    cleaned = _sanitize_xml(raw_bytes)

    try:
        root = ET.fromstring(cleaned)
    except ET.ParseError as e:
        raise ValueError(f"Invalid XML file: {e}")

    rows: list[dict[str, str]] = []

    # Strategy 1: Look for VOUCHER or BILL elements (Tally native XML)
    voucher_tags = root.iter()
    target_elements: list[ET.Element] = []
    for elem in root.iter():
        tag_upper = elem.tag.upper()
        if tag_upper in ("VOUCHER", "BILL", "LEDGER", "BILLALLOCATIONS", "ROW", "RECORD", "ENTRY"):
            target_elements.append(elem)

    if target_elements:
        for elem in target_elements:
            row_data: dict[str, str] = {}
            # Collect attributes
            for attr_key, attr_val in elem.attrib.items():
                row_data[attr_key] = attr_val
            # Collect direct child text
            for child in elem:
                if child.text and child.text.strip():
                    row_data[child.tag] = child.text.strip()
                # Go one level deeper for nested structures
                for subchild in child:
                    if subchild.text and subchild.text.strip():
                        key = f"{child.tag}_{subchild.tag}" if child.tag != subchild.tag else subchild.tag
                        row_data[key] = subchild.text.strip()
            if row_data:
                rows.append(row_data)
    else:
        # Strategy 2: Generic — treat each second-level element as a row
        for child in root:
            row_data = {}
            if child.text and child.text.strip() and len(list(child)) == 0:
                continue  # skip plain text nodes
            for field in child:
                if field.text and field.text.strip():
                    row_data[field.tag] = field.text.strip()
            if row_data:
                rows.append(row_data)

    if not rows:
        raise ValueError(
            "Could not extract any data rows from the XML file. "
            "Ensure it contains voucher/bill/record elements with receivable data."
        )

    return pd.DataFrame(rows).astype(str)


def _find_header_row(raw_bytes: bytes, filename: str) -> pd.DataFrame:
    """
    Parse uploaded file into a DataFrame.
    - XML: parsed via ElementTree and flattened.
    - CSV/Excel: tries header rows 0–10, picks the first with ≥2 column matches.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "csv"

    # ── XML path ───────────────────────────────────────────────────────
    if ext == "xml":
        return _parse_xml(raw_bytes)

    # ── CSV / Excel path ──────────────────────────────────────────────
    read_fn = pd.read_csv if ext == "csv" else pd.read_excel

    for skip in range(11):
        try:
            buf = io.BytesIO(raw_bytes)
            df = read_fn(buf, header=skip, dtype=str)
            detected = _detect_columns(df)
            matches = sum(1 for v in detected.values() if v is not None)
            if matches >= 2:
                return df
        except Exception:
            continue

    raise ValueError(
        "Could not detect valid column headers in the uploaded file. "
        "Expected columns like: Party/Ledger Name, Invoice No, Date, Amount."
    )


def _clean_amount(val) -> float:
    """Parse an amount string that may contain commas, currency symbols, Dr/Cr suffixes."""
    if pd.isna(val) or val is None:
        return 0.0
    s = str(val).strip()
    # remove common currency symbols and Dr/Cr
    s = re.sub(r"[₹$€,]", "", s)
    s = re.sub(r"\s*(Dr|Cr)\.?\s*$", "", s, flags=re.IGNORECASE)
    try:
        return abs(float(s))
    except ValueError:
        return 0.0


def _clean_date(val) -> Optional[datetime]:
    """Try multiple date formats common in Tally exports."""
    if pd.isna(val) or val is None:
        return None
    s = str(val).strip()
    for fmt in ("%d-%b-%Y", "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d.%m.%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    # last resort: let pandas try
    try:
        return pd.to_datetime(s).date()
    except Exception:
        return None


# ── Main upload endpoint ───────────────────────────────────────────────

@router.post("/upload", response_model=UploadResult)
async def upload_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Ingest a Tally Outstanding Receivables export (CSV, Excel, or XML).

    Returns counts of created / updated / reconciled records.
    """
    # ── 1. Validate file type ──────────────────────────────────────────
    if not file.filename:
        raise HTTPException(400, "No file provided.")
    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("csv", "xlsx", "xls", "xml"):
        raise HTTPException(400, f"Unsupported file type '.{ext}'. Upload CSV, Excel, or XML.")

    raw = await file.read()
    if len(raw) == 0:
        raise HTTPException(400, "Uploaded file is empty.")

    # ── 2. Parse & detect columns ──────────────────────────────────────
    try:
        df = _find_header_row(raw, file.filename)
    except ValueError as e:
        raise HTTPException(422, str(e))

    col_map = _detect_columns(df)

    # we need at least ledger name and (invoice_no OR amount)
    if col_map["tally_ledger_name"] is None:
        raise HTTPException(
            422,
            "Could not find a 'Party / Ledger Name' column. "
            "Check that your Tally export contains this field.",
        )

    # ── 3. Iterate rows — upsert debtors & invoices ───────────────────
    counters = {"debtors_created": 0, "invoices_created": 0, "invoices_updated": 0, "invoices_reconciled": 0}
    errors: list[str] = []
    seen_invoice_nos: set[str] = set()

    # pre-fetch caches to avoid repeated O(N) database queries in the loop
    debtor_cache: dict[str, Debtor] = {d.tally_ledger_name: d for d in db.query(Debtor).all()}
    invoice_cache: dict[str, Invoice] = {i.invoice_no: i for i in db.query(Invoice).all()}

    for idx, row in df.iterrows():
        try:
            # ── extract values ────────────────────────────────────────
            ledger_raw = row.get(col_map["tally_ledger_name"])
            if pd.isna(ledger_raw) or not str(ledger_raw).strip():
                continue  # skip blank rows
            ledger_name = str(ledger_raw).strip()

            inv_col = col_map.get("invoice_no")
            inv_no_raw = row.get(inv_col) if inv_col else None
            if pd.isna(inv_no_raw) or not str(inv_no_raw).strip():
                # generate a synthetic invoice no if missing
                inv_no = f"AUTO-{ledger_name}-{idx}"
            else:
                inv_no = str(inv_no_raw).strip()

            date_col = col_map.get("date")
            inv_date = _clean_date(row.get(date_col) if date_col else None)

            amt_col = col_map.get("amount")
            amount = _clean_amount(row.get(amt_col) if amt_col else 0)

            # ── upsert debtor ─────────────────────────────────────────
            if ledger_name in debtor_cache:
                debtor = debtor_cache[ledger_name]
            else:
                debtor = Debtor(tally_ledger_name=ledger_name)
                db.add(debtor)
                db.flush()  # get the id immediately
                counters["debtors_created"] += 1
                debtor_cache[ledger_name] = debtor

            # ── upsert invoice ────────────────────────────────────────
            seen_invoice_nos.add(inv_no)
            invoice = invoice_cache.get(inv_no)

            if invoice is None:
                invoice = Invoice(
                    invoice_no=inv_no,
                    debtor_id=debtor.id,
                    invoice_date=inv_date,
                    pending_amount=amount,
                    status="Open",
                )
                db.add(invoice)
                invoice_cache[inv_no] = invoice
                counters["invoices_created"] += 1
            else:
                # update existing — refresh amount and re-open if it was paid
                invoice.pending_amount = amount
                invoice.status = "Open"
                if inv_date:
                    invoice.invoice_date = inv_date
                counters["invoices_updated"] += 1

        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")

    # ── 4. Auto-reconciliation ─────────────────────────────────────────
    # Any invoice currently 'Open' in the DB that was NOT in the uploaded
    # file is assumed to have been settled → mark it 'Paid'.
    if seen_invoice_nos:
        open_in_db = db.query(Invoice).filter(Invoice.status == "Open").all()
        for inv in open_in_db:
            if inv.invoice_no not in seen_invoice_nos:
                inv.status = "Paid"
                counters["invoices_reconciled"] += 1

    # ── 5. Save upload history ─────────────────────────────────────────
    upload_record = UploadHistory(
        filename=file.filename,
        file_size_bytes=len(raw),
        debtors_created=counters["debtors_created"],
        invoices_created=counters["invoices_created"],
        invoices_updated=counters["invoices_updated"],
        invoices_reconciled=counters["invoices_reconciled"],
    )
    db.add(upload_record)

    # ── 6. Commit & return summary ─────────────────────────────────────
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Database error: {str(e)}")

    return UploadResult(**counters, errors=errors)


# ── Upload history & data management ───────────────────────────────────

@router.get("/uploads", response_model=list[UploadHistoryOut])
def list_uploads(db: Session = Depends(get_db)):
    """Return all upload history records, most recent first."""
    return db.query(UploadHistory).order_by(UploadHistory.uploaded_at.desc()).all()


@router.delete("/data")
def delete_all_data(db: Session = Depends(get_db)):
    """
    Wipe ALL data: invoices, debtors, and upload history.
    This is a destructive operation — use with caution.
    """
    inv_count = db.query(Invoice).count()
    deb_count = db.query(Debtor).count()
    upl_count = db.query(UploadHistory).count()

    db.query(Invoice).delete()
    db.query(Debtor).delete()
    db.query(UploadHistory).delete()

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Database error: {str(e)}")

    return {
        "deleted": {
            "invoices": inv_count,
            "debtors": deb_count,
            "uploads": upl_count,
        },
        "message": "All data has been deleted.",
    }


@router.delete("/uploads/{upload_id}")
def delete_upload_record(upload_id: int, db: Session = Depends(get_db)):
    """
    Delete a specific upload history log.
    NOTE: This only removes the log entry, it does NOT undo the data imported.
    """
    upload = db.query(UploadHistory).filter(UploadHistory.id == upload_id).first()
    if not upload:
        raise HTTPException(404, "Upload history record not found.")
    
    db.delete(upload)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Database error: {str(e)}")
        
    return {"message": "Upload log deleted."}
