import { Skeleton } from "@/components/ui/skeleton";
import { GRADES } from "@/lib/grades";

export default function GradesLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="h-14 border-b border-border" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <div className="mb-8">
          <Skeleton className="h-9 w-64" />
          <div className="mt-3 h-[3px] w-10 rounded-full bg-border" />
          <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        </div>

        <div className="flex flex-col gap-3">
          {GRADES.map((grade) => (
            <div
              key={grade}
              className="flex items-center gap-4 rounded-xl bg-card py-4 pr-4 pl-4 ring-1 ring-foreground/10 sm:gap-5"
            >
              <Skeleton className="size-14 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-2 h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="size-5 shrink-0 rounded-md" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
