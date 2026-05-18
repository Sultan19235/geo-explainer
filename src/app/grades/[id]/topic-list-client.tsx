"use client";

import Link from "next/link";
import { LockIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type GradeTopicListItem = {
  id: string;
  gradeId: number;
  slug: string;
  name_kz: string;
  description_kz: string | null;
  is_free_sample: boolean;
  isAccessible: boolean;
};

type Props = {
  topics: GradeTopicListItem[];
};

function topicDescription(description: string | null) {
  if (!description) return "Сипаттама қосылмаған.";
  if (description.length <= 120) return description;
  return `${description.slice(0, 117).trim()}...`;
}

export function TopicListClient({ topics }: Props) {
  if (topics.length === 0) {
    return (
      <p className="rounded-lg border bg-background px-4 py-6 text-muted-foreground">
        Бұл сыныпта әзірге жарияланған тақырып жоқ.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {topics.map((topic) => {
        const card = (
          <Card
            className={cn(
              "h-full border-border/80 bg-background transition-colors",
              topic.isAccessible
                ? "hover:border-blue-500 hover:bg-blue-50/50"
                : "opacity-80",
            )}
          >
            <CardHeader className="gap-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-xl">{topic.name_kz}</CardTitle>
                <div className="flex shrink-0 items-center gap-2">
                  {topic.is_free_sample && (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                      Тегін үлгі
                    </span>
                  )}
                  {!topic.isAccessible && (
                    <LockIcon className="size-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              {topicDescription(topic.description_kz)}
            </CardContent>
          </Card>
        );

        if (topic.isAccessible) {
          return (
            <Link
              key={topic.id}
              href={`/grades/${topic.gradeId}/${topic.slug}`}
              className="block"
            >
              {card}
            </Link>
          );
        }

        return (
          <button
            key={topic.id}
            type="button"
            className="block w-full text-left"
            onClick={() => alert("Кіру қажет — әкімшіге хабарласыңыз")}
          >
            {card}
          </button>
        );
      })}
    </div>
  );
}
