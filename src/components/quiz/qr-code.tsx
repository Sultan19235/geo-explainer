"use client";

import { useEffect, useRef } from "react";
import QR from "qrcode";
import { cn } from "@/lib/utils";

export function QrCode({
  text,
  size,
  className,
}: {
  text: string;
  size: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    QR.toCanvas(ref.current, text, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#141826", light: "#ffffff" },
    }).catch(() => {
      // canvas unavailable — the room code next to it still works
    });
  }, [text, size]);

  return (
    <canvas ref={ref} className={cn("rounded-lg", className)} aria-hidden />
  );
}
