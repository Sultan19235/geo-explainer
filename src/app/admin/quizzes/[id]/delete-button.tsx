"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";

type Props = {
  action: () => Promise<void>;
};

export function DeleteQuizButton({ action }: Props) {
  const { t } = useT();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm(t("delete_quiz_confirm"))) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (e) {
        if (e instanceof Error) {
          if (e.message === "NEXT_REDIRECT") throw e;
          setError(e.message);
        } else {
          setError(t("delete_error"));
        }
      }
    });
  }

  return (
    <div className="text-right">
      <Button
        type="button"
        variant="destructive"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? t("delete_pending") : t("delete_button")}
      </Button>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
