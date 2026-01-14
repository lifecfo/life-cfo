"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";

type ClientProvidersProps = {
  children: ReactNode;
};

export function ClientProviders({ children }: ClientProvidersProps) {
  return <ToastProvider>{children}</ToastProvider>;
}
