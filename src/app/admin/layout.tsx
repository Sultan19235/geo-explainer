import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-muted/30 p-4">
        <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Әкімші
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          <Link
            href="/admin/topics"
            className="rounded px-2 py-1.5 hover:bg-muted"
          >
            Тақырыптар
          </Link>
          <Link
            href="/admin/problems"
            className="rounded px-2 py-1.5 hover:bg-muted"
          >
            Есептер
          </Link>
          <Link
            href="/admin/teachers"
            className="rounded px-2 py-1.5 hover:bg-muted"
          >
            Мұғалімдер
          </Link>
        </nav>
        <div className="mt-6 border-t pt-4 text-sm">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:underline"
          >
            ← Басты бет
          </Link>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
