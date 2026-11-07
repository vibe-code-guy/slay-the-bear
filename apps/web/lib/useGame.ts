"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { explain, type Action, type ActionResult, type Backend, type Snapshot } from "./types";

export type Mode = "live" | "sim";

export interface Toast {
  id: number;
  kind: "ok" | "error" | "info";
  text: string;
  txHash?: string;
}

export function useGame(mode: Mode) {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [offset, setOffset] = useState(0);
  const [, setTick] = useState(0);
  const nextId = useRef(1);
  const backendRef = useRef<Backend | null>(null);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = nextId.current++;
    setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.kind === "error" ? 9000 : 6000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBackend(null);
    setSnap(null);
    setLoadError(null);
    (async () => {
      try {
        const b = mode === "live" ? await (await import("./live")).createLiveBackend() : (await import("./sim")).createSimBackend();
        if (!cancelled) {
          backendRef.current = b;
          setBackend(b);
        }
      } catch (e) {
        if (!cancelled) setLoadError(String((e as Error).message ?? e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const refresh = useCallback(async () => {
    const b = backendRef.current;
    if (!b) return;
    try {
      const s = await b.snapshot();
      if (backendRef.current !== b) return;
      setSnap(s);
      setOffset(s.nowMs - Date.now());
      setLoadError(null);
    } catch (e) {
      setLoadError(String((e as Error).message ?? e));
    }
  }, []);

  useEffect(() => {
    if (!backend) return;
    void refresh();
    const t = setInterval(() => void refresh(), backend.mode === "sim" ? 1000 : 4000);
    return () => clearInterval(t);
  }, [backend, refresh]);

  // In live mode, an open page also wakes the keeper and the villagers (throttled server-side).
  useEffect(() => {
    if (!backend || backend.mode !== "live") return;
    const wake = () => {
      if (document.visibilityState === "visible") void fetch("/api/tick", { method: "POST" }).catch(() => undefined);
    };
    wake();
    const t = setInterval(wake, 20_000);
    return () => clearInterval(t);
  }, [backend]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const act = useCallback(
    async (a: Action, label: string, success?: string): Promise<ActionResult> => {
      const b = backendRef.current;
      if (!b) return { ok: false };
      setPending(label);
      try {
        const res = await b.act(a);
        if (res.ok) toast({ kind: "ok", text: success ?? `${label}: done`, txHash: res.txHash });
        else toast({ kind: "error", text: explain(res.error), txHash: res.txHash });
        await refresh();
        return res;
      } catch (e) {
        toast({ kind: "error", text: String((e as Error).message ?? e) });
        return { ok: false };
      } finally {
        setPending(null);
      }
    },
    [refresh, toast],
  );

  const join = useCallback(async () => {
    const b = backendRef.current;
    if (!b) return;
    setPending("Joining the town");
    try {
      const res = await b.join();
      if (res.ok) toast({ kind: "ok", text: "Welcome to town! Your starter pouch holds 1,000 $SLAY.", txHash: res.txHash });
      else toast({ kind: "error", text: explain(res.error) });
      await refresh();
    } catch (e) {
      toast({ kind: "error", text: String((e as Error).message ?? e) });
    } finally {
      setPending(null);
    }
  }, [refresh, toast]);

  const skip = useCallback(
    (seconds: number) => {
      backendRef.current?.skip?.(seconds);
      void refresh();
    },
    [refresh],
  );

  return { backend, snap, now: Date.now() + offset, act, join, skip, pending, toasts, loadError, refresh };
}
