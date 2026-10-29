"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getRandomMascotLine } from "@/lib/mascot/lines";

const AUTO_CLOSE_MS = 6000;

type SpeechBubbleProps = {
  children: React.ReactNode;
  label: string;
  className?: string;
};

/**
 * Wraps the mascot SVG in a focusable button. Hover or click/tap shows a
 * speech bubble with one random line; it closes on tap-away, blur, or
 * after ~6 seconds. The trigger is a real <button>, and the bubble is
 * announced via aria-live so it's readable by screen readers when opened.
 */
export function SpeechBubble({ children, label, className }: SpeechBubbleProps) {
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState("");
  const pinnedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const bubbleId = useId();

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function openBubble(pin: boolean) {
    setLine(getRandomMascotLine());
    setOpen(true);
    pinnedRef.current = pin;
    clearTimer();
    timerRef.current = setTimeout(() => {
      setOpen(false);
      pinnedRef.current = false;
    }, AUTO_CLOSE_MS);
  }

  function closeBubble() {
    setOpen(false);
    pinnedRef.current = false;
    clearTimer();
  }

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(event: MouseEvent | TouchEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(event.target as Node)) closeBubble();
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("touchstart", onDocPointerDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("touchstart", onDocPointerDown);
    };
  }, [open]);

  useEffect(() => clearTimer, []);

  return (
    <div ref={wrapRef} className={`mascot-bubble-wrap ${className ?? ""}`}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? bubbleId : undefined}
        onClick={() => (open ? closeBubble() : openBubble(true))}
        onMouseEnter={() => {
          if (!open) openBubble(false);
        }}
        onMouseLeave={() => {
          if (open && !pinnedRef.current) closeBubble();
        }}
        onBlur={() => closeBubble()}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          pointerEvents: "auto",
          display: "block",
        }}
      >
        {children}
      </button>
      <div id={bubbleId} className="mascot-bubble" data-open={open} role="status" aria-live="polite">
        {open ? line : ""}
      </div>
    </div>
  );
}
