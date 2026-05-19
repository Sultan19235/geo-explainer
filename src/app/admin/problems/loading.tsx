import { Skeleton } from "@/components/ui/skeleton";

export default function AdminProblemsLoading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="mb-6 flex items-center gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-7 w-24" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, row) => (
          <Skeleton key={row} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
