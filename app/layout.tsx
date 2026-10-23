import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClientProviders } from "@/components/ClientProviders";
import { PRODUCT_DESCRIPTOR, PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";

function resolveMetadataBase() {
  const candidate = (process.env.NEXT_PUBLIC_SITE_URL || "https://life-cfo.com").trim();
  try {
    return new URL(candidate);
  } catch {
    return new URL("https://life-cfo.com");
  }
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: PRODUCT_NAME,
  description: `${PRODUCT_TAGLINE} ${PRODUCT_DESCRIPTOR}`,
  icons: {
    icon: "/brand/lifecfo-logo-icon-only.svg",
    shortcut: "/brand/lifecfo-logo-icon-only.svg",
    apple: "/brand/lifecfo-social-icon.png",
  },
  openGraph: {
    title: PRODUCT_NAME,
    description: `${PRODUCT_TAGLINE} ${PRODUCT_DESCRIPTOR}`,
    images: ["/brand/lifecfo-social-cover.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: PRODUCT_NAME,
    description: `${PRODUCT_TAGLINE} ${PRODUCT_DESCRIPTOR}`,
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
