import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  readPresentIndex,
  type PresentIndexEntry,
} from "@/lib/present/index-store";

export const metadata: Metadata = {
  title: "Презентациялар (labs)",
};

export const dynamic = "force-dynamic";

export default async function PresentHubPage() {
  let entries: PresentIndexEntry[] = [];
  try {
    const admin = createAdminClient();
    entries = await readPresentIndex(admin);
  } catch {
    // Storage unreachable — the demo and the previewer still work.
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] px-6 py-10 text-[#1a1a2e]">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-bold">Презентациялар</h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Сынып презентациялары — мұғалім тақтада көрсетеді (labs).
        </p>

        <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {entries.map((entry) => (
            <Link
              key={entry.id}
              href={`/labs/present/${entry.id}`}
              className="rounded-xl border-[1.5px] border-[#d8dde5] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[#2563eb] hover:shadow-[0_4px_12px_rgba(37,99,235,0.12)]"
            >
              <div className="text-[15px] font-bold">{entry.title.kz}</div>
              <div className="mt-0.5 text-xs text-[#6b7280]">
                {entry.subtitle?.kz ? `${entry.subtitle.kz} · ` : ""}
                {entry.slides} слайд
              </div>
            </Link>
          ))}

          {entries.length === 0 && (
            <Link
              href="/labs/present/demo"
              className="rounded-xl border-[1.5px] border-[#d8dde5] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[#2563eb] hover:shadow-[0_4px_12px_rgba(37,99,235,0.12)]"
            >
              <div className="text-[15px] font-bold">
                Натурал сандар және нөл
              </div>
              <div className="mt-0.5 text-xs text-[#6b7280]">
                5-сынып · I тарау · 1.1 · демо
              </div>
            </Link>
          )}

          <Link
            href="/labs/present/file"
            className="rounded-xl border-[1.5px] border-dashed border-[#d8dde5] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[#2563eb] hover:shadow-[0_4px_12px_rgba(37,99,235,0.12)]"
          >
            <div className="text-[15px] font-bold">Файл previewer</div>
            <div className="mt-0.5 text-xs text-[#6b7280]">
              .js файлын тексеру · PRESENTATION_FORMAT.md
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
