// components/AppShell.tsx
"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
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

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

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

  return (
    <div className="min-h-dvh bg-[#faf7f2]">
      <div className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-3 px-4 py-3">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <Link href="/home" className="text-sm font-semibold text-zinc-900">
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
              <div className="absolute right-0 mt-2 w-[220px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="px-3 py-2 text-xs font-semibold text-zinc-700">Menu</div>

                <div className="grid">
                  <Link
                    href="/settings"
                    className="px-3 py-3 text-sm text-zinc-800 hover:bg-zinc-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    Settings
                  </Link>

                  <Link
                    href="/family"
                    className="px-3 py-3 text-sm text-zinc-800 hover:bg-zinc-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    Family
                  </Link>

                  <div className="h-px bg-zinc-100" />

                  <Link
                    href="/how-keystone-works"
                    className="px-3 py-3 text-sm text-zinc-800 hover:bg-zinc-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    How it works
                  </Link>

                  <Link
                    href="/planned-upgrades"
                    className="px-3 py-3 text-sm text-zinc-800 hover:bg-zinc-50"
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
