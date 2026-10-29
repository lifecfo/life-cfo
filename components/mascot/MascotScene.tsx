"use client";

import { useEffect, useRef, useState } from "react";
import { CatSvg, type CatExpression } from "./CatSvg";
import { MouseSvg } from "./MouseSvg";
import { MouseHoleSvg } from "./MouseHoleSvg";
import { CheeseSvg } from "./CheeseSvg";
import { isDevOrPreviewEnvironment } from "@/lib/mascot/isDevOrPreview";
import { isMascotBandClear, sceneBandSamplePoints } from "@/lib/mascot/isBandClear";

type SceneName = "chase" | "tease" | "cheese" | "peekaboo";
const SCENE_NAMES: SceneName[] = ["chase", "tease", "cheese", "peekaboo"];

type ItemState = { left: number; opacity: number; scale: number };
const HIDDEN: ItemState = { left: 10, opacity: 0, scale: 1 };

type SceneStep = {
  at: number;
  mouse?: Partial<ItemState>;
  hole?: Partial<ItemState>;
  cat?: Partial<ItemState>;
  crumb?: Partial<ItemState>;
  cheese?: Partial<ItemState>;
  catNapping?: boolean;
  catAlert?: boolean;
  catNudge?: boolean;
};

// Each scene is a short, hand-timed sequence of position/visibility steps
// along the bottom-edge band. Durations are deliberately slow and
// unhurried outside the mouse's own quick scurries, per the "gentle, no
// flashing" requirement.
const SCENES: Record<SceneName, { durationMs: number; catStartsNapping: boolean; steps: SceneStep[] }> = {
  chase: {
    durationMs: 7200,
    catStartsNapping: false,
    steps: [
      { at: 0, hole: { left: 10, opacity: 1, scale: 1 }, mouse: { left: 68, opacity: 1, scale: 1 } },
      { at: 300, mouse: { left: 16, opacity: 1, scale: 1 } },
      { at: 500, catAlert: true },
      { at: 700, cat: { left: 22, opacity: 1, scale: 1 } },
      { at: 2200, mouse: { left: 9, opacity: 0, scale: 0.3 } },
      { at: 2700, cat: { left: 15, opacity: 1, scale: 1 }, catAlert: false },
      { at: 5200, cat: { left: 2, opacity: 1, scale: 1 } },
      { at: 6600, hole: { left: 10, opacity: 0, scale: 1 } },
    ],
  },
  tease: {
    durationMs: 6400,
    catStartsNapping: true,
    steps: [
      { at: 0, hole: { left: 11, opacity: 1, scale: 1 } },
      { at: 400, mouse: { left: 11, opacity: 1, scale: 1 } },
      { at: 1300, mouse: { left: 4, opacity: 1, scale: 1 } },
      { at: 2900, catNudge: true, mouse: { left: 4, opacity: 1, scale: 1 } },
      { at: 3300, mouse: { left: 11, opacity: 1, scale: 1 } },
      { at: 4000, mouse: { left: 11, opacity: 0, scale: 0.3 } },
      { at: 4100, catNapping: false },
      { at: 5700, catNapping: true },
      { at: 5900, hole: { left: 11, opacity: 0, scale: 1 } },
    ],
  },
  cheese: {
    durationMs: 6500,
    catStartsNapping: false,
    steps: [
      { at: 0, hole: { left: 11, opacity: 1, scale: 1 } },
      { at: 500, mouse: { left: 12, opacity: 1, scale: 1 }, cheese: { left: 13, opacity: 1, scale: 1 } },
      { at: 2200, mouse: { left: 11, opacity: 0, scale: 0.3 }, cheese: { left: 11, opacity: 0, scale: 1 } },
      { at: 2300, crumb: { left: 11.5, opacity: 1, scale: 1 } },
      { at: 2700, cat: { left: 9, opacity: 1, scale: 1 } },
      { at: 5300, crumb: { left: 11.5, opacity: 0, scale: 1 }, hole: { left: 11, opacity: 0, scale: 1 } },
      { at: 5400, cat: { left: 2, opacity: 1, scale: 1 } },
    ],
  },
  peekaboo: {
    durationMs: 5200,
    catStartsNapping: false,
    steps: [
      { at: 0, hole: { left: 10, opacity: 1, scale: 1 } },
      { at: 300, mouse: { left: 10, opacity: 1, scale: 1 } },
      { at: 1100, mouse: { left: 10, opacity: 0, scale: 0.3 } },
      { at: 1800, mouse: { left: 10, opacity: 1, scale: 1 } },
      { at: 2600, mouse: { left: 10, opacity: 0, scale: 0.3 } },
      { at: 3900, hole: { left: 10, opacity: 0, scale: 1 } },
    ],
  },
};

function pickRandomScene(): SceneName {
  return SCENE_NAMES[Math.floor(Math.random() * SCENE_NAMES.length)];
}

type MascotSceneProps = {
  enabled: boolean;
  reducedMotion: boolean;
  suppressed: boolean;
  onSceneStart?: () => void;
  onSceneEnd?: () => void;
};

