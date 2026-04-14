"use client";

import { useState, useEffect } from "react";
import {
  Smile,
  AlertTriangle,
  Flame,
  Eye,
  Save,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";

interface Template {
  id: number;
  name: string;
  tone: string;
  icon: typeof Smile;
  color: string;
  bg: string;
}

const TEMPLATE_DEFS: Template[] = [
  {
    id: 1,
    name: "Reminder 1 — Friendly",
    tone: "A polite, warm reminder",
    icon: Smile,
    color: "var(--success)",
    bg: "rgba(16, 185, 129, 0.1)",
  },
  {
    id: 2,
    name: "Reminder 2 — Firm",
    tone: "A clear, direct follow-up",
    icon: AlertTriangle,
    color: "var(--warning-orange)",
    bg: "var(--warning-orange-bg)",
  },
  {
    id: 3,
    name: "Reminder 3 — Urgent",
    tone: "An urgent, final notice",
    icon: Flame,
    color: "var(--warning-red)",
    bg: "var(--warning-red-bg)",
  },
];

const DEFAULT_TEMPLATES: Record<number, string> = {
  1: `Hi [Debtor Name],

This is a friendly reminder that Invoice [Invoice No] for ₹[Pending Amount] is overdue by [Days Overdue] days.

Kindly arrange the payment at your earliest convenience.

Thank you! 🙏`,
  2: `Dear [Debtor Name],

We notice Invoice [Invoice No] for ₹[Pending Amount] remains unpaid ([Days Overdue] days overdue). We request you to clear this at the earliest.

Please contact us if there are any issues.

Regards.`,
  3: `Dear [Debtor Name],

This is an URGENT reminder regarding Invoice [Invoice No] for ₹[Pending Amount], now [Days Overdue] days past due.

Immediate action is required to avoid further escalation.

Please settle this at earliest.`,
};

const VARIABLES = [
  { name: "[Debtor Name]", desc: "Tally ledger / company name" },
  { name: "[Invoice No]", desc: "Invoice or voucher number" },
  { name: "[Pending Amount]", desc: "Outstanding amount in ₹" },
  { name: "[Days Overdue]", desc: "Days since invoice date" },
];

const PREVIEW_DATA = {
  "[Debtor Name]": "Sharma Enterprises",
  "[Invoice No]": "INV-2025-0042",
  "[Pending Amount]": "1,25,000.00",
  "[Days Overdue]": "23",
};

export default function TemplatesTab() {
  const [templates, setTemplates] = useState<Record<number, string>>(DEFAULT_TEMPLATES);
  const [activeId, setActiveId] = useState(1);
  const [saved, setSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("reminder_templates");
    if (stored) {
      try {
        setTemplates(JSON.parse(stored));
      } catch {
        /* use defaults */
      }
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem("reminder_templates", JSON.stringify(templates));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setTemplates(DEFAULT_TEMPLATES);
    localStorage.setItem("reminder_templates", JSON.stringify(DEFAULT_TEMPLATES));
  };

  // Render preview with variable substitution
  const previewText = (text: string) => {
    let result = text;
    for (const [key, val] of Object.entries(PREVIEW_DATA)) {
      result = result.replaceAll(key, val);
    }
    return result;
  };

  const activeDef = TEMPLATE_DEFS.find((t) => t.id === activeId)!;
  const ActiveIcon = activeDef.icon;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Template Selector Tabs ────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
        }}
      >
        {TEMPLATE_DEFS.map((def) => {
          const Icon = def.icon;
          const isActive = activeId === def.id;
          return (
            <button
              key={def.id}
              id={`template-tab-${def.id}`}
              onClick={() => setActiveId(def.id)}
              className="glass-card"
              style={{
                padding: "16px 18px",
                cursor: "pointer",
                textAlign: "left",
                border: isActive
                  ? `2px solid ${def.color}`
                  : "1px solid var(--border-default)",
                background: isActive ? def.bg : "var(--bg-card)",
                transition: "all 0.2s",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                <Icon size={18} color={def.color} />
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    color: isActive
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                  }}
                >
                  {def.name}
                </span>
              </div>
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  margin: 0,
                }}
              >
                {def.tone}
              </p>
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: showPreview ? "1fr 1fr" : "1fr",
          gap: 16,
          transition: "all 0.3s",
        }}
      >
        {/* ── Editor ──────────────────────────────────────────────── */}
        <div className="glass-card" style={{ overflow: "hidden" }}>
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid var(--border-default)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <ActiveIcon size={16} color={activeDef.color} />
              <span
                style={{
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  color: "var(--text-primary)",
                }}
              >
                Edit Template
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn-ghost"
                onClick={() => setShowPreview(!showPreview)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Eye size={14} />
                {showPreview ? "Hide" : "Preview"}
              </button>
              <button
                className="btn-ghost"
                onClick={handleReset}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <RotateCcw size={14} />
                Reset
              </button>
              <button
                className="btn-primary"
                onClick={handleSave}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {saved ? (
                  <>
                    <CheckCircle2 size={14} />
                    Saved!
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    Save All
                  </>
                )}
              </button>
            </div>
          </div>

          <div style={{ padding: 20 }}>
            {/* Variable hints */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 14,
              }}
            >
              {VARIABLES.map((v) => (
                <span
                  key={v.name}
                  className="badge badge-blue"
                  title={v.desc}
                  style={{ cursor: "help" }}
                >
                  {v.name}
                </span>
              ))}
            </div>

            <textarea
              id={`template-editor-${activeId}`}
              value={templates[activeId] || ""}
              onChange={(e) =>
                setTemplates((prev) => ({
                  ...prev,
                  [activeId]: e.target.value,
                }))
              }
              className="input-field"
              rows={14}
              style={{
                resize: "vertical",
                fontFamily: "'Inter', sans-serif",
                lineHeight: 1.7,
              }}
            />
          </div>
        </div>

        {/* ── Preview ─────────────────────────────────────────────── */}
        {showPreview && (
          <div
            className="glass-card animate-fade-in"
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid var(--border-default)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Eye size={16} color="var(--accent-primary)" />
              <span
                style={{
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  color: "var(--text-primary)",
                }}
              >
                Live Preview
              </span>
              <span
                style={{
                  fontSize: "0.7rem",
                  color: "var(--text-muted)",
                  marginLeft: "auto",
                }}
              >
                Sample data
              </span>
            </div>

            <div
              style={{
                padding: 20,
                whiteSpace: "pre-wrap",
                fontSize: "0.85rem",
                lineHeight: 1.7,
                color: "var(--text-primary)",
                background: "var(--bg-elevated)",
                margin: 12,
                borderRadius: "var(--radius-md)",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {previewText(templates[activeId] || "")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
