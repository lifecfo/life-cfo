// app/(app)/documents/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Badge, useToast } from "@/components/ui";
import { formatMoneyFromCents } from "@/lib/money/formatMoney";

const RECEIPT_BUCKET = "household-receipts";
const DECISIONS_BUCKET = "captures";
const COOKIE_NAME = "lifecfo_household";

type Receipt = {
  id: string;
  storage_path: string;
  byte_size: number;
  created_at: string;
  item_title: string | null;
  item_amount_cents: number | null;
};

type DecisionAttachment = {
  decisionId: string;
  decisionTitle: string;
  name: string;
  path: string;
  type: string;
  size: number;
};

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = (document.cookie || "").split(";").map((s) => s.trim());
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx <= 0) continue;
    const k = decodeURIComponent(p.slice(0, idx).trim());
    const v = decodeURIComponent(p.slice(idx + 1).trim());
    if (k === name) return v || null;
  }
  return null;
}

async function resolveActiveHouseholdId(userId: string): Promise<string | null> {
  const preferred = readCookie(COOKIE_NAME);
  if (preferred) {
    const { data: okRows, error: okErr } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .eq("household_id", preferred)
      .limit(1);
    if (!okErr && okRows?.length) return preferred;
  }

  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.household_id ?? null;
}

function softKB(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export default function DocumentsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [decisionAttachments, setDecisionAttachments] = useState<DecisionAttachment[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        setError("Not signed in.");
        setLoading(false);
        return;
      }
      const uid = userData.user.id;

      try {
        const householdId = await resolveActiveHouseholdId(uid);
        if (!householdId) {
          setError("User not linked to a household.");
          setLoading(false);
          return;
        }

        const [receiptsRes, itemsRes, decisionsRes] = await Promise.all([
          supabase
            .from("household_receipts")
            .select("id,storage_path,byte_size,created_at,item_id")
            .eq("household_id", householdId)
            .order("created_at", { ascending: false }),
          supabase.from("household_items").select("id,title,amount_cents").eq("household_id", householdId),
          supabase
            .from("decisions")
            .select("id,title,attachments")
            .eq("household_id", householdId)
            .not("attachments", "is", null),
        ]);

        if (receiptsRes.error) throw receiptsRes.error;
        if (decisionsRes.error) throw decisionsRes.error;

        const itemById = new Map<string, { title: string; amount_cents: number | null }>();
        for (const row of itemsRes.data ?? []) {
          itemById.set(String(row.id), { title: String(row.title), amount_cents: row.amount_cents ?? null });
        }

        const mappedReceipts: Receipt[] = (receiptsRes.data ?? []).map((r: any) => {
          const item = r.item_id ? itemById.get(String(r.item_id)) : undefined;
          return {
            id: String(r.id),
            storage_path: String(r.storage_path),
            byte_size: Number(r.byte_size) || 0,
            created_at: String(r.created_at),
            item_title: item?.title ?? null,
            item_amount_cents: item?.amount_cents ?? null,
          };
        });
        setReceipts(mappedReceipts);

        const flattenedAttachments: DecisionAttachment[] = [];
        for (const d of decisionsRes.data ?? []) {
          const raw = (d as any).attachments;
          if (!Array.isArray(raw)) continue;
          for (const a of raw) {
            if (!a || typeof a.path !== "string") continue;
            flattenedAttachments.push({
              decisionId: String((d as any).id),
              decisionTitle: typeof (d as any).title === "string" ? (d as any).title : "Decision",
              name: typeof a.name === "string" ? a.name : "Attachment",
              path: String(a.path),
              type: typeof a.type === "string" ? a.type : "application/octet-stream",
              size: typeof a.size === "number" ? a.size : 0,
            });
          }
        }
        setDecisionAttachments(flattenedAttachments);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load documents.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openSigned = async (bucket: string, path: string) => {
    const { data, error: signErr } = await supabase.storage.from(bucket).createSignedUrl(path, 600);
    if (signErr || !data?.signedUrl) {
      toast.showToast({ message: "Couldn't open that file. Try again." });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const totalCount = receipts.length + decisionAttachments.length;

  return (
    <Page
      title="Documents"
      subtitle="Every photo and file your household has uploaded, in one place."
    >
      <div className="grid gap-4">
        {loading ? (
          <Card>
            <CardContent>Loading…</CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="text-sm text-red-600">{error}</CardContent>
          </Card>
        ) : totalCount === 0 ? (
          <Card>
            <CardContent className="space-y-2">
              <div className="font-semibold">Nothing uploaded yet.</div>
              <div className="text-sm opacity-75">
                Photos of bills and receipts go to <a className="underline" href="/start">Add things</a>. Files
                attached to a decision go to <a className="underline" href="/decisions">Decision notes</a>.
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {receipts.length > 0 ? (
              <Card>
                <CardContent className="space-y-3">
                  <div className="font-semibold">Receipts &amp; bill photos</div>
                  <div className="grid gap-2">
                    {receipts.map((r) => (
                      <div key={r.id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-[240px] flex-1">
                            <div className="font-semibold flex items-center gap-2 flex-wrap">
                              {r.item_title ?? "Receipt"}
                              {r.item_amount_cents != null ? (
                                <Badge>{formatMoneyFromCents(r.item_amount_cents)}</Badge>
                              ) : null}
                            </div>
                            <div className="text-sm opacity-75 mt-1">
                              {formatDate(r.created_at)}
                              {softKB(r.byte_size) ? ` · ${softKB(r.byte_size)}` : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Chip onClick={() => openSigned(RECEIPT_BUCKET, r.storage_path)}>Download</Chip>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {decisionAttachments.length > 0 ? (
              <Card>
                <CardContent className="space-y-3">
                  <div className="font-semibold">Decision attachments</div>
                  <div className="grid gap-2">
                    {decisionAttachments.map((a, idx) => (
                      <div key={`${a.decisionId}-${idx}`} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-[240px] flex-1">
                            <div className="font-semibold">{a.name}</div>
                            <div className="text-sm opacity-75 mt-1">
                              From "{a.decisionTitle}"{softKB(a.size) ? ` · ${softKB(a.size)}` : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Chip onClick={() => openSigned(DECISIONS_BUCKET, a.path)}>Download</Chip>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </Page>
  );
}
