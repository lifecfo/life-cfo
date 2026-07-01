"use client";

import { useEffect, useState } from "react";

type AccessState = {
  loading: boolean;
  isDemoBeta: boolean;
  isDeveloper: boolean;
  canUseRealDataSources: boolean;
};

const LOCKED_ACCESS: AccessState = {
  loading: true,
  isDemoBeta: false,
  isDeveloper: false,
  canUseRealDataSources: false,
};

export function useLifeCfoAccess(): AccessState {
  const [access, setAccess] = useState<AccessState>(LOCKED_ACCESS);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/access", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled) return;
        setAccess({
          loading: false,
          isDemoBeta: data.isDemoBeta === true,
          isDeveloper: data.isDeveloper === true,
          canUseRealDataSources:
            response.ok && data.canUseRealDataSources === true,
        });
      })
      .catch(() => {
        if (!cancelled) setAccess({ ...LOCKED_ACCESS, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return access;
}
