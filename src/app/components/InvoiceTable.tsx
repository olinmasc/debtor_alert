"use client";

import React, { useState } from "react";
import { MessageCircle, Copy, Check, Phone, CheckCircle2, Clock } from "lucide-react";

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

interface InvoiceTableProps {
  invoices: Invoice[];
  loading: boolean;
  onRemind: (invoiceNos: string[]) => void;
  onMarkDone?: (invoiceNo: string) => void;
  onSetOverdue?: (invoiceNo: string, days: number | null) => void;
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
  const formattedDate = invoice.invoice_date 
    ? new Date(invoice.invoice_date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

  return template
    .replace(/\[Debtor Name\]/g, invoice.debtor_name || invoice.contact_name || "Sir/Madam")
    .replace(/\[Invoice No\]/g, invoice.invoice_no)
    .replace(/\[Invoice Date\]/g, formattedDate)
    .replace(
      /\[Pending Amount\]/g,
      Number(invoice.pending_amount).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
      })
    )
    .replace(/\[Days Overdue\]/g, String(invoice.days_overdue || 0));
}

function buildGroupMessage(invoices: Invoice[]): string {
  if (invoices.length === 1) return buildMessage(invoices[0]);

  const maxReminder = Math.max(...invoices.map(i => i.reminder_count));
  const template = getTemplate(maxReminder);
  
  const totalAmount = invoices.reduce((acc, inv) => acc + Number(inv.pending_amount), 0);
  const maxDaysOverdue = Math.max(...invoices.map(i => i.days_overdue || 0));
  
  const invoiceListStr = invoices.map(inv => {
    const amt = Number(inv.pending_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 });
    return `- ${inv.invoice_no} (₹${amt})`;
  }).join("\n");

  const formattedDate = "various dates";
  
  let msg = template
    .replace(/\[Debtor Name\]/g, invoices[0].debtor_name || invoices[0].contact_name || "Sir/Madam")
    .replace(/\[Invoice No\]/g, `${invoices.length} invoices`)
    .replace(/\[Invoice Date\]/g, formattedDate)
    .replace(
      /\[Pending Amount\]/g,
      totalAmount.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
      })
    )
    .replace(/\[Days Overdue\]/g, String(maxDaysOverdue));
    
  return msg + "\n\nPending Invoices:\n" + invoiceListStr;
}

function getOverdueConfig(days: number) {
  if (days > 30) return { rowClass: "row-red", badge: "badge-red", label: "Critical" };
  if (days > 15) return { rowClass: "row-orange", badge: "badge-orange", label: "Overdue" };
  if (days > 0) return { rowClass: "row-yellow", badge: "badge-yellow", label: "Due" };
  return { rowClass: "", badge: "badge-green", label: "Current" };
}

