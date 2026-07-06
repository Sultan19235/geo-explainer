import { requireAdmin } from "@/lib/auth/require-admin";
import { QuizBackLink } from "../quiz-back-link";
import { GraphBuilderClient } from "./graph-builder-client";

// The graph-quiz authoring widget: hand-build "pick the graph" (mode A)
// quadratic questions visually, then download a pack.json to upload through
// the normal New Quiz form. No JSON hand-editing required.
export default async function GraphBuilderPage() {
  await requireAdmin();
  return (
    <div>
      <div className="mb-4 text-sm">
        <QuizBackLink />
      </div>
      <GraphBuilderClient />
    </div>
  );
}
