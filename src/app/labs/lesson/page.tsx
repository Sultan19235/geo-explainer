import type { Metadata } from "next";
import { LessonLabClient } from "./lesson-client";

export const metadata: Metadata = {
  title: "Цилиндр · Lesson player (labs)",
};

export default function LessonLabPage() {
  return <LessonLabClient />;
}
