"use client";

// The 6-character room-code entry, kahoot style: big, uppercase, letters and
// digits only. Rendered compact on the homepage hero and large on /join.
// Without onSubmit it routes to /join?code=… so the join page owns the actual
// resolve flow and its error states; too-short codes are caught right here so
// both surfaces explain themselves instead of silently ignoring the tap.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export const ROOM_CODE_LENGTH = 6;

// Codes are A-Z0-9 (see server generateCode); phones may lowercase, pad or
// paste with separators — everything else is stripped as the student types.
// Deliberately no maxLength on the input: the browser would clamp a pasted
// "ABC 123" to six RAW characters (separator included) before this runs.
export function normalizeRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, ROOM_CODE_LENGTH);
}

export function JoinCodeForm({
  large = false,
  autoFocus = false,
  initialCode = "",
  busy = false,
  onSubmit,
}: {
  large?: boolean;
  autoFocus?: boolean;
  initialCode?: string;
  busy?: boolean;
  onSubmit?: (code: string) => void;
}) {
  const { t } = useT();
  const router = useRouter();
  const [code, setCode] = useState(() => normalizeRoomCode(initialCode));
  // Submitting fewer than 6 characters shows the hint instead of doing
  // nothing — the button is only disabled while empty or busy.
  const [tooShort, setTooShort] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (busy || code.length === 0) return;
        if (code.length < ROOM_CODE_LENGTH) {
          setTooShort(true);
          return;
        }
        if (onSubmit) onSubmit(code);
        else router.push(`/join?code=${encodeURIComponent(code)}`);
      }}
    >
      <div className={cn("flex w-full gap-2", large && "flex-col")}>
        <Input
          value={code}
          onChange={(e) => {
            setCode(normalizeRoomCode(e.target.value));
            setTooShort(false);
          }}
          placeholder="ABC123"
          aria-label={t("join_code_label")}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className={cn(
            "text-center font-mono uppercase tracking-[0.3em]",
            large ? "h-14 text-2xl" : "bg-background",
          )}
        />
        <Button
          type="submit"
          disabled={busy || code.length === 0}
          size={large ? "lg" : "default"}
        >
          {t("join_button")}
        </Button>
      </div>
      {tooShort && (
        <p className="mt-2 text-xs font-medium text-red-600" role="alert">
          {t("join_error_short")}
        </p>
      )}
    </form>
  );
}
