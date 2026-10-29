"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAsk } from "@/components/ask/AskProvider";
import { useMascotEnabled, usePrefersReducedMotion } from "@/lib/mascot/prefs";
import { MascotStyles } from "./mascotStyles";
import { CatMascot } from "./CatMascot";
import { MascotScene } from "./MascotScene";

const CELEBRATE_FLAG_KEY = "lifecfo-mascot-celebrate";

function isHomePath(pathname: string | null): boolean {
  return pathname === "/home" || pathname === "/lifecfo-home";
}

/**
 * Mounted once, globally, alongside AskProvider's other always-on pieces.
 * Decides whether the ambient ("Home: bottom corner") cat and the rare
 * mouse scenes are eligible to show at all -- Home only, never while the
 * mobile Menu or Ask panel is open. Everywhere else (empty states,
 * small-win celebrations) renders its own CatMascot instance locally, so
 * this host only owns the Home-page ambient behaviour.
 */
export function MascotHost() {
  const pathname = usePathname();
  const { mobileMenuOpen, open: askOpen } = useAsk();
  const { enabled, ready } = useMascotEnabled();
  const reducedMotion = usePrefersReducedMotion();

  const [sceneSuppressed, setSceneSuppressed] = useState(false);
  const [celebrateKey, setCelebrateKey] = useState(0);
  const checkedCelebrateRef = useRef(false);

  const isHome = isHomePath(pathname);

  useEffect(() => {
    if (!isHome || checkedCelebrateRef.current) return;
    checkedCelebrateRef.current = true;
    try {
      if (window.sessionStorage.getItem(CELEBRATE_FLAG_KEY) === "1") {
        window.sessionStorage.removeItem(CELEBRATE_FLAG_KEY);
        setCelebrateKey((n) => n + 1);
      }
    } catch {
      /* private mode */
    }
  }, [isHome]);

  if (!ready) return null;

  const suppressed = mobileMenuOpen || askOpen || sceneSuppressed;

  return (
    <>
      <MascotStyles />
      {isHome ? (
        <>
          <CatMascot variant="ambient" enabled={enabled} reducedMotion={reducedMotion} suppressed={suppressed} />
          <CatMascot variant="celebrate" enabled={enabled} reducedMotion={reducedMotion} celebrateKey={celebrateKey} />
          <MascotScene
            enabled={enabled}
            reducedMotion={reducedMotion}
            suppressed={mobileMenuOpen || askOpen}
            onSceneStart={() => setSceneSuppressed(true)}
            onSceneEnd={() => setSceneSuppressed(false)}
          />
        </>
      ) : null}
    </>
  );
}

/** Called right before navigating to Home after creating a household. */
export function markMascotCelebrateOnNextHome(): void {
  try {
    window.sessionStorage.setItem(CELEBRATE_FLAG_KEY, "1");
  } catch {
    /* private mode */
  }
}
