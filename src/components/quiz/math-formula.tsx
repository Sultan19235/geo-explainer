import { Fragment } from "react";
import { cn } from "@/lib/utils";

// Renders a formula string from formatFunc() in textbook math voice — serif
// italic with a real superscript wherever the "^2" marker appears.
export function MathFormula({
  formula,
  className,
}: {
  formula: string;
  className?: string;
}) {
  const parts = formula.split("^2");
  return (
    <span className={cn("font-math", className)}>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && <sup>2</sup>}
        </Fragment>
      ))}
    </span>
  );
}
