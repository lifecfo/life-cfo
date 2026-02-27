// app/(app)/AppShell.tsx
"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Chip } from "@/components/ui";

type AppShellProps = {
  children: ReactNode;
};

type NavItem = {
  href: string;
  label: string;
};

function useOutsideClick(ref: RefObject<HTMLElement | null>, onOutside: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onOutside();
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [ref, onOutside, enabled]);
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/home") return pathname === "/home" || pathname === "/lifecfo-home";
  return pathname === href || pathname.startsWith(href + "/");
}

type HouseholdMemberRow = {
  household_id: string;
  role: "owner" | "editor" | "viewer" | string;
  household_name: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error || (json as any)?.message || "Request failed");
  return json as T;
}

async function postJson<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error || (json as any)?.message || "Request failed");
  return json as T;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const topNav: NavItem[] = useMemo(
    () => [
      { href: "/lifecfo-home", label: "Home" },
      { href: "/money", label: "Money" },
      { href: "/decisions", label: "Decisions" },
    ],
    []
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useOutsideClick(menuRef, () => setMenuOpen(false), menuOpen);

  // Household selector (menu-only)
  const [hhLoading, setHhLoading] = useState(false);
  const [hhError, setHhError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<HouseholdMemberRow[]>([]);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  const activeHousehold = useMemo(() => {
    if (!memberships.length) return null;
    const exact = activeHouseholdId ? memberships.find((m) => m.household_id === activeHouseholdId) : null;
    return exact ?? memberships[0] ?? null;
  }, [memberships, activeHouseholdId]);

  // Only fetch when menu opens (keeps app quiet/fast)
  useEffect(() => {
    if (!menuOpen) return;
    let alive = true;

    (async () => {
      setHhLoading(true);
      setHhError(null);
      try {
        const data = await fetchJson<{
          ok: boolean;
          active_household_id: string | null;
          memberships: HouseholdMemberRow[];
        }>("/api/households");

        if (!alive) return;
        setMemberships(data.memberships ?? []);
        setActiveHouseholdId(data.active_household_id ?? null);
      } catch (e: any) {
        if (!alive) return;
        setHhError(e?.message ?? "Couldn’t load households.");
      } finally {
        if (!alive) return;
        setHhLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [menuOpen]);

  const showHouseholdSection = memberships.length > 1;

  const switchHousehold = async (household_id: string) => {
    if (!household_id) return;
    if (switching) return;

    setSwitching(household_id);
    setHhError(null);
    try {
      await postJson<{ ok: boolean; active_household_id: string }>("/api/households/active", { household_id });
      setActiveHouseholdId(household_id);

      // Close menu and refresh the app context
      setMenuOpen(false);
      router.refresh();
    } catch (e: any) {
      setHhError(e?.message ?? "Couldn’t switch household.");
    } finally {
      setSwitching(null);
    }
  };

  return (
    <div className="min-h-dvh bg-white">
      <div className="sticky top-0 z-40 border-b border-zinc-100 bg-white">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-3 px-4 py-3">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <Link href="/lifecfo-home" className="text-sm font-semibold text-zinc-900">
              Life CFO
            </Link>
          </div>

          {/* Top tabs */}
          <div className="flex flex-1 items-center justify-center gap-2">
            {topNav.map((it) => {
              const active = isActivePath(pathname || "", it.href);
              return (
                <Link key={it.href} href={it.href}>
                  <Chip active={active}>{it.label}</Chip>
                </Link>
              );
            })}
          </div>

          {/* Menu dropdown */}
          <div ref={menuRef} className="relative flex items-center justify-end">
            <Chip onClick={() => setMenuOpen((v) => !v)}>
              Menu <span className="ml-1 opacity-70">▾</span>
            </Chip>

            {menuOpen ? (
              <div className="absolute right-0 top-full z-50 mt-2 w-[260px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
                <div className="grid">
                  {showHouseholdSection ? (
                    <div className="border-b border-zinc-100 px-4 py-3">
                      <div className="text-[11px] font-semibold text-zinc-500">Household</div>

                      <div className="mt-1 text-sm font-medium text-zinc-900">
                        {hhLoading ? "Loading…" : activeHousehold?.household_name || "—"}
                      </div>

                      <div className="mt-2 grid gap-1">
                        {(memberships ?? []).map((m) => {
                          const isActive = (activeHouseholdId ?? activeHousehold?.household_id) === m.household_id;
                          return (
                            <button
                              key={m.household_id}
                              type="button"
                              onClick={() => void switchHousehold(m.household_id)}
                              disabled={switching !== null || isActive}
                              className={[
                                "w-full rounded-xl px-3 py-2 text-left text-sm",
                                isActive ? "bg-zinc-50 text-zinc-900" : "hover:bg-zinc-50 text-zinc-800",
                                switching === m.household_id ? "opacity-70" : "",
                              ].join(" ")}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate">{m.household_name}</span>
                                <span className="text-[11px] text-zinc-500">
                                  {isActive ? "Active" : switching === m.household_id ? "Switching…" : ""}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {hhError ? <div className="mt-2 text-xs text-rose-600">{hhError}</div> : null}
                    </div>
                  ) : null}

                  <Link href="/settings" className="px-4 py-3 text-sm text-zinc-800 hover:bg-zinc-50" onClick={() => setMenuOpen(false)}>
                    Settings
                  </Link>

                  <Link href="/family" className="px-4 py-3 text-sm text-zinc-800 hover:bg-zinc-50" onClick={() => setMenuOpen(false)}>
                    Family
                  </Link>

                  <Link href="/fine-print" className="px-4 py-3 text-sm text-zinc-800 hover:bg-zinc-50" onClick={() => setMenuOpen(false)}>
                    Fine print
                  </Link>

                  <Link
                    href="/how-life-cfo-works"
                    className="px-4 py-3 text-sm text-zinc-800 hover:bg-zinc-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    How it works
                  </Link>

                  <Link
                    href="/planned-upgrades"
                    className="px-4 py-3 text-sm text-zinc-800 hover:bg-zinc-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    Planned upgrades
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1100px] px-4 py-6">{children}</div>
    </div>
  );
}