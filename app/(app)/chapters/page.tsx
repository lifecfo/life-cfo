// app/(app)/chapters/page.tsx
"use client";

import ChaptersClient from "./ChaptersClient";

export const dynamic = "force-dynamic";

export default function ChaptersPage() {
  return <ChaptersClient />;
}
