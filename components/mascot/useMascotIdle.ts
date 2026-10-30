"use client";

import { useEffect, useRef, useState } from "react";
import type { IllustratedPose } from "./IllustratedCat";
import {
  DEMO_POSES,
  DEMO_STEP_MS,
  SMALL_HOLD_MS,
  STRETCH_HOLD_MS,
  dozingHoldMs,
  lyingHoldMs,
  nextRestGapMs,
  nextSmallGapMs,
  nextStretchGapMs,
  pickSmallBehaviour,
  type SmallBehaviour,
} from "@/lib/mascot/idlePlan";

type UseMascotIdleOptions = {
  /** Idle life runs on the resting cat. Off for reduced motion and the brief celebrate flash. */
  enabled: boolean;
  /** Hover, a hidden tab, or the menu: freeze the clock and hold the current pose. */
  paused: boolean;
  /** Preview-only fast cycle. Ignored unless the caller already checked the environment. */
  demo: boolean;
};

/**
 * Sits on content, then occasionally plays one behaviour and returns.
 * Time spent paused (hover, hidden tab) does not count toward the waits.
 */
export function useMascotIdle({ enabled, paused, demo }: UseMascotIdleOptions): IllustratedPose {
  const [pose, setPose] = useState<IllustratedPose>("content");
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer = 0;

    function sleep(ms: number) {
      return new Promise<void>((resolve, reject) => {
        let left = ms;
        let last = performance.now();
        const tick = () => {
          if (cancelled) {
            reject(new Error("cancelled"));
            return;
          }
          const now = performance.now();
          if (pausedRef.current || document.hidden) {
            last = now;
            timer = window.setTimeout(tick, 200);
            return;
          }
          left -= now - last;
          last = now;
          if (left <= 0) resolve();
          else timer = window.setTimeout(tick, Math.min(250, Math.max(16, left)));
        };
        tick();
      });
    }

    async function run() {
      if (demo) {
        let index = 0;
        while (!cancelled) {
          setPose(DEMO_POSES[index % DEMO_POSES.length]);
          index += 1;
          await sleep(DEMO_STEP_MS);
        }
        return;
      }

      let nextSmall = nextSmallGapMs();
      let nextRest = nextRestGapMs();
      let nextStretch = nextStretchGapMs();
      let lastSmall: SmallBehaviour | null = null;

      while (!cancelled) {
        const wait = Math.min(nextSmall, nextRest, nextStretch);
        await sleep(wait);
        if (cancelled) return;
        nextSmall -= wait;
        nextRest -= wait;
        nextStretch -= wait;

        if (nextStretch <= 0) {
          setPose("stretch");
          await sleep(STRETCH_HOLD_MS);
          nextStretch = nextStretchGapMs();
        } else if (nextRest <= 0) {
          setPose("dozing");
          await sleep(dozingHoldMs());
          if (cancelled) return;
          setPose("lying");
          await sleep(lyingHoldMs());
          nextRest = nextRestGapMs();
          nextSmall = nextSmallGapMs();
        } else {
          const small = pickSmallBehaviour(lastSmall);
          lastSmall = small;
          setPose(small);
          await sleep(SMALL_HOLD_MS[small]);
          nextSmall = nextSmallGapMs();
        }
        if (cancelled) return;
        setPose("content");
      }
    }

    run().catch(() => {
      /* unmounted mid-wait */
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, demo]);

  return enabled ? pose : "content";
}
