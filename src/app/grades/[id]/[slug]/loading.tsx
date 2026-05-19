import { Skeleton } from "@/components/ui/skeleton";

export default function TopicLoading() {
  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#d8dde5] bg-white px-4 sm:px-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-5 w-48" />
        </div>
        <Skeleton className="h-7 w-16" />
      </div>
      <main className="mx-auto max-w-[1440px] px-4 py-4">
        <div className="overflow-hidden rounded-2xl border border-[#d8dde5] bg-white">
          <div className="flex min-h-12 items-center gap-3 border-b border-[#d8dde5] px-4">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-[560px] w-full rounded-none md:h-[640px]" />
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-[#d8dde5] bg-white">
          <Skeleton className="h-[300px] w-full rounded-none" />
        </div>
      </main>
      <div className="fixed right-6 bottom-6 h-12 w-44">
        <Skeleton className="h-full w-full rounded-full" />
      </div>
    </div>
  );
}
