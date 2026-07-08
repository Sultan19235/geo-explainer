"use client";

// Renders a lesson file's bilingual HTML content with KaTeX math. Math is
// compiled INTO the HTML string (katex.renderToString) before React writes
// it — mutating the DOM after mount (auto-render style) doesn't survive
// re-renders, which rewrite dangerouslySetInnerHTML content. Files write
// MathJax-style \( \) / \[ \] delimiters (and $…$ / $$…$$). Content is
// authored by the site owner through the admin, so it is trusted HTML.

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n/strings";
import styles from "./lesson-html.module.css";

const MATH_RE =
  /\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

function renderMathInHtml(html: string): string {
  return html.replace(MATH_RE, (whole, display1, inline1, display2, inline2) => {
    const displayMode = display1 !== undefined || display2 !== undefined;
    const latex = display1 ?? inline1 ?? display2 ?? inline2 ?? "";
    try {
      return katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        output: "html",
      });
    } catch {
      return whole;
    }
  });
}

export function LessonHtml({
  html,
  lang,
  className,
}: {
  html: { kz: string; ru?: string };
  lang: Lang;
  className?: string;
}) {
  const content = (lang === "ru" ? html.ru : undefined) ?? html.kz ?? "";
  const rendered = useMemo(() => renderMathInHtml(content), [content]);

  return (
    <div
      className={cn(styles.root, "[&_.katex]:text-[1.06em]", className)}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}
