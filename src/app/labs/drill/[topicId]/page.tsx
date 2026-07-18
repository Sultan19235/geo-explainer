import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DRILL_TOPICS, getDrillTopic } from "@/lib/drill/registry";
import { DrillClient } from "./drill-client";

export function generateStaticParams() {
  return DRILL_TOPICS.map((topic) => ({ topicId: topic.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ topicId: string }>;
}): Promise<Metadata> {
  const { topicId } = await params;
  const topic = getDrillTopic(topicId);
  return { title: topic ? `${topic.title.kz} · drill (labs)` : "Drill (labs)" };
}

export default async function DrillTopicPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  if (!getDrillTopic(topicId)) notFound();
  return <DrillClient topicId={topicId} />;
}
