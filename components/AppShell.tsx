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
import { PRODUCT_DESCRIPTOR, PRODUCT_NAME } from "@/lib/brand";
import { SampleProvider } from "@/lib/demo/sampleMode";

type AppShellProps = {
  children: ReactNode;
};

type NavLinkItem = {
  href: string;
  label: string;
  kind?: "link";
};

type NavSectionItem = {
  label: string;
  kind: "section";
};

type NavGroup = {
  label: string;
  items: Array<NavLinkItem | NavSectionItem>;
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

function isSidebarActivePath(pathname: string, href: string) {
  if (href === "/money") return pathname === "/money";
  return isActivePath(pathname, href);
}

function displayHouseholdName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "[DEMO] Family With One Main Income") {
    return "Demo · The Bennett Family";
  }
  if (trimmed === "[DEMO] Single Parent - Tight Budget") {
    return "Demo · Mia & Noah";
  }
  return trimmed;
}

function navIcon(href: string) {
  const shared = "h-4 w-4 text-zinc-600";
  const stroke = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  switch (href) {
    case "/lifecfo-home":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={shared} aria-hidden="true">
          <path d="M4 10.5 12 4l8 6.5" {...stroke} />
          <path d="M6.5 9.8V20h11V9.8" {...stroke} />
        </svg>
      );
    case "/start":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={shared} aria-hidden="true">
          <circle cx="12" cy="12" r="8" {...stroke} />
          <path d="M12 8.5v7M8.5 12h7" {...stroke} />
        </svg>
      );
    case "/bills":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={shared} aria-hidden="true">
          <path d="M7 3.5h10v17l-2.2-1.3L12.5 20.5 10.3 19.2 8 20.5 7 19.8V3.5z" {...stroke} />
          <path d="M9.5 8h5M9.5 11.5h5" {...stroke} />
        </svg>
      );
    case "/income":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={shared} aria-hidden="true">
          <path d="M12 4v8.5" {...stroke} />
          <path d="M8.5 10 12 13.5 15.5 10" {...stroke} />
          <path d="M5 14.5h3.4l1.3 2h4.6l1.3-2H19V20H5v-5.5z" {...stroke} />
        </svg>
      );
    case "/budget":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={shared} aria-hidden="true">
          <circle cx="12" cy="12" r="7.5" {...stroke} />
          <path d="M12 12V4.5" {...stroke} />
          <path d="M12 12l5.3 5.3" {...stroke} />
        </svg>
      );
    case "/spending":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={shared} aria-hidden="true">
          <path d="M5 19.5h14" {...stroke} />
          <path d="M8 19.5V11" {...stroke} />
          <path d="M12 19.5V6.5" {...stroke} />
          <path d="M16 19.5V14" {...stroke} />
        </svg>
      );
    case "/money/year":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={shared} aria-hidden="true">
          <rect x="4" y="5.5" width="16" height="14" rx="2" {...stroke} />
          <path d="M8 4v3M16 4v3M4 10h16" {...stroke} />
        </svg>
      );
    case "/decisions":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={shared} aria-hidden="true">
          <path d="M7 4.5h8.2A2 2 0 0 1 17.2 6.5V19.5H9a2 2 0 0 0-2 2V6.5a2 2 0 0 1 2-2z" {...stroke} />
          <path d="M9.5 9h5M9.5 12.5h4" {...stroke} />
          <path d="M15.2 16.2 18 13.4l1.4 1.4-2.8 2.8H15v-1.4z" {...stroke} />
        </svg>
      );
    case "/household":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={shared} aria-hidden="true">
          <circle cx="9" cy="8.2" r="2.2" {...stroke} />
          <circle cx="15.6" cy="9" r="1.7" {...stroke} />
          <path d="M4.6 18.5c.7-2.5 2.3-3.7 4.4-3.7s3.7 1.2 4.4 3.7" {...stroke} />
          <path d="M13.4 15c.7-.4 1.5-.6 2.4-.6 1.7 0 3 .9 3.6 2.8" {...stroke} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className={shared} aria-hidden="true">
          <circle cx="12" cy="12" r="3" {...stroke} />
        </svg>
      );
  }
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { open: askOpen, setShellSplitHostActive } = useAsk();

  useEffect(() => {
    setShellSplitHostActive(true);
    return () => setShellSplitHostActive(false);
  }, [setShellSplitHostActive]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [showSpending, setShowSpending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
            "/start",
            "/beta-invite",
            "/welcome",
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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/money/import/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((json: { imported?: boolean }) => {
        if (!cancelled) setShowSpending(Boolean(json?.imported));
      })
      .catch(() => {
        if (!cancelled) setShowSpending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const primaryLinks: NavLinkItem[] = useMemo(() => {
    const items: NavLinkItem[] = [
      { href: "/lifecfo-home", label: "Home" },
      { href: "/start", label: "Add things" },
      { href: "/bills", label: "Bills & renewals" },
      { href: "/income", label: "Income" },
      { href: "/budget", label: "Budget" },
    ];
    if (showSpending) items.push({ href: "/spending", label: "Spending" });
    items.push(
      { href: "/money/year", label: "Year ahead" },
      { href: "/decisions", label: "Decision notes" },
      { href: "/household", label: "Household" }
    );
    return items;
  }, [showSpending]);

  const sidebarGroups: NavGroup[] = useMemo(() => [{ label: "", items: primaryLinks }], [primaryLinks]);

  const activeHouseholdName = useMemo(() => {
    if (!activeHouseholdId) return null;
    const name = households.find((h) => h.id === activeHouseholdId)?.name;
    return name ? displayHouseholdName(name) : null;
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

  if (pathname === "/beta-invite") return <>{children}</>;

  const menuItemClass =
    "block w-full rounded-xl px-4 py-3 text-left text-sm text-zinc-800 transition hover:bg-zinc-50";

  const menuItemActiveClass =
    "block w-full rounded-xl px-4 py-3 text-left text-sm font-medium text-zinc-900 transition hover:bg-zinc-50";

  return (
    <SampleProvider>
    <div className="min-h-dvh bg-neutral-bg md:flex md:h-dvh md:flex-col md:overflow-hidden">
      <div className="sticky top-0 z-40 border-b border-zinc-100 bg-white">
        <div className={["mx-auto flex w-full items-center justify-between gap-2 px-4 py-3", askOpen ? "max-w-[1720px]" : "max-w-[1320px]"].join(" ")}>
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/lifecfo-home"
              className="flex items-center"
              aria-label={PRODUCT_DESCRIPTOR}
            >
              <Image
                src="/brand/lifecfo-horizontal-transparent.svg"
                alt={PRODUCT_NAME}
                width={170}
                height={40}
                priority
                className="h-auto w-[140px] sm:w-[170px]"
              />
            </Link>
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
              <div className="hidden sm:block text-xs text-zinc-500">Loading...</div>
            ) : null}

            <Chip
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Open menu"
            >
              Menu <span className="ml-1 opacity-70">v</span>
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
                          alt={PRODUCT_NAME}
                          width={150}
                          height={35}
                          className="h-auto w-[150px]"
                        />
                      </Link>
                    </div>

                    <nav className="grid max-h-[60vh] gap-1 overflow-y-auto" aria-label="Mobile navigation">
                      {sidebarGroups.flatMap((group) =>
                        group.items
                          .filter((item): item is NavLinkItem => item.kind !== "section")
                          .map((item) => {
                            const active = isActivePath(pathname || "", item.href);
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                className={`rounded-xl px-3 py-2 text-sm ${
                                  active
                                    ? "bg-zinc-100 font-medium text-zinc-900"
                                    : "text-zinc-800 hover:bg-zinc-50"
                                }`}
                                onClick={() => setMenuOpen(false)}
                              >
                                {item.label}
                              </Link>
                            );
                          })
                      )}
                    </nav>

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
                  ) : null}

                  <Link href="/settings" className={menuItemClass} onClick={() => setMenuOpen(false)}>
                    Settings
                  </Link>
                  <Link href="/how-life-cfo-works" className={menuItemClass} onClick={() => setMenuOpen(false)}>
                    How Life CFO works
                  </Link>
                  <Link href="/feedback" className={menuItemClass} onClick={() => setMenuOpen(false)}>
                    Feedback
                  </Link>
                  <Link href="/privacy" className={menuItemClass} onClick={() => setMenuOpen(false)}>
                    Privacy
                  </Link>
                  <Link href="/terms" className={menuItemClass} onClick={() => setMenuOpen(false)}>
                    Terms
                  </Link>
                  <Link href="/fine-print" className={menuItemClass} onClick={() => setMenuOpen(false)}>
                    Important information
                  </Link>

                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    disabled={signingOut}
                    className={menuItemClass}
                  >
                    {signingOut ? "Signing out..." : "Sign out"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={[
          "mx-auto w-full px-4 py-6 md:min-h-0 md:flex-1 md:py-4",
          askOpen ? "max-w-[1720px]" : "max-w-[1320px]",
        ].join(" ")}
      >
        <div className="md:flex md:h-full md:min-h-0 md:items-stretch md:gap-4">
          <aside
            className={[
              "hidden md:flex md:h-full md:min-h-0 md:shrink-0 md:flex-col md:gap-3 md:overflow-y-auto md:rounded-2xl md:border md:border-zinc-200 md:bg-white md:p-3",
              sidebarCollapsed ? "md:w-[88px]" : "md:w-[240px]",
            ].join(" ")}
            aria-label="Primary navigation"
          >
            <div className="mb-1 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSidebarCollapsed((v) => !v)}
                className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={sidebarCollapsed ? "Expand" : "Collapse"}
              >
                {sidebarCollapsed ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                    <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>

            <nav className="space-y-3">
              {sidebarGroups.map((group) => (
                <div key={group.label} className="space-y-1">
                  {!sidebarCollapsed && group.label ? (
                    <div className="px-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                      {group.label}
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    {group.items.map((it) => {
                      if (it.kind === "section") {
                        return sidebarCollapsed ? (
                          <div key={`${group.label}:${it.label}`} className="my-2 border-t border-zinc-100" />
                        ) : (
                          <div
                            key={`${group.label}:${it.label}`}
                            className="px-2 pt-3 text-[11px] font-medium uppercase tracking-wide text-zinc-400"
                          >
                            {it.label}
                          </div>
                        );
                      }

                      const active = isSidebarActivePath(pathname || "", it.href);
                      return (
                        <Link
                          key={it.href}
                          href={it.href}
                          className={[
                            "flex items-center rounded-xl px-2.5 py-2 text-sm transition",
                            sidebarCollapsed ? "justify-center" : "gap-2",
                            active
                              ? "bg-zinc-100 font-medium text-zinc-900"
                              : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900",
                          ].join(" ")}
                          title={sidebarCollapsed ? it.label : undefined}
                          aria-label={it.label}
                        >
                          {sidebarCollapsed ? (
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-zinc-100">
                              {navIcon(it.href)}
                            </span>
                          ) : (
                            <span>{it.label}</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </aside>

          <div className="min-w-0 flex-1 md:min-h-0">
            <div
              className={
                askOpen
                  ? "md:grid md:h-full md:min-h-0 md:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)] md:gap-4"
                  : "md:h-full md:min-h-0"
              }
            >
              <div className="min-h-0 md:h-full md:overflow-y-auto md:pr-1">{children}</div>
              {askOpen ? (
                <div className="hidden min-h-0 md:block">
                  <AskPanel mode="split" />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
    </SampleProvider>
  );
}

