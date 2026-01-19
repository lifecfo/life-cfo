// components/AppShell.tsx
"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button, Chip } from "./ui";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const nav = [
// Home is the main entry point. /inbox remains as an internal alias.
    { href: "/home", label: "Home" },
    { href: "/capture", label: "Capture" },
    { href: "/decisions", label: "Decisions" },
    { href: "/accounts", label: "Accounts" },
    { href: "/bills", label: "Bills" },
    { href: "/income", label: "Income" },
    // Engine intentionally removed from nav (UI-only)
  ];

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-[900px] flex-wrap items-center justify-between gap-3 p-4">
          <Link href="/inbox" className="text-sm font-semibold tracking-tight text-zinc-900 no-underline">
            Keystone
          </Link>

          <nav className="flex flex-wrap items-center gap-2">
            {nav.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));

              return (
                <Link key={item.href} href={item.href} className="no-underline">
                  <Chip active={active}>{item.label}</Chip>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div>{children}</div>
    </div>
  );
}
