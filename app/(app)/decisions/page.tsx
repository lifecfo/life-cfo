import { Suspense } from "react";
import DecisionsClient from "./DecisionsClient";

export const dynamic = "force-dynamic";

export default function DecisionsPage() {
  return (
    <Suspense fallback={null}>
      <DecisionsClient />
    </Suspense>
  );
}
