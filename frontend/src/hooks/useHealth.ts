"use client";
import { useState, useEffect, useCallback } from "react";
import { api, HealthStatus } from "@/lib/api";

export function useHealth(intervalMs = 15000) {
    const [health, setHealth] = useState<HealthStatus | null>(null);
    const [online, setOnline] = useState<boolean | null>(null);
    const [lastChecked, setLastChecked] = useState<Date | null>(null);

    const check = useCallback(async () => {
        try {
            const h = await api.getHealth();
            setHealth(h);
            setOnline(h.status === "ok");
        } catch {
            setOnline(false);
            setHealth(null);
        } finally {
            setLastChecked(new Date());
        }
    }, []);

    useEffect(() => {
        check();
        const interval = setInterval(check, intervalMs);
        return () => clearInterval(interval);
    }, [check, intervalMs]);

    return { health, online, lastChecked };
}

/** Formats "X seconds ago" / "X minutes ago" */
export function timeAgo(date: Date | null): string {
    if (!date) return "—";
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 5) return "just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    return `${Math.floor(diffMin / 60)}h ago`;
}
