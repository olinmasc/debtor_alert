"use client";

import { useEffect, useState, useMemo, useDeferredValue, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  IndianRupee,
  AlertTriangle,
  Clock,
  TrendingUp,
  Search,
  RefreshCw,
  X,
} from "lucide-react";
import InvoiceTable from "./InvoiceTable";


interface Invoice {
  invoice_no: string;
  debtor_id: number;
  invoice_date: string | null;
  pending_amount: number;
  status: string;
  last_reminded_date: string | null;
  reminder_count: number;
  debtor_name: string | null;
  contact_name: string | null;
  phone_number: string | null;
  days_overdue: number | null;
  manual_days_overdue: number | null;
}

interface DashboardTabProps {
  refreshKey: number;
}

export default function DashboardTab({ refreshKey }: DashboardTabProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: Invoice[] = await invoke("get_invoices", { status: "Open" });
      setInvoices(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [refreshKey, fetchInvoices]);

  // ── Deferred Search ────────────────────────────────────────────────
  const deferredSearch = useDeferredValue(search);

  // ── Computed stats ─────────────────────────────────────────────────
  const { totalOutstanding, criticalCount, overdueCount, avgOverdue } = useMemo(() => {
    const sum = invoices.reduce((acc, inv) => acc + Number(inv.pending_amount), 0);
    const critical = invoices.filter((i) => (i.days_overdue || 0) > 30).length;
    const overdue = invoices.filter((i) => (i.days_overdue || 0) > 0).length;
    const avg =
      invoices.length > 0
        ? Math.round(invoices.reduce((s, i) => s + (i.days_overdue || 0), 0) / invoices.length)
        : 0;

    return { totalOutstanding: sum, criticalCount: critical, overdueCount: overdue, avgOverdue: avg };
  }, [invoices]);

  // ── Filter ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (!deferredSearch) return true;
      const q = deferredSearch.toLowerCase();
      return (
        (inv.debtor_name || "").toLowerCase().includes(q) ||
        inv.invoice_no.toLowerCase().includes(q) ||
        (inv.contact_name || "").toLowerCase().includes(q)
      );
    });
  }, [invoices, deferredSearch]);

  // ── Stats cards data ──────────────────────────────────────────────
  const stats = useMemo(() => [
    {
      label: "Total Outstanding",
      value: `₹${totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      icon: IndianRupee,
      color: "var(--accent-primary)",
      bg: "rgba(99, 102, 241, 0.1)",
    },
    {
      label: "Overdue Invoices",
      value: overdueCount,
      icon: Clock,
      color: "var(--warning-orange)",
      bg: "var(--warning-orange-bg)",
    },
    {
      label: "Critical (30+ days)",
      value: criticalCount,
      icon: AlertTriangle,
      color: "var(--warning-red)",
      bg: "var(--warning-red-bg)",
    },
    {
      label: "Avg. Days Overdue",
      value: `${avgOverdue} days`,
      icon: TrendingUp,
      color: "var(--warning-yellow)",
      bg: "var(--warning-yellow-bg)",
    }
  ], [totalOutstanding, overdueCount, criticalCount, avgOverdue]);

  return (
    <div>
      {/* ── Stats Grid ─────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div
              key={idx}
              className="glass-card animate-slide-up"
              style={{
                padding: "20px 22px",
                animationDelay: `${idx * 0.07}s`,
                animationFillMode: "backwards",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {stat.label}
                </span>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "var(--radius-sm)",
                    background: stat.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon size={17} color={stat.color} />
                </div>
              </div>
              <p
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  margin: 0,
                  color: "var(--text-primary)",
                }}
              >
                {stat.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ position: "relative", flex: "1 1 300px", maxWidth: 400 }}>
          <Search
            size={16}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
            }}
          />
          <input
            id="search-invoices"
            type="text"
            className="input-field"
            placeholder="Search by debtor, invoice no…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 36, paddingRight: 36 }}
          />
          {search && (
            <button
              className="btn-ghost"
              onClick={() => setSearch("")}
              style={{
                position: "absolute",
                right: 4,
                top: "50%",
                transform: "translateY(-50%)",
                padding: "6px",
                color: "var(--text-muted)",
              }}
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <button
          id="refresh-dashboard"
          className="btn-ghost"
          onClick={fetchInvoices}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* ── Table ──────────────────────────────────────────────────── */}
      {error ? (
        <div
          className="glass-card"
          style={{
            padding: 32,
            textAlign: "center",
            color: "var(--warning-red)",
          }}
        >
          <AlertTriangle
            size={28}
            style={{ margin: "0 auto 8px", display: "block" }}
          />
          <p style={{ margin: 0, fontWeight: 600 }}>Connection Error</p>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
            }}
          >
            {error}. Make sure the backend is running at{" "}
            <code style={{ color: "var(--accent-primary)" }}>
              localhost:8000
            </code>
          </p>
        </div>
      ) : (
        <InvoiceTable
          invoices={filtered}
          loading={loading}
          onRemind={async (invoiceNos) => {
            for (const invoiceNo of invoiceNos) {
              await invoke("remind_invoice", { invoiceNo });
            }
            fetchInvoices();
          }}
          onMarkDone={async (invoiceNo) => {
            await invoke("mark_invoice_paid", { invoiceNo });
            fetchInvoices();
          }}
          onSetOverdue={async (invoiceNo, manualDays) => {
            await invoke("override_invoice_overdue", { invoiceNo, manualDaysOverdue: manualDays });
            fetchInvoices();
          }}
        />
      )}
    </div>
  );
}
