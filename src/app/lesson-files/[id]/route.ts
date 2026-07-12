import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  hasGradeAccess,
  loadTeacherAccess,
  type TeacherAccess,
} from "@/lib/teacher-access";

// Serves an uploaded lesson content file (.js) same-origin. Same reasoning
// as /play/q/[id]: Supabase Storage's public endpoint serves the wrong
// content type, and the lesson runtime needs same-origin scripts anyway.
// Published items in an UNLINKED lesson topic are public (the /labs pilot);
// once the lesson topic is linked to a catalog topic, files inherit the
// topic's access gate (free sample, or a teacher with the grade granted).
// Drafts are only served to a signed-in admin previewing their work.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BUCKET = "lessons";

type Viewer = {
  isAdmin: boolean;
  access: TeacherAccess | null;
};

async function getViewer(): Promise<Viewer> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { isAdmin: false, access: null };
    const access = await loadTeacherAccess(supabase, user.id);
    return { isAdmin: !!access?.isAdmin, access };
  } catch {
    return { isAdmin: false, access: null };
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return new Response("Not found.", { status: 404 });
  }

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("lesson_items")
    .select("topic_id, storage_path, published, updated_at")
    .eq("id", id)
    .maybeSingle<{
      topic_id: string;
      storage_path: string;
      published: boolean;
      updated_at: string;
    }>();

  if (!item) {
    return new Response("Not found.", { status: 404 });
  }

  // A query error here (e.g. a database without the linking migration yet)
  // degrades to "unlinked", i.e. the original public behavior.
  const { data: catalogTopic } = await admin
    .from("topics")
    .select("grade_id, is_published, is_free_sample")
    .eq("lesson_topic_id", item.topic_id)
    .maybeSingle<{
      grade_id: number;
      is_published: boolean;
      is_free_sample: boolean;
    }>();

  const gated = !!catalogTopic;
  if (!item.published || gated) {
    const viewer = await getViewer();
    if (!item.published && !viewer.isAdmin) {
      return new Response("Not found.", { status: 404 });
    }
    if (catalogTopic && !viewer.isAdmin) {
      const allowed =
        catalogTopic.is_published &&
        (catalogTopic.is_free_sample ||
          hasGradeAccess(viewer.access, catalogTopic.grade_id));
      if (!allowed) {
        return new Response("Not found.", { status: 404 });
      }
    }
  }

  const { data: file, error } = await admin.storage
    .from(BUCKET)
    .download(item.storage_path);
  if (error || !file) {
    return new Response("Lesson file is unavailable.", { status: 404 });
  }

  // The lesson page appends ?v=<updated_at> to every file URL, so a
  // versioned response can be cached forever — re-uploads change the URL.
  // Unversioned requests keep the short cache as before. Gated content is
  // `private`: the requester's browser may cache it, shared caches may not.
  const versioned = request.nextUrl.searchParams.has("v");
  const visibility = gated ? "private" : "public";
  return new Response(await file.text(), {
    status: 200,
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": versioned
        ? `${visibility}, max-age=31536000, immutable`
        : `${visibility}, max-age=120`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
