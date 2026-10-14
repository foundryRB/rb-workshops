/**
 * The capture bridge (ADR-007): the run console owns the renderer's storage slot, per run.
 *
 * Seed the slot from this run's server-side capture exactly once per mount
 * before the iframe boots; land every subsequent renderer write as it happens
 * (a same-origin iframe's setItem fires a storage event at this window);
 * keep a low-frequency interval and a landing at the close as a safety net;
 * take a tab-scoped, leased ownership token so a second live mount of the
 * same revision in the same browser is refused; clear the slot on leave.
 */
import { captureKey, type SlotMeta } from "./captureKey";
import type { Capture } from "../types";

export const LEASE_MS = 15_000;
export const HEARTBEAT_MS = 5_000;
export const SAFETY_NET_MS = 20_000;

export interface Lease {
  token: string;
  expires: number;
  run: string;
}

export function leaseKey(slot: string): string {
  return "ws-lease-" + slot;
}

function readLease(slot: string): Lease | null {
  try {
    const raw = localStorage.getItem(leaseKey(slot));
    return raw ? (JSON.parse(raw) as Lease) : null;
  } catch {
    return null;
  }
}

function myToken(slot: string): string {
  const key = leaseKey(slot);
  let token = sessionStorage.getItem(key);
  if (!token) {
    token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(key, token);
  }
  return token;
}

export interface Bridge {
  slot: string;
  owner: boolean;
  refusal: string | null;
  release: () => void;
  landNow: () => Promise<void>;
  current: () => Capture;
}

export function mountBridge(
  meta: SlotMeta,
  runId: string,
  serverCapture: Capture,
  land: (capture: Capture) => Promise<void>,
  onLanded?: (capture: Capture) => void,
): Bridge {
  const slot = captureKey(meta);
  const token = myToken(slot);
  const now = Date.now();
  const existing = readLease(slot);
  if (existing && existing.expires > now && existing.token !== token) {
    return {
      slot,
      owner: false,
      refusal: `This revision is already open in another tab of this browser (run ${existing.run}). Close it there to run it here.`,
      release: () => undefined,
      landNow: async () => undefined,
      current: () => ({}),
    };
  }
  const writeLease = () => localStorage.setItem(leaseKey(slot), JSON.stringify({ token, expires: Date.now() + LEASE_MS, run: runId }));
  writeLease();
  // Seed: exactly once per mount, before the iframe boots.
  localStorage.setItem(slot, JSON.stringify(serverCapture || {}));

  let landed = JSON.stringify(serverCapture || {});
  let inflight: Promise<void> | null = null;
  let dirty = false;

  const current = (): Capture => {
    try {
      return JSON.parse(localStorage.getItem(slot) || "{}") as Capture;
    } catch {
      return {};
    }
  };

  const flush = async (): Promise<void> => {
    if (inflight) {
      dirty = true;
      return inflight;
    }
    const raw = localStorage.getItem(slot) || "{}";
    if (raw === landed) return;
    const snapshot = raw;
    inflight = land(JSON.parse(snapshot) as Capture)
      .then(() => {
        landed = snapshot;
        onLanded?.(JSON.parse(snapshot) as Capture);
      })
      .finally(() => {
        inflight = null;
        if (dirty) {
          dirty = false;
          void flush();
        }
      });
    return inflight;
  };

  const onStorage = (event: StorageEvent) => {
    if (event.storageArea === localStorage && event.key === slot) void flush();
  };
  window.addEventListener("storage", onStorage);
  const heartbeat = window.setInterval(writeLease, HEARTBEAT_MS);
  const safetyNet = window.setInterval(() => void flush(), SAFETY_NET_MS);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    window.removeEventListener("storage", onStorage);
    window.clearInterval(heartbeat);
    window.clearInterval(safetyNet);
    const lease = readLease(slot);
    if (!lease || lease.token === token) {
      localStorage.removeItem(slot);
      localStorage.removeItem(leaseKey(slot));
    }
  };
  return { slot, owner: true, refusal: null, release, landNow: flush, current };
}
