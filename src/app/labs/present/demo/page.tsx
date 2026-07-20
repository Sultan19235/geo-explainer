import type { Metadata } from "next";
import { PresentPlayerLoader } from "@/components/present/player-loader";

export const metadata: Metadata = {
  title: "Натурал сандар және нөл — демо презентация",
};

// The bundled 1.1 deck (public/present/demo-5-1-1.js) — keeps the hub alive
// before any presentation has been uploaded.
export default function PresentDemoPage() {
  return (
    <PresentPlayerLoader
      src="/present/demo-5-1-1.js"
      backHref="/labs/present"
    />
  );
}
