"use client";
import { useEffect, useState, createContext, useContext, useCallback } from "react";

export type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    addToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((message: string, type: ToastType = "info") => {
        const id = Math.random().toString(36).slice(2);
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    }, []);

    const COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
        success: { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.35)", icon: "✅" },
        error: { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.35)", icon: "❌" },
        warning: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)", icon: "⚠️" },
        info: { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.35)", icon: "ℹ️" },
    };

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div
                style={{
                    position: "fixed",
                    bottom: "24px",
                    right: "24px",
                    zIndex: 9999,
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    maxWidth: "380px",
                    pointerEvents: "none",
                }}
            >
                {toasts.map((t) => {
                    const c = COLORS[t.type];
                    return (
                        <div
                            key={t.id}
                            style={{
                                background: c.bg,
                                border: `1px solid ${c.border}`,
                                backdropFilter: "blur(12px)",
                                borderRadius: "10px",
                                padding: "12px 16px",
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "10px",
                                fontSize: "13.5px",
                                color: "var(--text-primary)",
                                boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                                animation: "toastIn 0.3s ease",
                                pointerEvents: "all",
                            }}
                        >
                            <span style={{ fontSize: "16px", flexShrink: 0 }}>{c.icon}</span>
                            <span style={{ lineHeight: 1.4 }}>{t.message}</span>
                        </div>
                    );
                })}
            </div>
            <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be inside ToastProvider");
    return ctx;
}
