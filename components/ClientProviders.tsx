"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ToastProvider } from "./ui/Toast";
import { AppShell } from "./AppShell";

type ClientProvidersProps = {
  children: ReactNode;
};

export function ClientProviders({ children }: ClientProvidersProps) {
  const pathname = usePathname();
  const isAuthRoute = pathname?.startsWith("/auth");

  return (
    <ToastProvider>
      {isAuthRoute ? children : <AppShell>{children}</AppShell>}
    </ToastProvider>
  );
}
