"use client";

import { useEffect, useRef, useState } from "react";

const FLAG_KEY = "lifecfo-mascot-celebrate";
const EVENT = "lifecfo-mascot-celebrate-now";

/** Called right before navigating to Home after creating a household. */
export function markMascotCelebrateOnNextHome(): void {
  try {
    window.sessionStorage.setItem(FLAG_KEY, "1");
  } catch {
    /* private mode */
  }
}

/** Called from a component already mounted on Home to celebrate immediately. */
export function triggerMascotCelebration(): void {
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* no-op */
  }
}

/**
 * A number that increments whenever a Home-level celebration should
 * play: once on mount if the "household just created" flag is set, and
 * any time triggerMascotCelebration() fires while this is mounted.
 */
export function useMascotCelebrateKey(active: boolean): number {
  const [key, setKey] = useState(0);
  const checkedFlagRef = useRef(false);

  useEffect(() => {
    if (!active || checkedFlagRef.current) return;
    checkedFlagRef.current = true;
    try {
      if (window.sessionStorage.getItem(FLAG_KEY) === "1") {
        window.sessionStorage.removeItem(FLAG_KEY);
        setKey((n) => n + 1);
      }
    } catch {
      /* private mode */
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onNow = () => setKey((n) => n + 1);
    window.addEventListener(EVENT, onNow);
    return () => window.removeEventListener(EVENT, onNow);
  }, [active]);

  return key;
}
