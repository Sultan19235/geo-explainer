import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRESENT_BUCKET, presentFilePath } from "@/lib/present/index-store";

// Serves an uploaded presentation file same-origin (same reasoning as
// /lesson-files: Supabase Storage's endpoint serves the wrong content type,
// and the player fetches same-origin anyway). Presentations are public labs
// content by design — classroom decks of textbook material, no access gate
// until they move into the /grades catalog.
//
// Two formats live under presentations/: <id>.js (React-player decks) and
// <id>.html (standalone pages from present-html/). Links generated from the
// index carry ?f=html for the latter; bare requests fall back js → html so
// old bookmarks and hand-typed URLs keep working. Serving admin-uploaded
// HTML same-origin is the same trust model as the student quiz pages:
// only admins can upload.

const ID_RE = /^[a-z0-9][a-z0-9.-]{1,39}$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ID_RE.test(id)) {
    return new Response("Not found.", { status: 404 });
  }

  const admin = createAdminClient();
  const wantHtml = request.nextUrl.searchParams.get("f") === "html";

  let format: "js" | "html" = wantHtml ? "html" : "js";
  let { data: file, error } = await admin.storage
    .from(PRESENT_BUCKET)
    .download(presentFilePath(id, format));
  if ((error || !file) && !wantHtml) {
    // Bare URL for an html-format deck — fall back before 404ing.
    format = "html";
    ({ data: file, error } = await admin.storage
      .from(PRESENT_BUCKET)
      .download(presentFilePath(id, format)));
  }
  if (error || !file) {
    return new Response("Not found.", { status: 404 });
  }

  // The player appends ?v=<upload timestamp>, so versioned responses can be
  // cached forever; unversioned requests stay short.
  const versioned = request.nextUrl.searchParams.has("v");
  return new Response(await file.text(), {
    status: 200,
    headers: {
      "Content-Type":
        format === "html"
          ? "text/html; charset=utf-8"
          : "text/javascript; charset=utf-8",
      "Cache-Control": versioned
        ? "public, max-age=31536000, immutable"
        : "public, max-age=120",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
