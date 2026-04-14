"use client";

import { useState } from "react";
import { MessageCircle, Copy, Check, Phone, CheckCircle2 } from "lucide-react";

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
}

interface InvoiceTableProps {
  invoices: Invoice[];
  loading: boolean;
  onRemind: (invoiceNo: string) => void;
  onMarkDone?: (invoiceNo: string) => void;
}

/** Default templates stored in localStorage */
function getTemplate(reminderCount: number): string {
  const templates = JSON.parse(
    localStorage.getItem("reminder_templates") ||
      JSON.stringify({
        1: "Hi [Debtor Name],\n\nThis is a friendly reminder that Invoice [Invoice No] for ₹[Pending Amount] is overdue by [Days Overdue] days.\n\nKindly arrange the payment at your earliest convenience.\n\nThank you! 🙏",
        2: "Dear [Debtor Name],\n\nWe notice Invoice [Invoice No] for ₹[Pending Amount] remains unpaid ([Days Overdue] days overdue). We request you to clear this at the earliest.\n\nPlease contact us if there are any issues.\n\nRegards.",
        3: "Dear [Debtor Name],\n\nThis is an URGENT reminder regarding Invoice [Invoice No] for ₹[Pending Amount], now [Days Overdue] days past due.\n\nImmediate action is required to avoid further escalation.\n\nPlease settle this at earliest.",
      })
  );
  const level = Math.min(reminderCount + 1, 3);
  return templates[level] || templates[1];
}

function buildMessage(invoice: Invoice): string {
  const template = getTemplate(invoice.reminder_count);
  return template
    .replace(/\[Debtor Name\]/g, invoice.debtor_name || invoice.contact_name || "Sir/Madam")
    .replace(/\[Invoice No\]/g, invoice.invoice_no)
    .replace(
      /\[Pending Amount\]/g,
      Number(invoice.pending_amount).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
      })
    )
    .replace(/\[Days Overdue\]/g, String(invoice.days_overdue || 0));
}

function getOverdueConfig(days: number) {
  if (days > 30) return { rowClass: "row-red", badge: "badge-red", label: "Critical" };
  if (days > 15) return { rowClass: "row-orange", badge: "badge-orange", label: "Overdue" };
  if (days > 0) return { rowClass: "row-yellow", badge: "badge-yellow", label: "Due" };
  return { rowClass: "", badge: "badge-green", label: "Current" };
}

export default function InvoiceTable({
  invoices,
  loading,
  onRemind,
  onMarkDone,
}: InvoiceTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (invoice: Invoice) => {
    const msg = buildMessage(invoice);
    navigator.clipboard.writeText(msg);
    setCopiedId(invoice.invoice_no);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleWhatsApp = (invoice: Invoice) => {
    if (!invoice.phone_number) {
      alert("No phone number set for this debtor. Add it in the Import & Sync tab.");
      return;
    }
    const msg = buildMessage(invoice);
    // Strip to digits, then ensure 91 prefix with exactly 10-digit number
    let digits = invoice.phone_number.replace(/[^0-9]/g, "");
    if (digits.length === 10) digits = `91${digits}`;           // add country code
    else if (digits.startsWith("91") && digits.length === 12) {} // already correct
    else digits = `91${digits.slice(-10)}`;                      // fallback: take last 10
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
    onRemind(invoice.invoice_no);
  };

  if (loading) {
    return (
      <div className="glass-card" style={{ overflow: "hidden" }}>
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            style={{
              height: 52,
              borderBottom: "1px solid var(--border-default)",
              background: `linear-gradient(90deg, var(--bg-card) 25%, var(--bg-elevated) 50%, var(--bg-card) 75%)`,
              backgroundSize: "400% 100%",
              animation: "shimmer 1.5s ease-in-out infinite",
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div
        className="glass-card"
        style={{
          padding: "48px 24px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontSize: "1.1rem",
            fontWeight: 600,
            color: "var(--text-secondary)",
            margin: "0 0 4px",
          }}
        >
          No open invoices
        </p>
        <p
          style={{
            fontSize: "0.85rem",
            color: "var(--text-muted)",
            margin: 0,
          }}
        >
          Upload a Tally export in the Import & Sync tab to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table
          id="invoice-table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.85rem",
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "1px solid var(--border-default)",
                background: "var(--bg-elevated)",
              }}
            >
              {[
                "Debtor",
                "Invoice No",
                "Date",
                "Amount (₹)",
                "Days Overdue",
                "Reminders",
                "Actions",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontWeight: 600,
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-secondary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv, idx) => {
              const days = inv.days_overdue || 0;
              const cfg = getOverdueConfig(days);
              return (
                <tr
                  key={inv.invoice_no}
                  className={`${cfg.rowClass} animate-fade-in`}
                  style={{
                    borderBottom: "1px solid var(--border-default)",
                    transition: "background 0.2s",
                    animationDelay: `${idx * 0.03}s`,
                    animationFillMode: "backwards",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "var(--bg-card-hover)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "";
                  }}
                >
                  {/* Debtor */}
                  <td style={{ padding: "12px 16px" }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        marginBottom: 2,
                      }}
                    >
                      {inv.debtor_name || "—"}
                    </div>
                    {inv.phone_number ? (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Phone size={10} />
                        {inv.phone_number}
                      </div>
                    ) : (
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--warning-orange)",
                          fontWeight: 500,
                        }}
                      >
                        No phone
                      </span>
                    )}
                  </td>

                  {/* Invoice No */}
                  <td
                    style={{
                      padding: "12px 16px",
                      fontFamily: "monospace",
                      fontSize: "0.8rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {inv.invoice_no}
                  </td>

                  {/* Date */}
                  <td
                    style={{
                      padding: "12px 16px",
                      color: "var(--text-secondary)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {inv.invoice_date
                      ? new Date(inv.invoice_date).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </td>

                  {/* Amount */}
                  <td
                    style={{
                      padding: "12px 16px",
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--text-primary)",
                    }}
                  >
                    ₹
                    {Number(inv.pending_amount).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </td>

                  {/* Days Overdue */}
                  <td style={{ padding: "12px 16px" }}>
                    <span className={`badge ${cfg.badge}`}>
                      {days} days — {cfg.label}
                    </span>
                  </td>

                  {/* Reminders */}
                  <td
                    style={{
                      padding: "12px 16px",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {inv.reminder_count > 0 ? (
                      <span className="badge badge-blue">
                        {inv.reminder_count}×
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>None</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        id={`whatsapp-${inv.invoice_no}`}
                        className="btn-whatsapp"
                        onClick={() => handleWhatsApp(inv)}
                        title="Send via WhatsApp"
                      >
                        <MessageCircle size={14} />
                        WhatsApp
                      </button>
                      <button
                        id={`copy-${inv.invoice_no}`}
                        className="btn-ghost"
                        onClick={() => handleCopy(inv)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                        title="Copy message to clipboard"
                      >
                        {copiedId === inv.invoice_no ? (
                          <>
                            <Check size={14} color="var(--success)" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy size={14} />
                            Copy
                          </>
                        )}
                      </button>
                      {onMarkDone && (
                        <button
                          className="btn-ghost"
                          onClick={() => onMarkDone(inv.invoice_no)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            color: "var(--success)"
                          }}
                          title="Mark Invoice as Paid"
                        >
                          <CheckCircle2 size={14} />
                          Done
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
