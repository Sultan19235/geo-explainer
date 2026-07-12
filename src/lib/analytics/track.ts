// SERVER-ONLY analytics writes. Every function here is best-effort and wrapped
// so that a failure NEVER breaks the user-facing flow it's attached to (auth,
// page render, heartbeat). All writes go through the service-role admin client,
// which bypasses RLS — do not import this from a Client Component.
//
// A login mints an opaque session id into an httpOnly cookie; heartbeats,
// logout, and page-view events read that cookie to attach to the right session.

import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestInfo } from "./request-info";

export const SESSION_COOKIE = "geo_ls";
const SESSION_MAX_AGE = 60 * 60 * 12; // 12h — matches a realistic working day.

// "resumed" = a session re-minted by the heartbeat after the previous tracking
// cookie aged out (Supabase auth outlives the 12h analytics cookie).
export type LoginMethod = "password" | "oauth" | "signup" | "resumed";
export type ActivityType = "view_grade" | "view_lesson" | "open_quiz";

// Creates a login_sessions row, stores its id in an httpOnly cookie, and
// returns the id (or null on failure). Safe to await in an auth flow.
export async function startLoginSession(
  userId: string,
  method: LoginMethod,
): Promise<string | null> {
  try {
    const info = await getRequestInfo();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("login_sessions")
      .insert({
        user_id: userId,
        login_method: method,
        ip: info.ip,
        user_agent: info.userAgent,
        browser: info.browser,
        os: info.os,
        device_type: info.deviceType,
      })
      .select("id")
      .single();

    if (error || !data) return null;

    const store = await cookies();
    store.set(SESSION_COOKIE, data.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return data.id;
  } catch {
    return null;
  }
}

export async function getSessionId(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(SESSION_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

// Marks the current session ended and clears the cookie. Called from explicit
// logout; sessions that just close the tab are inferred from last_seen_at.
export async function endLoginSession(reason = "logout"): Promise<void> {
  try {
    const store = await cookies();
    const id = store.get(SESSION_COOKIE)?.value;
    store.delete(SESSION_COOKIE);
    if (!id) return;

    const now = new Date().toISOString();
    const admin = createAdminClient();
    await admin
      .from("login_sessions")
      .update({ ended_at: now, last_seen_at: now, end_reason: reason })
      .eq("id", id)
      .is("ended_at", null);
  } catch {
    // ignore — logout must still proceed
  }
}

// Heartbeat write: bumps last_seen_at and, if provided and not yet stored,
// records the client device fingerprint. Called from the heartbeat route.
// Returns false when no live session matched the cookie (missing, expired, or
// already ended) — the route then re-mints a session so "last activity" keeps
// tracking users whose Supabase auth outlives the 12h analytics cookie.
export async function touchSession(
  fingerprint?: string | null,
): Promise<boolean> {
  try {
    const id = await getSessionId();
    if (!id) return false;

    const admin = createAdminClient();
    // Live sessions only: a stale or replayed cookie must not resurrect a
    // session that already ended.
    const { data, error } = await admin
      .from("login_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", id)
      .is("ended_at", null)
      .select("id");
    if (error || !data || data.length === 0) return false;

    // Fingerprint is write-once: the first device to report one wins, so a
    // later heartbeat (or a forged request) can't rewrite the recorded device
    // hash and mask account sharing.
    if (fingerprint) {
      await admin
        .from("login_sessions")
        .update({ fingerprint })
        .eq("id", id)
        .is("ended_at", null)
        .is("fingerprint", null);
    }
    return true;
  } catch {
    return false;
  }
}

// True when the current request is a Link prefetch (viewport/hover) rather
// than a real navigation. Prefetches render the same server components, so
// pages must check this DURING render — request header APIs are not reliably
// available inside after() callbacks — and skip scheduling activity logging.
export async function isPrefetchRequest(): Promise<boolean> {
  try {
    const h = await headers();
    if (h.has("next-router-prefetch")) return true;
    const purpose = h.get("purpose") ?? h.get("sec-purpose") ?? "";
    return purpose.toLowerCase().includes("prefetch");
  } catch {
    return false;
  }
}

// Records a content-usage event tied to the current session. Used in Phase 2 by
// the grade/lesson/quiz server components. Fire-and-forget.
export async function logActivity(
  userId: string,
  type: ActivityType,
  ctx: {
    gradeId?: number | null;
    topicId?: string | null;
    quizId?: string | null;
    path?: string | null;
  } = {},
): Promise<void> {
  try {
    const sessionId = await getSessionId();
    const admin = createAdminClient();

    const gradeId = ctx.gradeId ?? null;
    const topicId = ctx.topicId ?? null;
    const quizId = ctx.quizId ?? null;

    // Dedup safety net: prefetch and RSC double-fetch both render a page twice
    // within seconds, which would log the same event twice. Skip the insert if
    // an identical event (same user, type, target) landed in the last 45s. The
    // target is matched in the query itself — a quizzes page logs a dozen
    // open_quiz events at once, so a "recent N rows" scan could miss the one
    // that matters. A failed lookup falls through to inserting — logging stays
    // best-effort.
    const since = new Date(Date.now() - 45_000).toISOString();
    let dupQuery = admin
      .from("activity_events")
      .select("id")
      .eq("user_id", userId)
      .eq("type", type)
      .gte("occurred_at", since)
      .limit(1);
    dupQuery =
      gradeId === null
        ? dupQuery.is("grade_id", null)
        : dupQuery.eq("grade_id", gradeId);
    dupQuery =
      topicId === null
        ? dupQuery.is("topic_id", null)
        : dupQuery.eq("topic_id", topicId);
    dupQuery =
      quizId === null
        ? dupQuery.is("quiz_id", null)
        : dupQuery.eq("quiz_id", quizId);
    const { data: dup } = await dupQuery;
    if (dup && dup.length > 0) return;

    await admin.from("activity_events").insert({
      user_id: userId,
      session_id: sessionId,
      type,
      grade_id: gradeId,
      topic_id: topicId,
      quiz_id: quizId,
      path: ctx.path ?? null,
    });
  } catch {
    // ignore
  }
}
