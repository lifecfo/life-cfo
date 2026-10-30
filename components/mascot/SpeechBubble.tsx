"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { getStickyMascotLine } from "@/lib/mascot/lineMemory";
import { BubbleShape } from "./BubbleShape";
import { mascotHandwrittenFont } from "./mascotFont";

const HOVER_CLOSE_DELAY_MS = 300;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type SpeechBubbleProps = {
  children: React.ReactNode;
  label: string;
  /**
   * Which side of the cat the caption sits on. Omit to pick the side with
   * more room inside the strip (left unless the right side is clearly wider).
   */
  side?: "left" | "right";
  className?: string;
  /** Fires when the caption opens or starts to hide, so the pose can cross-fade with it. */
  onOpenChange?: (open: boolean) => void;
};

/**
 * Fixed-size anchor for the cat. The caption is position:absolute, so
 * showing it never changes the cat's box. Desktop: hover shows it, moving
 * away hides it after a short delay. Touch: tap toggles. Keyboard: focus
 * shows, blur hides. The line is sticky for 5 minutes.
 */
export function SpeechBubble({ children, label, side, className, onOpenChange }: SpeechBubbleProps) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [line, setLine] = useState("");
  const [placedSide, setPlacedSide] = useState<"left" | "right">(side ?? "left");
  const [room, setRoom] = useState(190);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sidePropRef = useRef(side);
  sidePropRef.current = side;
  const bubbleId = useId();

  function clearHideTimer() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function show() {
    clearHideTimer();
    openRef.current = true;
    setLine(getStickyMascotLine());
    setOpen(true);
    onOpenChange?.(true);
    if (prefersReducedMotion()) {
      setVisible(true);
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (openRef.current) setVisible(true);
      });
    });
  }

  function hideNow() {
    clearHideTimer();
    openRef.current = false;
    setOpen(false);
    setVisible(false);
    onOpenChange?.(false);
  }

  function hideAfterDelay() {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => hideNow(), HOVER_CLOSE_DELAY_MS);
  }

  useLayoutEffect(() => {
    const anchor = wrapRef.current;
    if (!anchor) return;

    function place() {
      const node = wrapRef.current;
      if (!node) return;
      const strip = node.closest(".mascot-strip");
      const bounds = strip ?? node.parentElement;
      if (!bounds) return;
      const anchorBox = node.getBoundingClientRect();
      const stripBox = bounds.getBoundingClientRect();
      const leftRoom = anchorBox.left - stripBox.left;
      const rightRoom = stripBox.right - anchorBox.right;
      const forced = sidePropRef.current;
      const next = forced ?? (rightRoom > leftRoom + 8 ? "right" : "left");
      const nextRoom = Math.min(190, Math.max(0, Math.floor((next === "left" ? leftRoom : rightRoom) - 14)));
      setPlacedSide((prev) => (prev === next ? prev : next));
      setRoom((prev) => (prev === nextRoom ? prev : nextRoom));
    }

    place();
    const observed = anchor.closest(".mascot-strip") ?? anchor.parentElement;
    const observer = new ResizeObserver(place);
    observer.observe(anchor);
    if (observed) observer.observe(observed);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(event: MouseEvent | TouchEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(event.target as Node)) hideNow();
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("touchstart", onDocPointerDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("touchstart", onDocPointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const hideTimer = hideTimerRef;
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className={`mascot-anchor ${className ?? ""}`}
      data-side={placedSide}
      data-mascot-anchor=""
      style={{ ["--mascot-bubble-room" as string]: `${room}px` }}
      onMouseEnter={show}
      onMouseLeave={hideAfterDelay}
    >
      <div
        id={bubbleId}
        className="mascot-bubble-slot"
        data-shown={visible ? "true" : "false"}
        role={open ? "status" : undefined}
        aria-live={open ? "polite" : undefined}
        aria-hidden={open ? undefined : true}
      >
        <BubbleShape />
        <span className={`mascot-bubble-text ${mascotHandwrittenFont.className}`}>{line}</span>
      </div>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? bubbleId : undefined}
        onClick={() => (open ? hideNow() : show())}
        onFocus={show}
        onBlur={hideNow}
        className="mascot-cat-button"
      >
        {children}
      </button>
    </div>
  );
}
