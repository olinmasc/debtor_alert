"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  Save,
  Phone,
  Loader2,
  ArrowUpFromLine,
  Trash2,
  FileText,
  Clock,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface UploadResult {
  debtors_created: number;
  invoices_created: number;
  invoices_updated: number;
  invoices_reconciled: number;
  errors: string[];
}

interface Debtor {
  id: number;
  tally_ledger_name: string;
  contact_name: string | null;
  phone_number: string | null;
}

interface UploadHistoryItem {
  id: number;
  filename: string;
  uploaded_at: string;
  file_size_bytes: number | null;
  debtors_created: number;
  invoices_created: number;
  invoices_updated: number;
  invoices_reconciled: number;
}

interface ImportSyncTabProps {
  onUploadComplete: () => void;
}

export default function ImportSyncTab({ onUploadComplete }: ImportSyncTabProps) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [missingPhoneDebtors, setMissingPhoneDebtors] = useState<Debtor[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [phoneInputs, setPhoneInputs] = useState<Record<number, string>>({});
  const [uploads, setUploads] = useState<UploadHistoryItem[]>([]);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch debtors missing phone
  const fetchMissingPhone = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/debtors?missing_phone=true`);
      if (res.ok) {
        const data = await res.json();
        setMissingPhoneDebtors(data);
      }
    } catch {
      /* silently fail */
    }
  }, []);

  // Fetch upload history
  const fetchUploads = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/uploads`);
      if (res.ok) {
        const data = await res.json();
        setUploads(data);
      }
    } catch {
      /* silently fail */
    }
  }, []);

  useEffect(() => {
    fetchMissingPhone();
    fetchUploads();
  }, [fetchMissingPhone, fetchUploads]);

  // ── File Upload ─────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setUploading(true);
    setResult(null);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API}/api/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `Error ${res.status}`);
      }
      const data: UploadResult = await res.json();
      setResult(data);
      onUploadComplete();
      fetchMissingPhone();
      fetchUploads();
    } catch (err: unknown) {
      setUploadError(
        err instanceof Error ? err.message : "Upload failed"
      );
    } finally {
      setUploading(false);
    }
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    []
  );

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  // ── Save phone number ──────────────────────────────────────────────
  const savePhone = async (debtorId: number) => {
    const digits = phoneInputs[debtorId]?.replace(/[^0-9]/g, "").slice(0, 10);
    if (!digits || digits.length !== 10) return;
    const fullPhone = `+91${digits}`; // always store with +91 prefix
    setSavingId(debtorId);
    try {
      const res = await fetch(`${API}/api/debtors/${debtorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: fullPhone }),
      });
      if (res.ok) {
        setMissingPhoneDebtors((prev) =>
          prev.filter((d) => d.id !== debtorId)
        );
        setPhoneInputs((prev) => {
          const copy = { ...prev };
          delete copy[debtorId];
          return copy;
        });
      }
    } catch {
      /* silently fail */
    } finally {
      setSavingId(null);
    }
  };

  // ── Delete all data ────────────────────────────────────────────────
  const handleDeleteAll = async () => {
    const confirmed = window.confirm(
      "⚠️ This will permanently delete ALL uploaded data (debtors, invoices, and upload history).\n\nAre you sure?"
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch(`${API}/api/data`, { method: "DELETE" });
      if (res.ok) {
        setUploads([]);
        setMissingPhoneDebtors([]);
        setResult(null);
        onUploadComplete(); // refresh dashboard
      }
    } catch {
      /* silently fail */
    } finally {
      setDeleting(false);
    }
  };

  // ── Delete individual upload log ────────────────────────────────────
  const handleDeleteUpload = async (id: number) => {
    if (!window.confirm("Remove this upload record from history? (This does not undo the data imported)")) return;
    try {
      const res = await fetch(`${API}/api/uploads/${id}`, { method: "DELETE" });
      if (res.ok) {
        setUploads((prev) => prev.filter((u) => u.id !== id));
      }
    } catch {
      /* silently fail */
    }
  };

  // ── Format file size ───────────────────────────────────────────────
  const formatSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ── Upload Zone ──────────────────────────────────────────── */}
      <div
        className="glass-card"
        style={{
          padding: 32,
          textAlign: "center",
          cursor: "pointer",
          border: dragOver
            ? "2px dashed var(--accent-primary)"
            : "1px solid var(--border-default)",
          background: dragOver
            ? "rgba(99, 102, 241, 0.05)"
            : "var(--bg-card)",
          transition: "all 0.25s",
        }}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.xml"
          onChange={onFileSelect}
          style={{ display: "none" }}
          id="file-upload-input"
        />

        {uploading ? (
          <div>
            <Loader2
              size={40}
              style={{
                margin: "0 auto 12px",
                display: "block",
                color: "var(--accent-primary)",
                animation: "spin 1s linear infinite",
              }}
            />
            <p
              style={{
                fontWeight: 600,
                color: "var(--text-primary)",
                margin: "0 0 4px",
              }}
            >
              Processing file…
            </p>
            <p
              style={{
                fontSize: "0.85rem",
                color: "var(--text-muted)",
                margin: 0,
              }}
            >
              Cleaning data, upserting records, and reconciling invoices.
            </p>
          </div>
        ) : (
          <div>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "var(--radius-lg)",
                background: "rgba(99, 102, 241, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <ArrowUpFromLine
                size={24}
                color="var(--accent-primary)"
              />
            </div>
            <p
              style={{
                fontWeight: 600,
                fontSize: "1rem",
                color: "var(--text-primary)",
                margin: "0 0 6px",
              }}
            >
              Drop your Tally export here
            </p>
            <p
              style={{
                fontSize: "0.85rem",
                color: "var(--text-muted)",
                margin: "0 0 16px",
              }}
            >
              or click to browse — supports .csv, .xlsx, .xls, .xml
            </p>
            <button className="btn-primary" style={{ pointerEvents: "none" }}>
              <Upload size={14} style={{ marginRight: 6 }} />
              Select File
            </button>
          </div>
        )}
      </div>

      {/* ── Upload Result ────────────────────────────────────────── */}
      {result && (
        <div className="glass-card animate-slide-up" style={{ padding: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <CheckCircle2 size={22} color="var(--success)" />
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                margin: 0,
                color: "var(--text-primary)",
              }}
            >
              Upload Complete
            </h3>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            {[
              {
                label: "Debtors Created",
                value: result.debtors_created,
                color: "var(--accent-primary)",
              },
              {
                label: "Invoices Created",
                value: result.invoices_created,
                color: "var(--success)",
              },
              {
                label: "Invoices Updated",
                value: result.invoices_updated,
                color: "var(--warning-yellow)",
              },
              {
                label: "Auto-Reconciled",
                value: result.invoices_reconciled,
                color: "var(--warning-orange)",
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  background: "var(--bg-elevated)",
                  borderRadius: "var(--radius-md)",
                  padding: "14px 16px",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    fontSize: "1.4rem",
                    fontWeight: 700,
                    color: item.color,
                    margin: "0 0 4px",
                  }}
                >
                  {item.value}
                </p>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                    margin: 0,
                    fontWeight: 500,
                  }}
                >
                  {item.label}
                </p>
              </div>
            ))}
          </div>

          {result.errors.length > 0 && (
            <div
              style={{
                marginTop: 16,
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                background: "var(--warning-red-bg)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
              }}
            >
              <p
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--warning-red)",
                  margin: "0 0 6px",
                }}
              >
                {result.errors.length} warning(s):
              </p>
              {result.errors.slice(0, 5).map((err, i) => (
                <p
                  key={i}
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                    margin: "2px 0",
                  }}
                >
                  • {err}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {uploadError && (
        <div
          className="glass-card animate-slide-up"
          style={{
            padding: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
            borderColor: "rgba(239, 68, 68, 0.3)",
          }}
        >
          <AlertCircle size={20} color="var(--warning-red)" />
          <div style={{ flex: 1 }}>
            <p
              style={{
                fontWeight: 600,
                margin: 0,
                color: "var(--warning-red)",
              }}
            >
              Upload Failed
            </p>
            <p
              style={{
                fontSize: "0.85rem",
                margin: "2px 0 0",
                color: "var(--text-secondary)",
              }}
            >
              {uploadError}
            </p>
          </div>
          <button
            className="btn-ghost"
            onClick={() => setUploadError(null)}
            style={{ padding: 6 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Upload History ────────────────────────────────────────── */}
      <div className="glass-card" style={{ overflow: "hidden" }}>
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-default)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FileText size={16} color="var(--accent-primary)" />
            <h3
              style={{
                fontSize: "0.9rem",
                fontWeight: 700,
                margin: 0,
                color: "var(--text-primary)",
              }}
            >
              Upload History
            </h3>
            {uploads.length > 0 && (
              <span className="badge badge-blue">
                {uploads.length} file{uploads.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {uploads.length > 0 && (
            <button
              id="delete-all-data"
              className="btn-ghost"
              onClick={handleDeleteAll}
              disabled={deleting}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "var(--warning-red)",
                borderColor: "rgba(239, 68, 68, 0.3)",
                opacity: deleting ? 0.5 : 1,
              }}
            >
              {deleting ? (
                <Loader2
                  size={14}
                  style={{ animation: "spin 1s linear infinite" }}
                />
              ) : (
                <Trash2 size={14} />
              )}
              Delete All Data
            </button>
          )}
        </div>

        {uploads.length === 0 ? (
          <div
            style={{
              padding: "32px 20px",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "0.85rem",
            }}
          >
            No files uploaded yet. Drop a Tally export above to get started.
          </div>
        ) : (
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {uploads.map((upload, idx) => (
              <div
                key={upload.id}
                className="animate-fade-in"
                style={{
                  padding: "12px 20px",
                  borderBottom:
                    idx < uploads.length - 1
                      ? "1px solid var(--border-default)"
                      : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background =
                    "var(--bg-card-hover)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = "")
                }
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "var(--radius-sm)",
                      background: "rgba(99, 102, 241, 0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <FileSpreadsheet
                      size={16}
                      color="var(--accent-primary)"
                    />
                  </div>
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      {upload.filename}
                    </p>
                    <p
                      style={{
                        margin: "2px 0 0",
                        fontSize: "0.72rem",
                        color: "var(--text-muted)",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                        <Clock size={10} />
                        {new Date(upload.uploaded_at).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span>•</span>
                      <span>{formatSize(upload.file_size_bytes)}</span>
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: "0.72rem", alignItems: "center" }}>
                  {upload.debtors_created > 0 && (
                    <span className="badge badge-blue">
                      +{upload.debtors_created} debtors
                    </span>
                  )}
                  {upload.invoices_created > 0 && (
                    <span className="badge badge-green">
                      +{upload.invoices_created} invoices
                    </span>
                  )}
                  {upload.invoices_updated > 0 && (
                    <span className="badge badge-yellow">
                      {upload.invoices_updated} updated
                    </span>
                  )}
                  {upload.invoices_reconciled > 0 && (
                    <span className="badge badge-orange">
                      {upload.invoices_reconciled} reconciled
                    </span>
                  )}
                  <button
                    className="btn-ghost"
                    onClick={() => handleDeleteUpload(upload.id)}
                    style={{
                      padding: "4px",
                      color: "var(--text-muted)",
                      marginLeft: 8,
                    }}
                    title="Remove upload record"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Missing Phone Table ──────────────────────────────────── */}
      <div className="glass-card" style={{ overflow: "hidden" }}>
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-default)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Phone size={16} color="var(--warning-orange)" />
            <h3
              style={{
                fontSize: "0.9rem",
                fontWeight: 700,
                margin: 0,
                color: "var(--text-primary)",
              }}
            >
              Missing Phone Numbers
            </h3>
          </div>
          {missingPhoneDebtors.length > 0 && (
            <span className="badge badge-orange">
              {missingPhoneDebtors.length} pending
            </span>
          )}
        </div>

        {missingPhoneDebtors.length === 0 ? (
          <div
            style={{
              padding: "32px 20px",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "0.85rem",
            }}
          >
            <CheckCircle2
              size={24}
              style={{
                margin: "0 auto 8px",
                display: "block",
                color: "var(--success)",
              }}
            />
            All debtors have phone numbers ✓
          </div>
        ) : (
          <table
            id="missing-phone-table"
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
                {["Debtor Name", "Phone Number", "Action"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      fontWeight: 600,
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {missingPhoneDebtors.map((debtor) => (
                <tr
                  key={debtor.id}
                  style={{
                    borderBottom: "1px solid var(--border-default)",
                  }}
                >
                  <td
                    style={{
                      padding: "10px 16px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {debtor.tally_ledger_name}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 0, maxWidth: 260 }}>
                      <span
                        style={{
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border-default)",
                          borderRight: "none",
                          borderRadius: "var(--radius-md) 0 0 var(--radius-md)",
                          padding: "8px 10px",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          color: "var(--text-secondary)",
                          whiteSpace: "nowrap",
                          userSelect: "none",
                        }}
                      >
                        +91
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="input-field"
                        placeholder="9876543210"
                        value={phoneInputs[debtor.id] || ""}
                        onChange={(e) => {
                          // Only allow digits, cap at 10
                          const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 10);
                          setPhoneInputs((prev) => ({
                            ...prev,
                            [debtor.id]: digits,
                          }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") savePhone(debtor.id);
                        }}
                        style={{
                          flex: 1,
                          borderRadius: "0 var(--radius-md) var(--radius-md) 0",
                          letterSpacing: "0.05em",
                        }}
                        maxLength={10}
                      />
                    </div>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <button
                      className="btn-primary"
                      onClick={() => savePhone(debtor.id)}
                      disabled={
                        savingId === debtor.id ||
                        (phoneInputs[debtor.id]?.replace(/[^0-9]/g, "") || "").length !== 10
                      }
                      style={{
                        padding: "6px 14px",
                        fontSize: "0.8rem",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        opacity:
                          savingId === debtor.id ||
                          (phoneInputs[debtor.id]?.replace(/[^0-9]/g, "") || "").length !== 10
                            ? 0.5
                            : 1,
                      }}
                    >
                      {savingId === debtor.id ? (
                        <Loader2
                          size={14}
                          style={{ animation: "spin 1s linear infinite" }}
                        />
                      ) : (
                        <Save size={14} />
                      )}
                      Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
