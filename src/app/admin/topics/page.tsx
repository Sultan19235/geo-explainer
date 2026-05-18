import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TopicRow = {
  id: string;
  slug: string;
  name_kz: string;
  is_published: boolean;
  is_free_sample: boolean;
  display_order: number;
  theory_html_path: string | null;
  grade_id: number;
};

export default async function TopicsAdminPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: topics, error } = await admin
    .from("topics")
    .select(
      "id, slug, name_kz, is_published, is_free_sample, display_order, theory_html_path, grade_id",
    )
    .order("display_order", { ascending: true })
    .order("name_kz", { ascending: true })
    .returns<TopicRow[]>();

  if (error) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold">Тақырыптар</h1>
        <p className="text-sm text-red-600">Қате: {error.message}</p>
      </div>
    );
  }

  const grouped = new Map<number, TopicRow[]>();
  for (const t of topics ?? []) {
    const g = t.grade_id ?? 0;
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(t);
  }
  const sortedGrades = Array.from(grouped.keys()).sort((a, b) => a - b);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Тақырыптар</h1>
        <Link href="/admin/topics/new" className={buttonVariants()}>
          + Жаңа тақырып
        </Link>
      </div>

      {sortedGrades.length === 0 && (
        <p className="text-muted-foreground">Әзірге тақырып жоқ.</p>
      )}

      {sortedGrades.map((grade) => (
        <div key={grade} className="mb-8">
          <h2 className="mb-2 text-lg font-medium">{grade}-сынып</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Slug</TableHead>
                <TableHead>Атау (қаз)</TableHead>
                <TableHead>Жарияланған</TableHead>
                <TableHead>Тегін үлгі</TableHead>
                <TableHead>Теория файлы</TableHead>
                <TableHead className="w-32">Әрекет</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.get(grade)!.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.slug}</TableCell>
                  <TableCell>{t.name_kz}</TableCell>
                  <TableCell>{t.is_published ? "✓" : "—"}</TableCell>
                  <TableCell>{t.is_free_sample ? "✓" : "—"}</TableCell>
                  <TableCell>{t.theory_html_path ? "✓" : "—"}</TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/topics/${t.id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Өңдеу
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
