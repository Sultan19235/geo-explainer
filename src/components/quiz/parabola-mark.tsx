// Small coordinate-system mark with a parabola — the quiz pages' "logo".
export function ParabolaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <line
        x1="3"
        y1="34"
        x2="45"
        y2="34"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="1.5"
      />
      <line
        x1="24"
        y1="4"
        x2="24"
        y2="44"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="1.5"
      />
      <path
        d="M7 9 Q 24 59 41 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="24" cy="34" r="3" fill="currentColor" />
    </svg>
  );
}
