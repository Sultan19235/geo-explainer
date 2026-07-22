"use client";

// Admin publisher for presentation files. Validation runs HERE, in the
// browser (the same evaluator the previewer and the player use); the server
// action only stores what already validated — it never executes uploaded
// code. Files with errors stay in the list with readable English lines the
// author can paste into an AI chat, exactly like the drill/pack flows.

import { useState } from "react";
import Link from "next/link";
import {
  ExternalLinkIcon,
  FileCode2Icon,
  Loader2Icon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { evaluatePresentationCode } from "@/lib/present/schema";
import { RESERVED_PRESENT_IDS } from "@/lib/present/index-store";
import type { PresentIndexEntry } from "@/lib/present/index-store";
import { cn } from "@/lib/utils";
import {
  deletePresentationAction,
  uploadPresentationsAction,
  type PresentUploadMeta,
  type PresentUploadResult,
} from "./actions";

type PendingFile =
  | { name: string; ok: true; text: string; meta: PresentUploadMeta }
  | { name: string; ok: false; errors: string[] };

function toText(value: string | { kz: string; ru?: string } | undefined): {
  kz: string;
  ru?: string;
} {
  if (value === undefined) return { kz: "" };
  if (typeof value === "string") return { kz: value };
  return value;
}

export function PresentationsAdminClient({
  entries,
}: {
  entries: PresentIndexEntry[];
}) {
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [results, setResults] = useState<PresentUploadResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  /**
   * Standalone HTML deck (present-html build output): no evaluator — pull
   * meta straight out of the markup. id comes from Deck.boot({id}), title
   * from <title>, slide count from registerSlide occurrences.
   */
  const parseHtmlDeck = (
    name: string,
    text: string,
  ): { ok: true; meta: PresentUploadMeta } | { ok: false; errors: string[] } => {
    if (!/<!doctype html|<html[\s>]/i.test(text)) {
      return { ok: false, errors: ["Not an HTML document (no doctype/<html>)."] };
    }
    const idMatch = text.match(/Deck\.boot\(\s*\{\s*id:\s*"([^"]+)"/);
    const fallbackId = name
      .replace(/\.html?$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    const id = idMatch?.[1] ?? fallbackId;
    if (!/^[a-z0-9][a-z0-9.-]{1,39}$/.test(id)) {
      return {
        ok: false,
        errors: [`Cannot derive a valid id (got "${id}") — check Deck.boot({id}) or the filename.`],
      };
    }
    const title =
      text.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? id;
    const slides = (text.match(/registerSlide\(/g) ?? []).length || 1;
    return {
      ok: true,
      meta: { id, titleKz: title, slides, format: "html" },
    };
  };

  const onFiles = async (list: FileList | null) => {
    if (!list) return;
    setResults([]);
    const next: PendingFile[] = [];
    const seen = new Set<string>();
    for (const file of Array.from(list)) {
      const text = await file.text();
      if (/\.html?$/i.test(file.name)) {
        const parsed = parseHtmlDeck(file.name, text);
        if (!parsed.ok) {
          next.push({ name: file.name, ok: false, errors: parsed.errors });
        } else if (RESERVED_PRESENT_IDS.has(parsed.meta.id)) {
          next.push({
            name: file.name,
            ok: false,
            errors: [`id "${parsed.meta.id}" is reserved — pick another slug.`],
          });
        } else if (seen.has(parsed.meta.id)) {
          next.push({
            name: file.name,
            ok: false,
            errors: [`Duplicate id "${parsed.meta.id}" in this batch.`],
          });
        } else {
          seen.add(parsed.meta.id);
          next.push({ name: file.name, ok: true, text, meta: parsed.meta });
        }
        continue;
      }
      const result = evaluatePresentationCode(text);
      if ("errors" in result) {
        next.push({ name: file.name, ok: false, errors: result.errors });
        continue;
      }
      const presentation = result.presentation;
      if (RESERVED_PRESENT_IDS.has(presentation.id)) {
        next.push({
          name: file.name,
          ok: false,
          errors: [
            `id "${presentation.id}" is reserved (${[...RESERVED_PRESENT_IDS].join(", ")}) — pick another slug.`,
          ],
        });
        continue;
      }
      if (seen.has(presentation.id)) {
        next.push({
          name: file.name,
          ok: false,
          errors: [`Duplicate id "${presentation.id}" in this batch.`],
        });
        continue;
      }
      seen.add(presentation.id);
      const title = toText(presentation.title);
      const subtitle = presentation.subtitle
        ? toText(presentation.subtitle)
        : undefined;
      next.push({
        name: file.name,
        ok: true,
        text,
        meta: {
          id: presentation.id,
          titleKz: title.kz,
          titleRu: title.ru,
          subtitleKz: subtitle?.kz,
          subtitleRu: subtitle?.ru,
          slides: presentation.slides.length,
        },
      });
    }
    setPending(next);
  };

  const upload = async () => {
    const valid = pending.filter(
      (file): file is Extract<PendingFile, { ok: true }> => file.ok,
    );
    if (valid.length === 0) return;
    setBusy(true);
    try {
      const response = await uploadPresentationsAction({
        files: valid.map((file) => ({
          name: file.name,
          text: file.text,
          meta: file.meta,
        })),
      });
      setResults(response.results);
      // Keep only files that did NOT succeed, so retrying doesn't re-upload
      // the ones already published.
      const succeeded = new Set(
        response.results
          .filter((result) => result.ok)
          .map((result) => result.name),
      );
      setPending((prev) =>
        response.ok ? [] : prev.filter((file) => !succeeded.has(file.name)),
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(`«${id}» презентациясын өшіру керек пе?`)) return;
    setDeleting(id);
    try {
      const result = await deletePresentationAction({ id });
      if (!result.ok) {
        window.alert(`Өшіру сәтсіз: ${result.error ?? "белгісіз қате"}`);
      }
    } finally {
      setDeleting(null);
    }
  };

  const validCount = pending.filter((file) => file.ok).length;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold">Презентациялар</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Сынып презентациялары (.js / .html файлдар) · форматтар:
        docs/PRESENTATION_FORMAT.md, docs/PRESENTATION_HTML_FORMAT.md ·
        алдын ала тексеру:{" "}
        <Link href="/labs/present/file" className="underline">
          /labs/present/file
        </Link>
      </p>

      {/* Upload zone */}
      <div className="mt-6 rounded-lg border p-4">
        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold text-primary hover:bg-muted">
          <FileCode2Icon className="size-4" aria-hidden />
          .js / .html файлдарды таңдау
          <input
            type="file"
            accept=".js,.html,text/javascript,text/html"
            multiple
            className="hidden"
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        {pending.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm">
            {pending.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className={cn(
                  "rounded-md border px-3 py-2",
                  file.ok
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-red-300 bg-red-50",
                )}
              >
                <span className="font-semibold">{file.name}</span>{" "}
                {file.ok ? (
                  <span className="text-emerald-700">
                    — {file.meta.id} · {file.meta.titleKz} ·{" "}
                    {file.meta.slides} слайд
                  </span>
                ) : (
                  <div className="mt-1 space-y-0.5 font-mono text-xs text-red-700">
                    {file.errors.map((error, j) => (
                      <p key={j}>{error}</p>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {validCount > 0 && (
          <button
            type="button"
            onClick={() => void upload()}
            disabled={busy}
            className="mt-3 flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? (
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
            ) : (
              <UploadIcon className="size-4" aria-hidden />
            )}
            Жүктеу ({validCount})
          </button>
        )}

        {results.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {results.map((result, i) => (
              <li
                key={`${result.name}-${i}`}
                className={result.ok ? "text-emerald-700" : "text-red-700"}
              >
                {result.name}: {result.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Published list */}
      <div className="mt-6 rounded-lg border">
        <div className="border-b px-4 py-2 text-sm font-semibold text-muted-foreground">
          Жарияланған ({entries.length})
        </div>
        {entries.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Әзірге жоқ — жоғарыдан .js файл жүктеңіз.
          </p>
        ) : (
          <ul className="divide-y">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 px-4 py-2.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {entry.title.kz}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {entry.id} · {entry.slides} слайд · v{entry.version}
                    {entry.format === "html" ? " · html" : ""}
                  </div>
                </div>
                <Link
                  href={`/labs/present/${entry.id}`}
                  target="_blank"
                  className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold hover:bg-muted"
                >
                  <ExternalLinkIcon className="size-3.5" aria-hidden />
                  Ашу
                </Link>
                <button
                  type="button"
                  onClick={() => void remove(entry.id)}
                  disabled={deleting === entry.id}
                  className="flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {deleting === entry.id ? (
                    <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Trash2Icon className="size-3.5" aria-hidden />
                  )}
                  Өшіру
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
