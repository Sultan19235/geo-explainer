import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  teacherHasGradeAccess,
  type TeacherAccessRow,
} from "@/lib/teacher-access";

// Gate 1: decides who may SEE a teacher quiz console (teacher.html).
//
// This is access control, not the money gate — a saved copy of the served HTML
// bypasses this entirely. The Hetzner backend's signed-token check (a later
// phase) is what actually protects starting a paid session. Here we only
// enforce: logged in + entitled to the topic's grade, and we stamp the file
// with the teacher's email so a leaked copy is traceable.

const BUCKET = "lessons";
// Signed URL only needs to live long enough for this request to fetch it.
const SIGNED_URL_EXPIRES_IN = 60;

type TopicRow = {
  grade_id: number;
  is_published: boolean;
  quiz_teacher_html_path: string | null;
};

function sanitizeSlug(raw: string): string {
  // Blocks path traversal and anything that isn't a clean slug char.
  return raw.replace(/[^a-z0-9-]/gi, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function injectWatermark(html: string, email: string): string {
  const safe = escapeHtml(email);
  // Fixed, low-opacity, click-through overlay pinned bottom-right. Identifies
  // the teacher this copy was served to without blocking the quiz UI.
  const overlay = `<div style="position:fixed;bottom:8px;right:10px;z-index:2147483647;pointer-events:none;font:600 11px/1.4 ui-monospace,monospace;color:rgba(0,0,0,0.28);background:rgba(255,255,255,0.35);padding:2px 6px;border-radius:4px;">${safe}</div>`;
  if (html.includes("</body>")) {
    return html.replace("</body>", `${overlay}</body>`);
  }
  return `${html}${overlay}`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug: rawSlug } = await params;
  const slug = sanitizeSlug(rawSlug);
  if (!slug) {
    // Nothing left after sanitizing — treat as not found.
    return new Response("Not found.", { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: topic } = await supabase
    .from("topics")
    .select("grade_id, is_published, quiz_teacher_html_path")
    .eq("slug", slug)
    .maybeSingle<TopicRow>();

  if (!topic || !topic.is_published) {
    return new Response("Not found.", { status: 404 });
  }

  const { data: teacher } = await supabase
    .from("teachers")
    .select("granted_grades, access_expires_at")
    .eq("id", user.id)
    .maybeSingle<TeacherAccessRow>();

  if (!teacherHasGradeAccess(teacher, topic.grade_id)) {
    redirect(`/grades/${topic.grade_id}?access=required`);
  }

  if (!topic.quiz_teacher_html_path) {
    // Entitled, but no quiz file has been attached to this topic yet.
    return new Response("Quiz is not available for this topic yet.", {
      status: 404,
    });
  }

  // Stream the file from private Storage via a short-lived signed URL. Admin
  // client is used only to mint the signed URL; the entitlement check above is
  // what authorizes reaching this point.
  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(topic.quiz_teacher_html_path, SIGNED_URL_EXPIRES_IN);

  if (signError || !signed?.signedUrl) {
    return new Response("Quiz file is unavailable.", { status: 502 });
  }

  const fileResponse = await fetch(signed.signedUrl, { cache: "no-store" });
  if (!fileResponse.ok) {
    return new Response("Quiz file is unavailable.", {
      status: fileResponse.status,
    });
  }

  const html = await fileResponse.text();
  const watermarked = injectWatermark(html, user.email ?? "");

  return new Response(watermarked, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
