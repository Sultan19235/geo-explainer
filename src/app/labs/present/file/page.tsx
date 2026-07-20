import type { Metadata } from "next";
import { PresentClient } from "./present-client";

export const metadata: Metadata = {
  title: "Презентация — file previewer",
};

export default function PresentFilePage() {
  return <PresentClient />;
}
