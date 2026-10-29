"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "lifecfo-mascot-enabled";
const EVENT = "lifecfo-mascot-enabled";

function readEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

function writeEnabled(next: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Per-device "show the cat" toggle. Defaults to on; stored only in
 * localStorage, so it needs no account/database changes.
 */
export function useMascotEnabled(): { enabled: boolean; ready: boolean; setEnabled: (next: boolean) => void } {
  const [enabled, setEnabledState] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setEnabledState(readEnabled());
    setReady(true);
    const sync = () => setEnabledState(readEnabled());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return {
    enabled,
    ready,
    setEnabled: (next: boolean) => {
      writeEnabled(next);
      setEnabledState(next);
    },
  };
}

/** True when the visitor's OS/browser asks for reduced motion. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
