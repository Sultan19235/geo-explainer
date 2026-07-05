import { Skeleton } from "@/components/ui/skeleton";

// Skeleton of the quizzes page: the embedded console's setup phase — a
// centered column with the header/config card and a few question rows.
export default function QuizzesLoading() {
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
      <main className="w-full px-4 py-3">
        <div className="mx-auto w-full max-w-3xl py-2">
          <div className="rounded-xl border-[1.5px] border-[#d8dde5] bg-white p-5">
            <div className="flex items-start gap-3">
              <Skeleton className="size-11 rounded-xl" />
              <div className="flex-1">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="mt-2 h-4 w-28" />
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Skeleton className="h-[74px] rounded-xl" />
              <Skeleton className="h-[74px] rounded-xl" />
            </div>
            <Skeleton className="mt-3 h-10 w-full rounded-lg" />
            <Skeleton className="mt-4 h-12 w-full rounded-lg" />
          </div>
          <div className="mt-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-xl border-[1.5px] border-[#d8dde5] bg-white p-3.5"
              >
                <div className="flex items-start gap-3">
                  <Skeleton className="mt-0.5 size-5 rounded-[6px]" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-5/6" />
                    <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                      <Skeleton className="h-8 rounded-lg" />
                      <Skeleton className="h-8 rounded-lg" />
                      <Skeleton className="h-8 rounded-lg" />
                      <Skeleton className="h-8 rounded-lg" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
