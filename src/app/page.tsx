"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  Upload,
  MessageSquareText,
  Zap,
} from "lucide-react";
import DashboardTab from "./components/DashboardTab";
import ImportSyncTab from "./components/ImportSyncTab";
import TemplatesTab from "./components/TemplatesTab";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "import", label: "Import & Sync", icon: Upload },
  { id: "templates", label: "Templates", icon: MessageSquareText },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);

  /** Called after a successful upload to refresh the dashboard data */
  const triggerRefresh = () => setRefreshKey((k) => k + 1);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      <header
        style={{
          borderBottom: "1px solid var(--border-default)",
          background: "var(--bg-card)",
          position: "sticky",
          top: 0,
          zIndex: 50,
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            maxWidth: 1400,
            margin: "0 auto",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 64,
          }}
        >
          {/* Logo / Title */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "var(--radius-md)",
                background: "var(--accent-gradient)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Zap size={20} color="white" />
            </div>
            <div>
              <h1
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  lineHeight: 1.2,
                  color: "var(--text-primary)",
                  margin: 0,
                }}
              >
                Debtor Alert
              </h1>
              <p
                style={{
                  fontSize: "0.7rem",
                  color: "var(--text-muted)",
                  margin: 0,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                Outstanding Receivables
              </p>
            </div>
          </div>

          {/* Tab Navigation */}
          <nav style={{ display: "flex", gap: 4 }}>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 18px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "0.85rem",
                    fontWeight: isActive ? 600 : 500,
                    background: isActive
                      ? "rgba(99, 102, 241, 0.12)"
                      : "transparent",
                    color: isActive
                      ? "var(--accent-primary-hover)"
                      : "var(--text-secondary)",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.target as HTMLElement).style.background =
                        "var(--bg-elevated)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.target as HTMLElement).style.background =
                        "transparent";
                    }
                  }}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* ── Main Content ──────────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          maxWidth: 1400,
          margin: "0 auto",
          padding: "24px 24px 48px",
          width: "100%",
        }}
      >
        <div className="animate-fade-in" key={activeTab}>
          {activeTab === "dashboard" && (
            <DashboardTab refreshKey={refreshKey} />
          )}
          {activeTab === "import" && (
            <ImportSyncTab onUploadComplete={triggerRefresh} />
          )}
          {activeTab === "templates" && <TemplatesTab />}
        </div>
      </main>
    </div>
  );
}