export function MascotScene({ enabled, reducedMotion, suppressed, onSceneStart, onSceneEnd }: MascotSceneProps) {
  const [active, setActive] = useState<SceneName | null>(null);
  const [mouse, setMouse] = useState<ItemState>(HIDDEN);
  const [hole, setHole] = useState<ItemState>(HIDDEN);
  const [cat, setCat] = useState<ItemState>({ left: 2, opacity: 1, scale: 1 });
  const [crumb, setCrumb] = useState<ItemState>(HIDDEN);
  const [cheese, setCheese] = useState<ItemState>(HIDDEN);
  const [catNapping, setCatNapping] = useState(false);
  const [catAlert, setCatAlert] = useState(false);
  const [catNudge, setCatNudge] = useState(false);
  const [squeak, setSqueak] = useState(false);

  const suppressedRef = useRef(suppressed);
  suppressedRef.current = suppressed;
  const hasPlayedRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  function clearTimers() {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
  }

  function playScene(name: SceneName) {
    // Defensive backstop: the reserved bottom strip should already keep
    // this area clear, but skip outright if something's there anyway.
    if (suppressedRef.current || !isMascotBandClear(sceneBandSamplePoints())) return;

    const scene = SCENES[name];
    setActive(name);
    setCatNapping(scene.catStartsNapping);
    onSceneStart?.();

    for (const step of scene.steps) {
      const id = setTimeout(() => {
        if (step.mouse) setMouse((prev) => ({ ...prev, ...step.mouse }));
        if (step.hole) setHole((prev) => ({ ...prev, ...step.hole }));
        if (step.cat) setCat((prev) => ({ ...prev, ...step.cat }));
        if (step.crumb) setCrumb((prev) => ({ ...prev, ...step.crumb }));
        if (step.cheese) setCheese((prev) => ({ ...prev, ...step.cheese }));
        if (typeof step.catNapping === "boolean") setCatNapping(step.catNapping);
        if (typeof step.catAlert === "boolean") setCatAlert(step.catAlert);
        if (step.catNudge) {
          setCatNudge(true);
          setTimeout(() => setCatNudge(false), 650);
        }
      }, step.at);
      timersRef.current.push(id);
    }

    const endId = setTimeout(() => {
      setActive(null);
      setMouse(HIDDEN);
      setHole(HIDDEN);
      setCrumb(HIDDEN);
      setCheese(HIDDEN);
      setCatNapping(false);
      setCatAlert(false);
      setCat({ left: 2, opacity: 1, scale: 1 });
      onSceneEnd?.();
    }, scene.durationMs);
    timersRef.current.push(endId);
  }

  // One shot: on mount, decide whether (and when) to play a scene for this
  // page visit. Reduced motion means no scenes at all. The dev-only
  // ?mascotScene= override plays almost instantly, for testing.
  useEffect(() => {
    if (!enabled || reducedMotion || hasPlayedRef.current) return;

    const forced = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("mascotScene") : null;
    if (forced && isDevOrPreviewEnvironment() && SCENE_NAMES.includes(forced as SceneName)) {
      hasPlayedRef.current = true;
      const id = setTimeout(() => playScene(forced as SceneName), 500);
      timersRef.current.push(id);
      return () => clearTimers();
    }

    const shouldPlay = Math.random() < 1 / 3;
    if (!shouldPlay) {
      hasPlayedRef.current = true;
      return;
    }

    hasPlayedRef.current = true;
    const delay = 60000 + Math.random() * 120000;
    const id = setTimeout(() => playScene(pickRandomScene()), delay);
    timersRef.current.push(id);
    return () => clearTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, reducedMotion]);

  useEffect(() => clearTimers, []);

  function onMouseTap() {
    if (!hole) return;
    setSqueak(true);
    setMouse((prev) => ({ ...prev, left: hole.left, opacity: 0, scale: 0.3 }));
    setTimeout(() => setSqueak(false), 900);
  }

  if (!enabled || reducedMotion || !active) return null;

  const toLeft = (value: number) => `${value}%`;
  const catExpression: CatExpression = catNapping ? "sleepy" : catAlert ? "alert" : "open";

  return (
    <div className="mascot-scene-band" data-mascot-layer="true" aria-hidden="true">
      <div className="mascot-scene-item mascot-scene-hole" data-shown={hole.opacity > 0 ? "true" : "false"} style={{ left: toLeft(hole.left) }}>
        <MouseHoleSvg />
      </div>
      <div
        className="mascot-scene-item mascot-scene-mouse"
        data-shown={mouse.opacity > 0 ? "true" : "false"}
        style={{ left: toLeft(mouse.left), transform: `scale(${mouse.scale})`, pointerEvents: mouse.opacity > 0 ? "auto" : "none", cursor: "pointer" }}
        onClick={onMouseTap}
      >
        <MouseSvg />
        <div className="mascot-squeak" data-shown={squeak ? "true" : "false"}>!</div>
      </div>
      <div
        className="mascot-scene-item mascot-scene-cat"
        data-shown="true"
        style={{ left: toLeft(cat.left), transform: `scale(${cat.scale})` }}
      >
        <CatSvg pose="sitting" expression={catExpression} earsUp={catAlert} className={catNudge ? "mascot-nudge" : undefined} />
      </div>
      <div className="mascot-scene-crumb" data-shown={crumb.opacity > 0 ? "true" : "false"} style={{ left: toLeft(crumb.left) }} />
      <div className="mascot-scene-cheese" data-shown={cheese.opacity > 0 ? "true" : "false"} style={{ left: toLeft(cheese.left) }}>
        <CheeseSvg />
      </div>
    </div>
  );
}
