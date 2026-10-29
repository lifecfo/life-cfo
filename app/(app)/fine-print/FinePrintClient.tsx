// app/(app)/fine-print/FinePrintClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { resolvePostFinePrintDestination } from "@/lib/http/resolvePostFinePrintDestination";
import { Card, CardContent, Chip, Button, useToast } from "@/components/ui";
import { australiaSoftWarning, birthYearIsAdult } from "@/lib/onboarding/suitability";
import ImportantInformationContent from "./ImportantInformationContent";

export const dynamic = "force-dynamic";

type FinePrintClientProps = {
  nextPath: string;
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

export default function FinePrintClient({ nextPath }: FinePrintClientProps) {
  const router = useRouter();
  const toastApi = useToast();

  const toast = (message: string) => {
    if (toastApi?.showToast) {
      toastApi.showToast({ message });
      return;
    }
    if (toastApi?.toast) {
      toastApi.toast({ description: message });
    }
  };

  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [adult, setAdult] = useState(false);
  const [resident, setResident] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [localeWarning, setLocaleWarning] = useState<string | null>(null);

  const parsedYear = Number(birthYear);
  const yearOk = birthYear.trim().length === 4 && birthYearIsAdult(parsedYear);

  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const locale = navigator.language;
    setLocaleWarning(australiaSoftWarning(timeZone, locale));
  }, []);

  const canSave = useMemo(
    () => name.trim().length >= 2 && adult && resident && yearOk && !working,
    [adult, name, resident, working, yearOk]
  );

  const save = async () => {
    setStatus("");

    if (!canSave) {
      const msg = "Confirm you are 18 or older, live in Australia, enter your birth year, and type your name.";
      setStatus(msg);
      toast(msg);
      return;
    }

    setWorking(true);

    try {
      const { data: auth, error: authErr } = await supabase.auth.getUser();

      if (authErr || !auth?.user) {
        const msg = "Please sign in again.";
        setStatus(msg);
        toast(msg);
        router.push("/login");
        return;
      }

      const response = await fetch("/api/legal/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          signed_name: name.trim(),
          confirmed_adult: true,
          confirmed_au_resident: true,
          birth_year: parsedYear,
          time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          locale: navigator.language,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string; locale_warning?: string | null };
      if (json.locale_warning) setLocaleWarning(json.locale_warning);
      if (!response.ok) {
        throw new Error(json.error || "Couldn't save. Please try again.");
      }

      toast("Saved.");

      let needsHousehold = false;
      try {
        const householdsRes = await fetch("/api/households", { cache: "no-store" });
        const householdsJson = await householdsRes.json().catch(() => null);
        needsHousehold = householdsRes.ok && !!householdsJson?.needs_household;
      } catch {
        // If the household check fails, assume they have one and fall back to the normal destination.
      }

      window.location.assign(resolvePostFinePrintDestination(nextPath, needsHousehold));
      return;
    } catch (error: unknown) {
      const msg = safeStr(error instanceof Error ? error.message : "") || "Couldn’t save. Please try again.";
      setStatus(msg);
      toast(`Couldn’t save — ${msg}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-4">
      <ImportantInformationContent />

      <Card className="border-zinc-200 bg-white">
        <CardContent>
          <div className="space-y-3">
            <div className="text-sm font-semibold text-zinc-900">Before you continue</div>
            <label className="block text-sm text-zinc-700">
              <span>Birth year</span>
              <input
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                autoComplete="bday-year"
                placeholder="Year of birth"
                className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
              />
            </label>
            <p className="text-xs leading-5 text-zinc-500">
              Used only to check that you are 18 or older. The year is not saved.
            </p>
            {birthYear.length === 4 && !yearOk ? (
              <div className="text-sm text-zinc-600">Enter a birth year for someone who is 18 or older.</div>
            ) : null}
            {localeWarning ? (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-700">
                {localeWarning}
              </div>
            ) : null}
            <label className="flex items-start gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-1" />
              <span>I am 18 or older.</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={resident}
                onChange={(e) => setResident(e.target.checked)}
                className="mt-1"
              />
              <span>I live in Australia.</span>
            </label>
            <div className="text-sm text-zinc-700">Type your name to confirm you have read this.</div>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
            />

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button onClick={() => void save()} disabled={!canSave}>
                {working ? "Saving…" : "Save and continue"}
              </Button>
              <Chip onClick={() => router.push("/login")} className="text-zinc-500">
                Cancel
              </Chip>
            </div>

            {status ? <div className="text-sm text-zinc-600">{status}</div> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
