import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClientProviders } from "@/components/ClientProviders";

export const metadata: Metadata = {
  title: "Life CFO",
  description: "Decision Intelligence.",
  icons: {
    icon: "/brand/lifecfo-logo-icon-only.svg",
    shortcut: "/brand/lifecfo-logo-icon-only.svg",
    apple: "/brand/lifecfo-social-icon.png",
  },
  openGraph: {
    title: "Life CFO",
    description: "Decision Intelligence.",
    images: ["/brand/lifecfo-social-cover.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Life CFO",
    description: "Decision Intelligence.",
    images: ["/brand/lifecfo-social-cover.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}