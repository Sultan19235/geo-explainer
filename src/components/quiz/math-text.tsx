"use client";

// Renders pack text with KaTeX math: "Жақшаны аш: $-3(x-6)$" — inline $...$
// and display $$...$$ segments become typeset math, the rest stays plain text.

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";

const MATH_RE = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMixed(source: string): string {
  let html = "";
  let last = 0;
  for (const match of source.matchAll(MATH_RE)) {
    html += escapeHtml(source.slice(last, match.index));
    const [, display, inline] = match;
    html += katex.renderToString(display ?? inline ?? "", {
      throwOnError: false,
      displayMode: display !== undefined,
    });
    last = match.index + match[0].length;
  }
  html += escapeHtml(source.slice(last));
  return html;
}

export function MathText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const html = useMemo(() => renderMixed(text), [text]);
  return (
    <span
      className={cn("[&_.katex]:text-[1.06em]", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
