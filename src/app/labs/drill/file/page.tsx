import type { Metadata } from "next";
import { FileDrillClient } from "./file-client";

export const metadata: Metadata = {
  title: "Drill · generator file previewer (labs)",
};

export default function DrillFilePage() {
  return <FileDrillClient />;
}
