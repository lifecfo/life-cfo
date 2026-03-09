"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { AskProvider } from "@/components/ask/AskProvider";
import { AskLauncher } from "@/components/ask/AskLauncher";
import { AskPanel } from "@/components/ask/AskPanel";

type ClientProvidersProps = {
  children: ReactNode;
};

export function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <ToastProvider>
      <AskProvider>
        {children}
        <AskLauncher />
        <AskPanel />
      </AskProvider>
    </ToastProvider>
  );
}