"""
main.py — FastAPI application entry point.

- Registers all routers under /api
- Configures CORS for the Next.js frontend
- Creates database tables on startup
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .routers import upload, debtors, invoices


# ── Lifespan: create tables on startup ──────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create all tables if they don't exist
    Base.metadata.create_all(bind=engine)
    yield
    # Shutdown: nothing to clean up


app = FastAPI(
    title="Debtor Alert API",
    description="Backend for the Debtor Alert Webapp — ingest Tally data, manage debtors, send reminders.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ─────────────────────────────────────────────────────────────
app.include_router(upload.router,    prefix="/api", tags=["Upload & Ingestion"])
app.include_router(debtors.router,   prefix="/api", tags=["Debtors"])
app.include_router(invoices.router,  prefix="/api", tags=["Invoices"])


@app.get("/")
def root():
    return {"status": "ok", "service": "Debtor Alert API"}
