import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { captureKey } from "./captureKey";
import { LEASE_MS, leaseKey, mountBridge } from "./bridge";

describe("the capture bridge", () => {
  it("derives the slot key by the renderer's rule", () => {
    expect(captureKey({ id: "kickoff", version: "v1" })).toBe("ws-kickoff-v1");
  });

  it("seeds the slot once per mount, lands every write on the storage event, and clears the slot on leave", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const landed: unknown[] = [];
    const land = vi.fn(async (c: unknown) => {
      landed.push(c);
    });
    const meta = { id: "s1", version: "v1" };
    const bridge = mountBridge(meta, "r1", { A: { mark: "ok" } }, land);
    expect(bridge.owner).toBe(true);
    expect(JSON.parse(localStorage.getItem("ws-s1-v1")!)).toEqual({ A: { mark: "ok" } });
    // A same-origin iframe's setItem reaches this window as a storage event.
    localStorage.setItem("ws-s1-v1", JSON.stringify({ A: { mark: "ok" }, B: { mark: "hot" } }));
    window.dispatchEvent(new StorageEvent("storage", { key: "ws-s1-v1", storageArea: localStorage, newValue: localStorage.getItem("ws-s1-v1") }));
    await vi.waitFor(() => expect(land).toHaveBeenCalledTimes(1));
    expect(landed[0]).toEqual({ A: { mark: "ok" }, B: { mark: "hot" } });
    bridge.release();
    expect(localStorage.getItem("ws-s1-v1")).toBeNull();
    expect(localStorage.getItem(leaseKey("ws-s1-v1"))).toBeNull();
  });

  it("refuses a second live mount of the same revision from another tab", () => {
    localStorage.clear();
    sessionStorage.clear();
    const meta = { id: "s2", version: "v3" };
    const first = mountBridge(meta, "r1", {}, async () => undefined);
    expect(first.owner).toBe(true);
    // Another tab: no shared sessionStorage token, the same localStorage lease.
    sessionStorage.clear();
    const second = mountBridge(meta, "r2", { X: { mark: "ok" } }, async () => undefined);
    expect(second.owner).toBe(false);
    expect(second.refusal).toMatch(/already open/);
    // The live slot was neither seeded over nor cleared by the refused mount.
    expect(JSON.parse(localStorage.getItem("ws-s2-v3")!)).toEqual({});
    second.release();
    expect(localStorage.getItem("ws-s2-v3")).not.toBeNull();
    first.release();
  });

  it("re-enters as the same owner after a refresh, and a crashed tab frees the slot after a lease", () => {
    localStorage.clear();
    sessionStorage.clear();
    const meta = { id: "s3", version: "v1" };
    const first = mountBridge(meta, "r1", {}, async () => undefined);
    expect(first.owner).toBe(true);
    // A refresh keeps sessionStorage: the same token re-enters.
    const again = mountBridge(meta, "r1", {}, async () => undefined);
    expect(again.owner).toBe(true);
    again.release();
    // A crashed tab left its lease behind; after LEASE_MS it is free.
    localStorage.setItem(leaseKey("ws-s3-v1"), JSON.stringify({ token: "other", expires: Date.now() - 1, run: "rX" }));
    sessionStorage.clear();
    const later = mountBridge(meta, "r2", {}, async () => undefined);
    expect(later.owner).toBe(true);
    later.release();
    expect(LEASE_MS).toBeGreaterThan(0);
  });
});

describe("the brand assets", () => {
  it("serves the mark the design gate committed, byte for byte", () => {
    const here = join(__dirname, "..", "..");
    const served = readFileSync(join(here, "public", "brand", "logo-mark.svg"));
    const durable = readFileSync(join(here, "..", "docs", "src", "assets", "brand", "logo-mark.svg"));
    expect(served.equals(durable)).toBe(true);
  });
});
