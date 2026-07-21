"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_DURATION_MS = 700;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useCountUp(target: number, durationMs: number = DEFAULT_DURATION_MS): number {
  const [reducedMotion] = useState(prefersReducedMotion);
  const [value, setValue] = useState(() => (reducedMotion ? target : 0));
  const previousRef = useRef(reducedMotion ? target : 0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion) {
      previousRef.current = target;
      setValue(target);
      return;
    }

    const from = previousRef.current;
    const to = target;
    if (from === to) return;

    const startTime = performance.now();

    function tick(now: number) {
      const progress = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (to - from) * eased);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        previousRef.current = to;
      }
    }

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, durationMs, reducedMotion]);

  return value;
}
