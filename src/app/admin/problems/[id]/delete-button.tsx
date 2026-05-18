"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  action: () => Promise<void>;
};

export function DeleteProblemButton({ action }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (
      !window.confirm(
        "Осы есепті жою керек пе? Бұл әрекетті қайтару мүмкін емес.",
      )
    ) {
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
          setError("Жою кезінде қате.");
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
        {isPending ? "Жойылуда..." : "Жою"}
      </Button>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
