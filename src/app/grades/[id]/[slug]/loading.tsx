import { Skeleton } from "@/components/ui/skeleton";

// Skeleton of the lesson hub (two navigation cards). /learn and /quizzes
// have their own loading.tsx mirroring their real layouts.
export default function TopicLoading() {
  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <div className="sticky top-0 z-30 flex min-h-[54px] items-center justify-between gap-3 border-b-[1.5px] border-[#d8dde5] bg-white px-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-24" />
          <div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-1.5 h-3 w-20" />
          </div>
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <Skeleton className="mb-6 h-4 w-72" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-4 rounded-xl border-[1.5px] border-[#d8dde5] bg-white p-5"
            >
              <Skeleton className="size-12 rounded-xl" />
              <div>
                <Skeleton className="h-5 w-36" />
                <Skeleton className="mt-2 h-3.5 w-full" />
              </div>
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
