import type { Metadata } from "next";
import Link from "next/link";
import { DRILL_TOPICS } from "@/lib/drill/registry";

export const metadata: Metadata = {
  title: "Drill · жаттығу тақырыптары (labs)",
};

export default function DrillTopicsPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fb] px-6 py-10 text-[#1a1a2e]">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-bold">Drill · жаттығу тақырыптары</h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Шексіз генерацияланатын жаттығу есептері (labs preview).
        </p>

        <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {DRILL_TOPICS.map((topic) => (
            <Link
              key={topic.id}
              href={`/labs/drill/${topic.id}`}
              className="rounded-xl border-[1.5px] border-[#d8dde5] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[#2563eb] hover:shadow-[0_4px_12px_rgba(37,99,235,0.12)]"
            >
              <div className="text-[15px] font-bold">{topic.title.kz}</div>
              <div className="mt-0.5 text-xs text-[#6b7280]">
                {topic.subtitle.kz}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
