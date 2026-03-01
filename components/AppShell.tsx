// components/AppShell.tsx
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

type HouseholdItem = {
  id: string;
  name: string;
  role: string;
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

  // Household state (we still load it for: guard + showing active name)
  const [households, setHouseholds] = useState<HouseholdItem[]>([]);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const [householdsLoading, setHouseholdsLoading] = useState(false);
  const [needsHousehold, setNeedsHousehold] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadHouseholds() {
      setHouseholdsLoading(true);
      try {
        const res = await fetch("/api/households", { method: "GET" });
        const json = await res.json();

        if (cancelled) return;

        if (json?.ok) {
          const list = Array.isArray(json.households) ? json.households : [];
          setHouseholds(list);
          setActiveHouseholdId(json.active_household_id ?? null);
          setNeedsHousehold(!!json.needs_household);

          // Gentle guard: if they need a household, route them to /household
          const p = pathname || "";
          const allow = new Set([
            "/household",
            "/invites",
            "/settings",
            "/fine-print",
            "/how-life-cfo-works",
            "/planned-upgrades",
            "/login",
          ]);

          const isAllowed =
            Array.from(allow).some((a) => p === a || p.startsWith(a + "/")) || p.startsWith("/api") || p.startsWith("/auth");

          if (!!json.needs_household && !isAllowed) {
            router.push("/household");
          }
        } else {
          setHouseholds([]);
          setActiveHouseholdId(null);
          setNeedsHousehold(false);
        }
      } catch {
        if (!cancelled) {
          setHouseholds([]);
          setActiveHouseholdId(null);
          setNeedsHousehold(false);
        }
      } finally {
        if (!cancelled) setHouseholdsLoading(false);
      }
    }

    loadHouseholds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, pathname]);

  const activeHouseholdName = useMemo(() => {
    if (!activeHouseholdId) return null;
    return households.find((h) => h.id === activeHouseholdId)?.name ?? null;
  }, [households, activeHouseholdId]);

  return (
    <div className="min-h-dvh bg-white">
      <div className="sticky top-0 z-40 border-b border-zinc-100 bg-white">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/lifecfo-home" className="text-sm font-semibold text-zinc-900">
              Life CFO
            </Link>
          </div>

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

          <div ref={menuRef} className="relative flex items-center justify-end">
            <Chip onClick={() => setMenuOpen((v) => !v)}>
              Menu <span className="ml-1 opacity-70">▾</span>
            </Chip>

            {menuOpen ? (
              <div className="absolute right-0 top-full z-50 mt-2 w-[280px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
                <div className="grid">
                  {needsHousehold ? (
                    <Link
                      href="/household"
                      className="border-b border-zinc-100 px-4 py-3 text-sm text-zinc-900 hover:bg-zinc-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      Set up household
                    </Link>
                  ) : (
                    <div className="border-b border-zinc-100 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-zinc-500">Household</div>
                        <div className="text-xs text-zinc-500">{householdsLoading ? "Loading…" : ""}</div>
                      </div>
                      <div className="mt-1 text-sm font-medium text-zinc-900">{activeHouseholdName ?? "—"}</div>
                    </div>
                  )}

                  {!needsHousehold ? (
                    <Link
                      href="/household"
                      className="px-4 py-3 text-sm text-zinc-800 hover:bg-zinc-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      Household
                    </Link>
                  ) : null}

                  <Link href="/invites" className="px-4 py-3 text-sm text-zinc-800 hover:bg-zinc-50" onClick={() => setMenuOpen(false)}>
                    Invites
                  </Link>

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