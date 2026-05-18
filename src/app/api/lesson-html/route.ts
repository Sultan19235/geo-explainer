import { type NextRequest } from "next/server";

const LESSONS_SIGN_PATH = "/storage/v1/object/sign/lessons/";

function isAllowedSignedLessonUrl(url: URL) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;

  const supabaseOrigin = new URL(supabaseUrl).origin;
  return (
    url.origin === supabaseOrigin &&
    url.pathname.startsWith(LESSONS_SIGN_PATH) &&
    url.searchParams.has("token")
  );
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return new Response("Missing signed URL.", { status: 400 });
  }

  let signedUrl: URL;
  try {
    signedUrl = new URL(rawUrl);
  } catch {
    return new Response("Invalid signed URL.", { status: 400 });
  }

  if (!isAllowedSignedLessonUrl(signedUrl)) {
    return new Response("Invalid lesson URL.", { status: 400 });
  }

  const storageResponse = await fetch(signedUrl, { cache: "no-store" });
  if (!storageResponse.ok) {
    return new Response("Lesson HTML is unavailable.", {
      status: storageResponse.status,
    });
  }

  return new Response(storageResponse.body, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
