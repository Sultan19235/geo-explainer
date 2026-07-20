import type { Metadata } from "next";
import { PresentClient } from "./present-client";

export const metadata: Metadata = {
  title: "Презентация — previewer",
};

export default function PresentPage() {
  return <PresentClient />;
}
