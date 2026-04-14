# Debtor Alert — Outstanding Receivables Dashboard

An internal tool to ingest Tally "Outstanding Receivables" CSV/Excel exports, store them in PostgreSQL, and send structured WhatsApp reminders to debtors.

![Dashboard](screenshot-dashboard.png)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React, Tailwind CSS v4, Lucide Icons |
| Backend | Python, FastAPI, Pandas, SQLAlchemy |
| Database | PostgreSQL |

## Setup

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.11
- **PostgreSQL** running on `localhost:5432`

### 1. Database

```bash
psql -U postgres -c "CREATE DATABASE debtor_alert;"
```

### 2. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The backend will auto-create the `debtors` and `invoices` tables on startup.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features

### Dashboard (Tab 1)
- Summary stat cards (Total Outstanding, Overdue Count, Critical, Avg Days)
- Sortable data table with all open invoices
- Color-coded overdue tiers: 🟡 1–15 days, 🟠 16–30 days, 🔴 30+ days
- **Send WhatsApp** — opens `wa.me` link with pre-filled template message
- **Copy** — copies the reminder message to clipboard
- Search by debtor name or invoice number

### Import & Sync (Tab 2)
- Drag-and-drop file upload (.csv, .xlsx, .xls)
- Smart header detection for Tally exports
- **Upsert logic** — creates new debtors/invoices or updates existing amounts
- **Auto-reconciliation** — marks invoices as `Paid` if they disappear from the file
- Missing phone number table with inline editing

### Templates (Tab 3)
- 3 reminder tiers: Friendly, Firm, Urgent
- Editable templates with variable placeholders: `[Debtor Name]`, `[Invoice No]`, `[Pending Amount]`, `[Days Overdue]`
- Live preview with sample data
- Persisted in `localStorage`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload CSV/Excel file for ingestion |
| GET | `/api/invoices?status=Open` | List invoices (with debtor info + days_overdue) |
| PATCH | `/api/invoices/{no}/remind` | Record a reminder was sent |
| GET | `/api/debtors?missing_phone=true` | List debtors missing phone numbers |
| PATCH | `/api/debtors/{id}` | Update debtor phone/contact info |

## Environment Variables

**Backend** (`backend/.env`):
```
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/debtor_alert
```

**Frontend** (optional — defaults to `http://localhost:8000`):
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```
