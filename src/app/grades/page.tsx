import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

const GRADES = [7, 8, 9, 10, 11] as const;

type PublishedTopicGradeRow = {
  grade_id: number | null;
};

export default async function GradesCatalogPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("topics")
    .select("grade_id")
    .eq("is_published", true)
    .returns<PublishedTopicGradeRow[]>();

  const counts = new Map<number, number>();
  for (const row of data ?? []) {
    if (typeof row.grade_id === "number") {
      counts.set(row.grade_id, (counts.get(row.grade_id) ?? 0) + 1);
    }
  }

  return (
    <main className="min-h-screen bg-muted/30 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            Сабақтар каталогы
          </h1>
          <p className="mt-2 text-muted-foreground">
            Сыныпты таңдаңыз және жарияланған тақырыптарды қараңыз.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Тақырыптарды жүктеу қатесі: {error.message}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {GRADES.map((grade) => (
            <Link key={grade} href={`/grades/${grade}`} className="block">
              <Card className="h-full border-border/80 bg-background transition-colors hover:border-blue-500 hover:bg-blue-50/50">
                <CardHeader>
                  <CardTitle className="text-2xl">{grade}-сынып</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {counts.get(grade) ?? 0} жарияланған тақырып
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
