// components/AppShell.tsx
"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Chip } from "./ui";

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
      const el = ref.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      onOutside();
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [ref, onOutside, enabled]);
}

function Menu({
  label,
  active,
  items,
  align = "left",
  onNavigate,
}: {
  label: string;
  active?: boolean;
  items: NavItem[];
  align?: "left" | "right";
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useOutsideClick(ref, () => setOpen(false), open);

  return (
    <div className="relative" ref={ref}>
      <Chip active={!!active} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} title={label}>
        {label} <span className="ml-1 text-xs opacity-60 leading-none">▾</span>
      </Chip>

      {open ? (
        <div
          role="menu"
          className={[
            // ✅ hug contents, no forced width
            "absolute z-50 mt-2 w-max max-w-[240px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm",
            align === "right" ? "right-0" : "left-0",
          ].join(" ")}
        >
          <div className="p-1">
            <div className="space-y-0.5">
              {items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className="block no-underline"
                  onClick={() => {
                    setOpen(false);
                    onNavigate?.();
                  }}
                >
                  {/* ✅ prevent wrapping-induced wide boxes + keep tight */}
                  <div className="whitespace-nowrap rounded-lg px-2 py-1 text-sm leading-tight text-zinc-800 hover:bg-zinc-50">
                    {it.label}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) => pathname === href || (href !== "/" && pathname?.startsWith(href));

  const home: NavItem = { href: "/home", label: "Home" };
  const family: NavItem = { href: "/family", label: "Family" };

  const decideItems: NavItem[] = [
    { href: "/capture", label: "Capture" },
    { href: "/framing", label: "Framing" },
    { href: "/thinking", label: "Thinking" },
  ];

  // NOTE: route stays /revisit, label is user-facing "Review"
  const reviewItems: NavItem[] = [
    { href: "/decisions", label: "Decisions" },
    { href: "/revisit", label: "Review" },
    { href: "/chapters", label: "Chapters" },
  ];

  const moneyItems: NavItem[] = [
    { href: "/accounts", label: "Accounts" },
    { href: "/bills", label: "Bills" },
    { href: "/income", label: "Income" },
    { href: "/investments", label: "Investments" },
    { href: "/budget", label: "Budget" },
    { href: "/transactions", label: "Transactions" },
  ];

  const decideActive = useMemo(() => decideItems.some((i) => isActive(i.href)), [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  const reviewActive = useMemo(() => reviewItems.some((i) => isActive(i.href)), [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  const moneyActive = useMemo(() => moneyItems.some((i) => isActive(i.href)), [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const navKey = pathname ?? "";

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-3 p-4">
          <Link href="/home" className="text-sm font-semibold tracking-tight text-zinc-900 no-underline">
            Keystone
          </Link>

          <nav key={navKey} className="flex items-center gap-2" aria-label="Primary navigation">
            <Link href={home.href} className="no-underline">
              <Chip active={isActive(home.href)} aria-current={isActive(home.href) ? "page" : undefined}>
                {home.label}
              </Chip>
            </Link>

            <Menu label="Decide" active={decideActive} items={decideItems} />
            <Menu label="Review" active={reviewActive} items={reviewItems} />

            <Link href={family.href} className="no-underline">
              <Chip active={isActive(family.href)} aria-current={isActive(family.href) ? "page" : undefined}>
                {family.label}
              </Chip>
            </Link>

            <Menu label="Money" active={moneyActive} items={moneyItems} />
          </nav>

          <div className="flex items-center gap-2">
            <AccountMenu onSignOut={signOut} />
          </div>
        </div>
      </header>

      <div>{children}</div>
    </div>
  );
}

function AccountMenu({ onSignOut }: { onSignOut: () => void }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useOutsideClick(ref, () => setOpen(false), open);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="relative" ref={ref}>
      <Chip
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Menu"
        className="border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
      >
        Menu <span className="ml-1 text-xs opacity-60 leading-none">▾</span>
      </Chip>

      {open ? (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-max max-w-[260px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="p-1">
            <div className="space-y-0.5">
              <Link href="/settings" className="block no-underline" onClick={() => setOpen(false)}>
                <div className="whitespace-nowrap rounded-lg px-2 py-1 text-sm leading-tight text-zinc-800 hover:bg-zinc-50">Settings</div>
              </Link>

              <Link href="/how-keystone-works" className="block no-underline" onClick={() => setOpen(false)}>
                <div className="whitespace-nowrap rounded-lg px-2 py-1 text-sm leading-tight text-zinc-800 hover:bg-zinc-50">How it works</div>
              </Link>

              <Link href="/feedback" className="block no-underline" onClick={() => setOpen(false)}>
                <div className="whitespace-nowrap rounded-lg px-2 py-1 text-sm leading-tight text-zinc-800 hover:bg-zinc-50">Feedback</div>
              </Link>

              <Link href="/demo" className="block no-underline" onClick={() => setOpen(false)}>
                <div className="whitespace-nowrap rounded-lg px-2 py-1 text-sm leading-tight text-zinc-800 hover:bg-zinc-50">Demo</div>
              </Link>

              <Link href="/fine-print" className="block no-underline" onClick={() => setOpen(false)}>
                <div className="whitespace-nowrap rounded-lg px-2 py-1 text-sm leading-tight text-zinc-800 hover:bg-zinc-50">Fine print</div>
              </Link>

              <div className="my-1 h-px bg-zinc-100" />

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
                className="w-full whitespace-nowrap rounded-lg px-2 py-1 text-left text-sm leading-tight text-zinc-800 hover:bg-zinc-50"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
