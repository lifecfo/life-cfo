"use client";

import type { ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Chip } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { useAsk } from "@/components/ask/AskProvider";
import { AskPanel } from "@/components/ask/AskPanel";

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

function useOutsideClick(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled: boolean
) {
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
  const { open: askOpen, setShellSplitHostActive } = useAsk();

  useEffect(() => {
    setShellSplitHostActive(true);
    return () => setShellSplitHostActive(false);
  }, [setShellSplitHostActive]);

  const topNav: NavItem[] = useMemo(
    () => [
      { href: "/lifecfo-home", label: "Home" },
      { href: "/money", label: "Money" },
      { href: "/decisions", label: "Decisions" },
    ],
    []
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useOutsideClick(menuRef, () => setMenuOpen(false), menuOpen);

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

          const p = pathname || "";
          const allow = new Set([
            "/household",
            "/settings",
            "/fine-print",
            "/how-life-cfo-works",
            "/planned-upgrades",
            "/login",
          ]);

          const isAllowed =
            Array.from(allow).some((a) => p === a || p.startsWith(a + "/")) ||
            p.startsWith("/api") ||
            p.startsWith("/auth");

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
    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  const activeHouseholdName = useMemo(() => {
    if (!activeHouseholdId) return null;
    return households.find((h) => h.id === activeHouseholdId)?.name ?? null;
  }, [households, activeHouseholdId]);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);

    try {
      await supabase.auth.signOut();
      setMenuOpen(false);
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  const menuItemClass =
    "block w-full rounded-xl px-4 py-3 text-left text-sm text-zinc-800 transition hover:bg-zinc-50";

  const menuItemActiveClass =
    "block w-full rounded-xl px-4 py-3 text-left text-sm font-medium text-zinc-900 transition hover:bg-zinc-50";

  return (
    <div className="min-h-dvh bg-white">
      <div className="sticky top-0 z-40 border-b border-zinc-100 bg-white">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/lifecfo-home"
              className="flex items-center"
              aria-label="Life CFO home"
            >
              <Image
                src="/brand/lifecfo-horizontal-transparent.svg"
                alt="Life CFO"
                width={170}
                height={40}
                priority
                className="h-auto w-[140px] sm:w-[170px]"
              />
            </Link>
          </div>

          <div className="hidden flex-1 items-center justify-center gap-2 sm:flex">
            {topNav.map((it) => {
              const active = isActivePath(pathname || "", it.href);
              return (
                <Link key={it.href} href={it.href}>
                  <Chip active={active}>{it.label}</Chip>
                </Link>
              );
            })}
          </div>

          <div ref={menuRef} className="relative flex items-center justify-end gap-3">
            {!needsHousehold && activeHouseholdName ? (
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <div className="text-[11px] text-zinc-500">Active household</div>
                <div className="max-w-[220px] truncate text-sm font-medium text-zinc-900">
                  {activeHouseholdName}
                </div>
              </div>
            ) : householdsLoading ? (
              <div className="hidden sm:block text-xs text-zinc-500">Loading…</div>
            ) : null}

            <Chip onClick={() => setMenuOpen((v) => !v)}>
              Menu <span className="ml-1 opacity-70">▾</span>
            </Chip>

            {menuOpen ? (
              <div className="absolute right-0 top-full z-50 mt-2 w-[280px] rounded-2xl border border-zinc-200 bg-white p-2 shadow-lg">
                <div className="grid gap-1">
                  <div className="px-2 py-2 sm:hidden">
                    <div className="mb-3">
                      <Link
                        href="/lifecfo-home"
                        className="inline-flex items-center"
                        onClick={() => setMenuOpen(false)}
                      >
                        <Image
                          src="/brand/lifecfo-horizontal-transparent.svg"
                          alt="Life CFO"
                          width={150}
                          height={35}
                          className="h-auto w-[150px]"
                        />
                      </Link>
                    </div>

                    <div className="grid gap-1">
                      {topNav.map((it) => {
                        const active = isActivePath(pathname || "", it.href);
                        return (
                          <Link
                            key={it.href}
                            href={it.href}
                            className={`rounded-xl px-3 py-2 text-sm ${
                              active
                                ? "bg-zinc-100 font-medium text-zinc-900"
                                : "text-zinc-800 hover:bg-zinc-50"
                            }`}
                            onClick={() => setMenuOpen(false)}
                          >
                            {it.label}
                          </Link>
                        );
                      })}
                    </div>

                    {!needsHousehold && activeHouseholdName ? (
                      <div className="mt-3 px-1">
                        <div className="text-[11px] text-zinc-500">Active household</div>
                        <div className="truncate text-sm font-medium text-zinc-900">
                          {activeHouseholdName}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {needsHousehold ? (
                    <Link
                      href="/household"
                      className={menuItemActiveClass}
                      onClick={() => setMenuOpen(false)}
                    >
                      Set up household
                    </Link>
                  ) : (
                    <Link
                      href="/household"
                      className={menuItemClass}
                      onClick={() => setMenuOpen(false)}
                    >
                      Household
                    </Link>
                  )}

                  <Link
                    href="/settings"
                    className={menuItemClass}
                    onClick={() => setMenuOpen(false)}
                  >
                    Settings
                  </Link>

                  <Link
                    href="/family"
                    className={menuItemClass}
                    onClick={() => setMenuOpen(false)}
                  >
                    Family
                  </Link>

                  <Link
                    href="/fine-print"
                    className={menuItemClass}
                    onClick={() => setMenuOpen(false)}
                  >
                    Fine print
                  </Link>

                  <Link
                    href="/how-life-cfo-works"
                    className={menuItemClass}
                    onClick={() => setMenuOpen(false)}
                  >
                    How it works
                  </Link>

                  <Link
                    href="/planned-upgrades"
                    className={menuItemClass}
                    onClick={() => setMenuOpen(false)}
                  >
                    Planned upgrades
                  </Link>

                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    disabled={signingOut}
                    className={menuItemClass}
                  >
                    {signingOut ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={[
          "mx-auto w-full px-4 py-6",
          askOpen ? "max-w-[1480px]" : "max-w-[1100px]",
        ].join(" ")}
      >
        {askOpen ? (
          <>
            <div className="hidden md:grid md:h-[calc(100dvh-110px)] md:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)] md:gap-4">
              <div className="min-h-0 overflow-y-auto pr-1">{children}</div>
              <div className="min-h-0">
                <AskPanel mode="split" />
              </div>
            </div>
            <div className="md:hidden">{children}</div>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
