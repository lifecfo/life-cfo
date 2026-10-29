"use client";

import { useEffect, useState } from "react";

import { HouseholdPicture } from "@/components/home/HouseholdPicture";
import { Page } from "@/components/Page";
import { PRODUCT_DESCRIPTOR } from "@/lib/brand";
import { supabase } from "@/lib/supabaseClient";
import { useMascotEnabled, usePrefersReducedMotion } from "@/lib/mascot/prefs";
import { MascotCorner } from "@/components/mascot/MascotCorner";

function firstNameOf(full: string) {
  const name = full.trim();
  if (!name) return "";
  return name.split(/\s+/)[0] || "";
}

export default function LifeCFOHomePage() {
  const [preferredName, setPreferredName] = useState("");
  const { enabled: mascotEnabled } = useMascotEnabled();
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!alive || error || !data.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("fine_print_signed_name")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (!alive) return;
      const full = typeof profile?.fine_print_signed_name === "string" ? profile.fine_print_signed_name : "";
      setPreferredName(firstNameOf(full));
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Page title="Home" subtitle={preferredName ? `Good to see you, ${preferredName}.` : PRODUCT_DESCRIPTOR}>
      <div className="mx-auto max-w-[980px]">
        <HouseholdPicture />
      </div>
      <MascotCorner mode="ambient" enabled={mascotEnabled} reducedMotion={reducedMotion} />
    </Page>
  );
}
