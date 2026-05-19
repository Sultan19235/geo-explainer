import { Skeleton } from "@/components/ui/skeleton";

export default function AdminTopicsLoading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>
      {Array.from({ length: 2 }).map((_, group) => (
        <div key={group} className="mb-8">
          <Skeleton className="mb-2 h-6 w-28" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, row) => (
              <Skeleton key={row} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