function InvoiceTable({
  invoices,
  loading,
  onRemind,
  onMarkDone,
  onSetOverdue,
}: InvoiceTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({});

  const toggleGroup = (debtorId: number) => {
    setExpandedGroups(prev => ({ ...prev, [debtorId]: !prev[debtorId] }));
  };

  const handleCopy = (invoicesToCopy: Invoice[], idToSet: string) => {
    const msg = buildGroupMessage(invoicesToCopy);
    navigator.clipboard.writeText(msg);
    setCopiedId(idToSet);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleWhatsApp = (invoicesToSend: Invoice[]) => {
    const primaryInvoice = invoicesToSend[0];
    if (!primaryInvoice.phone_number) {
      alert("No phone number set for this debtor. Add it in the Import & Sync tab.");
      return;
    }
    const msg = buildGroupMessage(invoicesToSend);
    // Strip to digits, then ensure 91 prefix with exactly 10-digit number
    let digits = primaryInvoice.phone_number.replace(/[^0-9]/g, "");
    if (digits.length === 10) digits = `91${digits}`;           // add country code
    else if (digits.startsWith("91") && digits.length === 12) {} // already correct
    else digits = `91${digits.slice(-10)}`;                      // fallback: take last 10
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
    
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      import('@tauri-apps/plugin-shell').then(({ open }) => {
        open(url);
      }).catch(err => {
        console.error("Failed to open URL with Tauri shell plugin:", err);
        window.open(url, "_blank");
      });
    } else {
      window.open(url, "_blank");
    }
    
    onRemind(invoicesToSend.map(i => i.invoice_no));
  };

  const handleSetOverdue = (invoice: Invoice) => {
    if (!onSetOverdue) return;
    const currentVal = invoice.manual_days_overdue !== null ? String(invoice.manual_days_overdue) : "";
    const res = window.prompt(`Set manual overdue days for ${invoice.invoice_no}\n(Leave blank to revert to automatic calculation):`, currentVal);
    
    if (res === null) return; // cancelled
    
    const parsed = parseInt(res.trim(), 10);
    if (res.trim() === "" || isNaN(parsed)) {
      onSetOverdue(invoice.invoice_no, null);
    } else {
      onSetOverdue(invoice.invoice_no, parsed);
    }
  };

  const groupedInvoices = React.useMemo(() => {
    const groups: Record<number, Invoice[]> = {};
    invoices.forEach(inv => {
      if (!groups[inv.debtor_id]) groups[inv.debtor_id] = [];
      groups[inv.debtor_id].push(inv);
    });
    return Object.values(groups).sort((a, b) => {
      const maxDaysA = Math.max(...a.map(i => i.days_overdue || 0));
      const maxDaysB = Math.max(...b.map(i => i.days_overdue || 0));
      return maxDaysB - maxDaysA; // sort by max overdue desc
    });
  }, [invoices]);

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
                "Invoice Info",
                "Total Amount (₹)",
                "Max Days Overdue",
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
            {groupedInvoices.map((group, idx) => {
              const primary = group[0];
              const debtorId = primary.debtor_id;
              const totalAmount = group.reduce((sum, inv) => sum + Number(inv.pending_amount), 0);
              const maxDaysOverdue = Math.max(...group.map(inv => inv.days_overdue || 0));
              const maxReminder = Math.max(...group.map(inv => inv.reminder_count));
              const cfg = getOverdueConfig(maxDaysOverdue);
              const isExpanded = !!expandedGroups[debtorId];
              const isSingle = group.length === 1;

              return (
                <React.Fragment key={debtorId}>
                  <tr
                    className={`${cfg.rowClass} animate-fade-in`}
                    style={{
                      borderBottom: isExpanded ? "none" : "1px solid var(--border-default)",
                      transition: "background 0.2s",
                      animationDelay: `${idx * 0.03}s`,
                      animationFillMode: "backwards",
                      cursor: isSingle ? "default" : "pointer",
                    }}
                    onClick={() => { if (!isSingle) toggleGroup(debtorId); }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--bg-card-hover)";
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
                          display: "flex",
                          alignItems: "center",
                          gap: 6
                        }}
                      >
                        {!isSingle && (
                           <span style={{ fontSize: '10px', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
                        )}
                        {primary.debtor_name || "—"}
                      </div>
                      {primary.phone_number ? (
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
                          {primary.phone_number}
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

                    {/* Invoice Info */}
                    <td
                      style={{
                        padding: "12px 16px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {isSingle ? (
                         <span style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{primary.invoice_no}</span>
                      ) : (
                         <span className="badge badge-blue">{group.length} Invoices</span>
                      )}
                    </td>

                    {/* Total Amount */}
                    <td
                      style={{
                        padding: "12px 16px",
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--text-primary)",
                      }}
                    >
                      ₹
                      {totalAmount.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </td>

                    {/* Max Days Overdue */}
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className={`badge ${cfg.badge}`}>
                          {maxDaysOverdue} days — {cfg.label}
                        </span>
                      </div>
                    </td>

                    {/* Reminders */}
                    <td
                      style={{
                        padding: "12px 16px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {maxReminder > 0 ? (
                        <span className="badge badge-blue">
                          Max {maxReminder}×
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>None</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "12px 16px" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          id={`whatsapp-group-${debtorId}`}
                          className="btn-whatsapp"
                          onClick={() => handleWhatsApp(group)}
                          title="Send via WhatsApp"
                        >
                          <MessageCircle size={14} />
                          WhatsApp
                        </button>
                        <button
                          id={`copy-group-${debtorId}`}
                          className="btn-ghost"
                          onClick={() => handleCopy(group, `group-${debtorId}`)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                          title="Copy combined message"
                        >
                          {copiedId === `group-${debtorId}` ? (
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
                        {isSingle && onMarkDone && (
                          <button
                            className="btn-ghost"
                            onClick={() => onMarkDone(primary.invoice_no)}
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
                        {isSingle && onSetOverdue && (
                          <button
                            className="btn-ghost"
                            onClick={() => handleSetOverdue(primary)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                            title="Set Manual Overdue Days"
                          >
                            <Clock size={14} />
                            Set
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Sub-rows for Multiple Invoices */}
                  {!isSingle && isExpanded && group.map((inv, subIdx) => {
                    const invDays = inv.days_overdue || 0;
                    const invCfg = getOverdueConfig(invDays);
                    return (
                      <tr
                        key={inv.invoice_no}
                        style={{
                          background: "var(--bg-elevated)",
                          borderBottom: subIdx === group.length - 1 ? "1px solid var(--border-default)" : "1px solid rgba(255,255,255,0.05)",
                        }}
                      >
                        <td colSpan={2} style={{ padding: "8px 16px 8px 40px", color: "var(--text-secondary)", fontFamily: "monospace", fontSize: "0.8rem" }}>
                          ↳ {inv.invoice_no}
                          <span style={{ marginLeft: 10, fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "'Inter', sans-serif" }}>
                            {inv.invoice_date
                              ? new Date(inv.invoice_date).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "—"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 16px", fontVariantNumeric: "tabular-nums" }}>
                          ₹{Number(inv.pending_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: "8px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                             <span className={`badge ${invCfg.badge}`}>{invDays} days</span>
                             {inv.manual_days_overdue !== null && (
                               <span title="Manually overriden" style={{ fontSize: "10px", cursor: "help" }}>✏️</span>
                             )}
                          </div>
                        </td>
                        <td style={{ padding: "8px 16px", color: "var(--text-secondary)" }}>
                          {inv.reminder_count > 0 ? `${inv.reminder_count}×` : "—"}
                        </td>
                        <td style={{ padding: "8px 16px" }}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                                className="btn-ghost"
                                onClick={() => handleWhatsApp([inv])}
                                style={{ padding: 4 }}
                                title="WhatsApp specific invoice"
                            >
                                <MessageCircle size={14} color="var(--success)" />
                            </button>
                            {onMarkDone && (
                              <button
                                className="btn-ghost"
                                onClick={() => onMarkDone(inv.invoice_no)}
                                style={{ padding: 4, color: "var(--success)" }}
                                title="Mark as Paid"
                              >
                                <CheckCircle2 size={14} />
                              </button>
                            )}
                            {onSetOverdue && (
                              <button
                                className="btn-ghost"
                                onClick={() => handleSetOverdue(inv)}
                                style={{ padding: 4 }}
                                title="Set Overdue"
                              >
                                <Clock size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default React.memo(InvoiceTable);
