"use client";

import { Page } from "@/components/Page";
import { PRODUCT_DESCRIPTOR } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default function DemoPage() {
  return (
    <Page title="Not part of this beta" subtitle={PRODUCT_DESCRIPTOR}>
      <p className="mx-auto max-w-xl text-sm leading-6 text-zinc-600">
        This page is not part of the typed-household beta.
      </p>
    </Page>
  );
}
