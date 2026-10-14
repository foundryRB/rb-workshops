/**
 * The capture bridge's coupling to the pinned renderer, pinned rather than hidden (ADR-007).
 *
 * The canonical template keeps its live state in localStorage under
 * "ws-" + meta.id + "-" + meta.version and exposes no channel; the run
 * console reads and seeds that slot same-origin. This derivation is asserted
 * against the template at the renderer.lock hash (INT-WORKSHOPS-029), so
 * a renderer that moves its key fails the build instead of capturing nothing.
 */
export interface SlotMeta {
  id: string;
  version: string;
}

export function captureKey(meta: SlotMeta): string {
  return "ws-" + meta.id + "-" + meta.version;
}
