import { Skeleton } from "@/components/ui/skeleton";

// Skeleton of the learn page, which really is a large theory iframe with
// the problem bank below it.
export default function LearnLoading() {
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
        <div className="overflow-hidden rounded-xl border-[1.5px] border-[#d8dde5] bg-white">
          <div className="flex min-h-12 items-center gap-3 border-b-[1.5px] border-[#d8dde5] px-4">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-[560px] w-full rounded-none md:h-[640px]" />
        </div>
      </main>
    </div>
  );
}
