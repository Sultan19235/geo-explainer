import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Lesson player · тақырыптар (labs)",
};

export const dynamic = "force-dynamic";

type TopicRow = {
  slug: string;
  title_kz: string;
  title_ru: string | null;
  subtitle_kz: string | null;
};

export default async function LessonTopicsPage() {
  let topics: TopicRow[] = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("lesson_topics")
      .select("slug, title_kz, title_ru, subtitle_kz")
      .eq("published", true)
      .order("order_index", { ascending: true });
    topics = (data as TopicRow[] | null) ?? [];
  } catch {
    // Table may not exist yet — the demo topic still works.
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] px-6 py-10 text-[#1a1a2e]">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-bold">Lesson player · тақырыптар</h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Жаңа сабақ ойнатқышының тақырыптары (labs).
        </p>

        <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          <Link
            href="/labs/lesson/cylinder"
            className="rounded-xl border-[1.5px] border-[#d8dde5] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[#2563eb] hover:shadow-[0_4px_12px_rgba(37,99,235,0.12)]"
          >
            <div className="text-[15px] font-bold">Цилиндр</div>
            <div className="mt-0.5 text-xs text-[#6b7280]">
              11-сынып · Стереометрия · демо (native pack)
            </div>
          </Link>

          {topics.map((topic) => (
            <Link
              key={topic.slug}
              href={`/labs/lesson/${topic.slug}`}
              className="rounded-xl border-[1.5px] border-[#d8dde5] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[#2563eb] hover:shadow-[0_4px_12px_rgba(37,99,235,0.12)]"
            >
              <div className="text-[15px] font-bold">{topic.title_kz}</div>
              {topic.subtitle_kz && (
                <div className="mt-0.5 text-xs text-[#6b7280]">
                  {topic.subtitle_kz}
                </div>
              )}
            </Link>
          ))}

          <Link
            href="/labs/present"
            className="rounded-xl border-[1.5px] border-dashed border-[#d8dde5] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[#2563eb] hover:shadow-[0_4px_12px_rgba(37,99,235,0.12)]"
          >
            <div className="text-[15px] font-bold">Презентациялар</div>
            <div className="mt-0.5 text-xs text-[#6b7280]">
              Сынып презентациялары — тақта режимі (labs)
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
