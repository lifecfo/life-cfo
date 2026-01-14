import "./globals.css";
import type { ReactNode } from "react";
import { ClientProviders } from "@/components/ClientProviders";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
