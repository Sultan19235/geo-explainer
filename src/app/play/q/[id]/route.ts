import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// PUBLIC student quiz page. Students open this by QR on their phones with no
// account — there is intentionally no auth here.
//
// Why a route instead of the raw Supabase public URL: Supabase's public Storage
// endpoint serves stored .html as text/plain, so phones show raw source. We
// fetch the file and return it with Content-Type: text/html so it renders.
//
// The student HTML reads ?code= and ?sec= from location.search; those stay on
// the browser URL (/play/q/<id>?code=...), so no query forwarding is needed.

const STUDENT_BUCKET = "quizzes-public";

// Quiz ids are UUIDs; anything else 404s before touching the database.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return new Response("Not found.", { status: 404 });
  }

  const admin = createAdminClient();

  const { data: quiz } = await admin
    .from("quizzes")
    .select("student_html_path, is_ready")
    .eq("id", id)
    .maybeSingle<{ student_html_path: string | null; is_ready: boolean }>();

  if (!quiz || !quiz.is_ready || !quiz.student_html_path) {
    return new Response("Not found.", { status: 404 });
  }

  // Download straight from Storage instead of re-fetching our own public URL:
  // one hop fewer, and it keeps working even if the bucket goes private.
  const { data: file, error: downloadError } = await admin.storage
    .from(STUDENT_BUCKET)
    .download(quiz.student_html_path);

  if (downloadError || !file) {
    return new Response("Student page is unavailable.", { status: 404 });
  }

  const html = await file.text();

  return new Response(html, {
    status: 200,
    headers: {
      // Public and cacheable briefly; students may reload during a session.
      "Cache-Control": "public, max-age=60",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
