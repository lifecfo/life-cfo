"use client";

import { usePathname } from "next/navigation";
import { useAsk } from "@/components/ask/AskProvider";
import { useMascotEnabled, usePrefersReducedMotion } from "@/lib/mascot/prefs";
import { MASCOT_MOUSE_ENABLED } from "@/lib/mascot/mouseFlag";
import { MascotStyles } from "./mascotStyles";
import { MascotScene } from "./MascotScene";

function isHomePath(pathname: string | null): boolean {
  return pathname === "/home" || pathname === "/lifecfo-home";
}

/**
 * Mounted once, globally, alongside AskProvider's other always-on pieces.
 * Injects the shared mascot CSS everywhere, and (while MASCOT_MOUSE_ENABLED
 * is true) the rare mouse scenes on Home. The cat itself is no longer a
 * global fixed overlay -- each page mounts its own MascotCorner where it
 * actually has blank space (see lib/mascot/mouseFlag.ts for why the mouse
 * is paused).
 */
export function MascotHost() {
  const pathname = usePathname();
  const { mobileMenuOpen, open: askOpen } = useAsk();
  const { enabled, ready } = useMascotEnabled();
  const reducedMotion = usePrefersReducedMotion();

  if (!ready) return null;

  const isHome = isHomePath(pathname);

  return (
    <>
      <MascotStyles />
      {MASCOT_MOUSE_ENABLED && isHome ? (
        <MascotScene enabled={enabled} reducedMotion={reducedMotion} suppressed={mobileMenuOpen || askOpen} />
      ) : null}
    </>
  );
}
