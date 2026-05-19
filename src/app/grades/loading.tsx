import { Skeleton } from "@/components/ui/skeleton";

export default function GradesLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="h-14 border-b border-border" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-3 h-4 w-96" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      </main>
    </div>
  );
}
