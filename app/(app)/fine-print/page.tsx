"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import FinePrintClient from "./FinePrintClient";
import FinePrintReadOnly from "./FinePrintReadOnly";

export const dynamic = "force-dynamic";

type ProfileRow = {
  fine_print_accepted_at: string | null;
  fine_print_version: string | null;
  fine_print_signed_name: string | null;
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function FinePrintInner() {
  const searchParams = useSearchParams();

  const nextPath = useMemo(() => {
    const n = safeStr(searchParams?.get("next"));
    if (!n || !n.startsWith("/")) return "/home";
    return n;
  }, [searchParams]);

  const [status, setStatus] = useState<"loading" | "signed_out" | "ready">("loading");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      setStatus("loading");

      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (!alive) return;

      if (authErr || !auth?.user) {
        setStatus("signed_out");
        setProfile(null);
        return;
      }

      const response = await fetch("/api/legal/status", { cache: "no-store" });
      const json = (await response.json().catch(() => null)) as {
        matches?: boolean;
        signed_name?: string | null;
        accepted_at?: string | null;
        current_sha256?: string;
      } | null;

      if (!alive) return;

      if (!response.ok || !json) {
        setProfile(null);
        setComplete(false);
        setStatus("ready");
        return;
      }

      setComplete(json.matches === true);
      setProfile({
        fine_print_accepted_at: json.accepted_at ?? null,
        fine_print_version: json.current_sha256 ?? null,
        fine_print_signed_name: json.signed_name ?? null,
      });
      setStatus("ready");
    })();

    return () => {
      alive = false;
    };
  }, []);

  const hasSigned = complete;

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-4">
      {status === "loading" ? (
        <div className="text-sm text-zinc-600">Loading…</div>
      ) : status === "signed_out" ? (
        <div className="text-sm text-zinc-600">Please sign in.</div>
      ) : hasSigned ? (
        <FinePrintReadOnly
          signedName={profile?.fine_print_signed_name ?? ""}
          signedAt={profile?.fine_print_accepted_at ?? ""}
          version={profile?.fine_print_version ?? "—"}
        />
      ) : (
        <FinePrintClient nextPath={nextPath} />
      )}
    </div>
  );
}

export default function FinePrintPage() {
  return (
    <Page
      title="Before you start"
      subtitle="Life CFO organises what a household types. It does not connect banks or tell you what to do."
    >
      <Suspense fallback={<div className="mx-auto w-full max-w-[760px] text-sm text-zinc-600">Loading…</div>}>
        <FinePrintInner />
      </Suspense>
    </Page>
  );
}
