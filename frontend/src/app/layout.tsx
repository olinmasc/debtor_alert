import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Debtor Alert — Outstanding Receivables Dashboard",
  description:
    "Internal tool to manage outstanding receivables from Tally, track overdue invoices, and send WhatsApp reminders to debtors.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
