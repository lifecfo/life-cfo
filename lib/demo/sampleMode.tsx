"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "lifecfo-sample-household";
const EVENT = "lifecfo-sample-household";

type SampleMode = {
  on: boolean;
  ready: boolean;
  setOn: (next: boolean) => void;
};

const SampleContext = createContext<SampleMode>({
  on: false,
  ready: false,
  setOn: () => {},
});

function readOn(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOn(next: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function SampleProvider({ children }: { children: ReactNode }) {
  const [on, setOnState] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOnState(readOn());
    setReady(true);
    const sync = () => setOnState(readOn());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return (
    <SampleContext.Provider value={{ on, ready, setOn: (next) => { writeOn(next); setOnState(next); } }}>
      {children}
    </SampleContext.Provider>
  );
}

export function useSampleMode(): SampleMode {
  return useContext(SampleContext);
}

export function SampleStrip() {
  const { on, setOn } = useSampleMode();
  if (!on) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-full border border-cfo/15 bg-cfo-soft px-3 py-1.5 text-xs text-cfo">
      <span>Sample household. Example figures, not yours.</span>
      <button type="button" className="font-medium underline" onClick={() => setOn(false)}>
        Hide sample
      </button>
    </div>
  );
}

export function SampleOffer() {
  const { on, setOn } = useSampleMode();
  if (on) return null;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-neutral-border bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-neutral-text">See Life CFO with a sample household</p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded-xl bg-cfo px-3 py-1.5 text-sm font-medium text-white"
          onClick={() => setOn(true)}
        >
          Show sample
        </button>
        <a href="/start" className="text-sm font-medium text-cfo underline">
          Start with my own
        </a>
      </div>
    </div>
  );
}
