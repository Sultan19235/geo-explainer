import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Serves an uploaded lesson content file (.js) same-origin. Same reasoning
// as /play/q/[id]: Supabase Storage's public endpoint serves the wrong
// content type, and the lesson runtime needs same-origin scripts anyway.
// Published items are public (pupils' browsers fetch them); drafts are only
// served to a signed-in admin previewing their work.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BUCKET = "lessons";

async function isAdminRequest(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: teacher } = await supabase
      .from("teachers")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle<{ is_admin: boolean }>();
    return !!teacher?.is_admin;
  } catch {
    return false;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return new Response("Not found.", { status: 404 });
  }

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("lesson_items")
    .select("storage_path, published, updated_at")
    .eq("id", id)
    .maybeSingle<{
      storage_path: string;
      published: boolean;
      updated_at: string;
    }>();

  if (!item) {
    return new Response("Not found.", { status: 404 });
  }
  if (!item.published && !(await isAdminRequest())) {
    return new Response("Not found.", { status: 404 });
  }

  const { data: file, error } = await admin.storage
    .from(BUCKET)
    .download(item.storage_path);
  if (error || !file) {
    return new Response("Lesson file is unavailable.", { status: 404 });
  }

  return new Response(await file.text(), {
    status: 200,
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      // Content changes only via re-upload; a short public cache keeps
      // problem switching snappy without staling edits for long.
      "Cache-Control": "public, max-age=120",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
