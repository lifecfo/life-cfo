/**
 * Hit-tests a set of points and reports whether any of them land on real
 * page content (as opposed to the mascot's own layer, which is marked
 * with data-mascot-layer and is pointer-events:none anyway, or plain
 * html/body background). Used as a defensive backstop right before the
 * ambient cat appears or a scene starts -- the reserved bottom padding on
 * Home should already keep this area clear in the normal case.
 */
export function isMascotBandClear(points: Array<{ x: number; y: number }>): boolean {
  if (typeof document === "undefined") return true;

  for (const { x, y } of points) {
    if (x < 0 || y < 0) continue;
    const stack = typeof document.elementsFromPoint === "function" ? document.elementsFromPoint(x, y) : [];
    const blocking = stack.filter((el) => {
      if (el === document.documentElement || el === document.body) return false;
      if (el.closest("[data-mascot-layer]")) return false;
      return true;
    });
    if (blocking.length > 0) return false;
  }

  return true;
}

/** Sample points across the ambient cat's resting footprint, bottom-left. */
export function ambientCatSamplePoints(): Array<{ x: number; y: number }> {
  if (typeof window === "undefined") return [];
  const h = window.innerHeight;
  return [
    { x: 20, y: h - 10 },
    { x: 50, y: h - 10 },
    { x: 80, y: h - 10 },
    { x: 20, y: h - 50 },
    { x: 50, y: h - 50 },
  ];
}

/** Sample points across the scene band, excluding the Ask launcher's bottom-right corner. */
export function sceneBandSamplePoints(): Array<{ x: number; y: number }> {
  if (typeof window === "undefined") return [];
  const w = window.innerWidth;
  const h = window.innerHeight;
  const fractions = [0.04, 0.15, 0.3, 0.45, 0.6, 0.75];
  const points: Array<{ x: number; y: number }> = [];
  for (const f of fractions) {
    points.push({ x: w * f, y: h - 10 });
    points.push({ x: w * f, y: h - 45 });
  }
  return points;
}
