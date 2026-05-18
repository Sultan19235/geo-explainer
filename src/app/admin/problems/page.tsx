import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ProblemRow = {
  id: string;
  number: string;
  title_kz: string;
  difficulty: "easy" | "med" | "hard";
  display_order: number;
  is_ready: boolean;
  problem_html_path: string | null;
  topic_id: string;
  topics: { id: string; name_kz: string; display_order: number } | null;
};

type TopicFilterOption = { id: string; name_kz: string };

export default async function ProblemsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  await requireAdmin();
  const admin = createAdminClient();
  const { topic: topicFilter } = await searchParams;

  let query = admin
    .from("problems")
    .select(
      "id, number, title_kz, difficulty, display_order, is_ready, problem_html_path, topic_id, topics(id, name_kz, display_order)",
    );

  if (topicFilter) {
    query = query.eq("topic_id", topicFilter);
  }

  const { data: problemsRaw, error } = await query.returns<ProblemRow[]>();

  const { data: topics } = await admin
    .from("topics")
    .select("id, name_kz")
    .order("display_order", { ascending: true })
    .returns<TopicFilterOption[]>();

  if (error) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold">Есептер</h1>
        <p className="text-sm text-red-600">Қате: {error.message}</p>
      </div>
    );
  }

  const problems = (problemsRaw ?? []).slice().sort((a, b) => {
    const ao = a.topics?.display_order ?? 0;
    const bo = b.topics?.display_order ?? 0;
    if (ao !== bo) return ao - bo;
    if (a.display_order !== b.display_order)
      return a.display_order - b.display_order;
    return a.number.localeCompare(b.number);
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Есептер</h1>
        <Link href="/admin/problems/new" className={buttonVariants()}>
          + Жаңа есеп
        </Link>
      </div>

      <form className="mb-6 flex items-center gap-2">
        <label htmlFor="topic-filter" className="text-sm text-muted-foreground">
          Тақырып бойынша сүзгі:
        </label>
        <select
          id="topic-filter"
          name="topic"
          defaultValue={topicFilter ?? ""}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="">Барлығы</option>
          {(topics ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name_kz}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          Қолдану
        </Button>
      </form>

      {problems.length === 0 ? (
        <p className="text-muted-foreground">Әзірге есеп жоқ.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Тақырып</TableHead>
              <TableHead>№</TableHead>
              <TableHead>Тақырыбы</TableHead>
              <TableHead>Қиындық</TableHead>
              <TableHead>Файл</TableHead>
              <TableHead className="w-32">Әрекет</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {problems.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.topics?.name_kz ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">№{p.number}</TableCell>
                <TableCell>{p.title_kz}</TableCell>
                <TableCell>
                  {p.difficulty === "easy"
                    ? "Жеңіл"
                    : p.difficulty === "med"
                      ? "Орташа"
                      : "Қиын"}
                </TableCell>
                <TableCell>
                  {p.problem_html_path ? "✓" : "Дайындалуда"}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/problems/${p.id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Өңдеу
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
