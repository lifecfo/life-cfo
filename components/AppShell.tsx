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

  // Home is the main entry point.
  const lifecycleNav = [
    { href: "/home", label: "Home" },
    { href: "/capture", label: "Capture" },
    { href: "/framing", label: "Framing" },
    { href: "/thinking", label: "Thinking" },
    { href: "/decisions", label: "Decisions" },
    { href: "/revisit", label: "Revisit" },
    { href: "/chapters", label: "Chapters" },
  ];

  // Inputs (feed Home; not the experience)
  const inputsNav = [
    { href: "/accounts", label: "Accounts" },
    { href: "/bills", label: "Bills" },
    { href: "/income", label: "Income" },
    { href: "/investments", label: "Investments" },
  ];

  const isActive = (href: string) => {
    return pathname === href || (href !== "/" && pathname?.startsWith(href));
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const howHref = "/how-keystone-works";
  const howActive = isActive(howHref);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-[900px] flex-wrap items-center justify-between gap-3 p-4">
          <Link href="/home" className="text-sm font-semibold tracking-tight text-zinc-900 no-underline">
            Keystone
          </Link>

          <nav className="flex flex-wrap items-center gap-2" aria-label="Primary navigation">
            {lifecycleNav.map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href} className="no-underline">
                  <Chip active={active} aria-current={active ? "page" : undefined}>
                    {item.label}
                  </Chip>
                </Link>
              );
            })}

            {/* subtle separation between lifecycle and inputs */}
            <span className="mx-1 h-5 w-px bg-zinc-200" aria-hidden="true" />

            {inputsNav.map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href} className="no-underline">
                  <Chip active={active} aria-current={active ? "page" : undefined}>
                    {item.label}
                  </Chip>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {/* Global trust explainer link (quiet + optional) */}
            <Link href={howHref} className="no-underline">
              <Chip
                // keep it softer than primary nav chips
                className={howActive ? "" : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"}
                active={howActive}
                aria-current={howActive ? "page" : undefined}
                title="How Keystone works"
              >
                How it works
              </Chip>
            </Link>

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
