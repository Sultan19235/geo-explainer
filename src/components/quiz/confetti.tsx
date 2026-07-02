"use client";

import { useState } from "react";

const CONFETTI_COLORS = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed"];

// One celebratory burst, falling from the top. Renders nothing when the user
// prefers reduced motion.
export function Confetti() {
  const [pieces] = useState(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return [];
    }
    return Array.from({ length: 60 }, (_, i) => {
      const size = 5 + Math.random() * 9;
      return {
        id: i,
        style: {
          left: `${Math.random() * 100}vw`,
          width: size,
          height: size,
          background:
            CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          borderRadius: Math.random() > 0.5 ? "50%" : "2px",
          animationDuration: `${2 + Math.random() * 3}s`,
          animationDelay: `${Math.random() * 1.4}s`,
        } as React.CSSProperties,
      };
    });
  });

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      aria-hidden
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className="quiz-confetti-piece absolute"
          style={p.style}
        />
      ))}
    </div>
  );
}
