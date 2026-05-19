import { Skeleton } from "@/components/ui/skeleton";

export default function GradeDetailLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="h-14 border-b border-border" />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="mt-3 h-4 w-72" />
        <div className="mt-8 grid gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      </main>
    </div>
  );
}
