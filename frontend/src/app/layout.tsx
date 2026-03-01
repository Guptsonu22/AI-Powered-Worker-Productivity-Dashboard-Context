import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "AI Productivity Dashboard | Factory Intelligence",
  description:
    "Real-time AI-powered worker and workstation productivity monitoring system for smart manufacturing.",
  keywords: "productivity dashboard, factory monitoring, AI CCTV, worker metrics, manufacturing analytics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
