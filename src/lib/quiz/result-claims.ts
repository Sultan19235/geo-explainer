"use client";

// Cross-tab registry of room codes whose results were already saved to the
// teacher's profile. quiz_results inserts have no server-side dedup, and a
// room can reach the results screen in more than one place (a reload resumed
// via the recovery banner, a second console tab on the same quiz) — the
// registry lets every autosave instance check "someone already saved this
// room" through localStorage before inserting.
//
// Claims are recorded AFTER a successful insert (not before): a duplicate row
// on a photo-finish race is recoverable (deletable in the history UI), a
// silently skipped save is not.

const STORAGE_KEY = "msq-results-saved";
// Rooms die on the server ~4h after creation; anything older can never be
// offered for resume again, so claims stop mattering after that.
const CLAIM_TTL_MS = 6 * 60 * 60 * 1000;

function readClaims(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return data as Record<string, number>;
  } catch {
    return {};
  }
}

export function isRoomResultSaved(code: string): boolean {
  const at = readClaims()[code];
  return typeof at === "number" && Date.now() - at < CLAIM_TTL_MS;
}

export function markRoomResultSaved(code: string): void {
  try {
    const now = Date.now();
    const claims = readClaims();
    for (const [key, at] of Object.entries(claims)) {
      if (typeof at !== "number" || now - at >= CLAIM_TTL_MS) delete claims[key];
    }
    claims[code] = now;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(claims));
  } catch {
    // storage blocked — worst case a duplicate row, never a lost save
  }
}
