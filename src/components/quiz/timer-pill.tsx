import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

// Session countdown chip; turns red and pulses over the last 5 minutes.
export function TimerPill({ seconds }: { seconds: number }) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const low = seconds <= 300;
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs font-bold tabular-nums",
        low
          ? "animate-pulse border-red-200 bg-red-50 text-red-700"
          : "border-border bg-card text-foreground",
      )}
    >
      <Clock className="size-3.5" aria-hidden />
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}
