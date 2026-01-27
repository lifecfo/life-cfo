// app/(app)/fine-print/page.tsx
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

      const uid = auth.user.id;

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("fine_print_accepted_at,fine_print_version,fine_print_signed_name")
        .eq("id", uid)
        .maybeSingle();

      if (!alive) return;

      if (profErr) {
        setProfile(null);
        setStatus("ready");
        return;
      }

      setProfile((prof ?? null) as any);
      setStatus("ready");
    })();

    return () => {
      alive = false;
    };
  }, []);

  const hasSigned = !!profile?.fine_print_accepted_at;

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
    <Page title="Fine print" subtitle="Plain-language boundaries. Trust comes from clarity.">
      <Suspense fallback={<div className="mx-auto w-full max-w-[760px] text-sm text-zinc-600">Loading…</div>}>
        <FinePrintInner />
      </Suspense>
    </Page>
  );
}
