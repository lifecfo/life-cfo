import { Suspense } from "react";
import ResetClient from "./ResetClient";

export default function ResetPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            fontFamily: "system-ui",
            background: "#1F5E5C",
            color: "#FFFFFF",
          }}
        >
          Loading…
        </div>
      }
    >
      <ResetClient />
    </Suspense>
  );
}
