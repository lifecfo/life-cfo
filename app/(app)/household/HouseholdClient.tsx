// app/(app)/household/HouseholdClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";

type HouseholdItem = { id: string; name: string; role: string };

type MemberRow = {
  user_id: string;
  role: string;
  created_at: string;
  label?: string; // email for "me", masked id for others
  is_me?: boolean;
};

type InviteRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
};

type DeleteConfirm =
  | { open: true; user_id: string; label: string }
  | { open: false };

export const dynamic = "force-dynamic";

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function canEditMembers(role: string | null) {
  return (role ?? "").toLowerCase() === "owner";
}

function canRename(role: string | null) {
  const r = (role ?? "").toLowerCase();
  return r === "owner" || r === "editor";
}

function canInvite(role: string | null) {
  const r = (role ?? "").toLowerCase();
  return r === "owner" || r === "editor";
}

function maskId(id: string) {
  if (!id) return "";
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export default function HouseholdClient() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [statusLine, setStatusLine] = useState("Loading…");

  const [households, setHouseholds] = useState<HouseholdItem[]>([]);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm>({ open: false });

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Invites
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor">("viewer");
  const [inviteSending, setInviteSending] = useState(false);

  const active = useMemo(() => {
    if (!activeHouseholdId) return null;
    return households.find((h) => h.id === activeHouseholdId) ?? null;
  }, [households, activeHouseholdId]);

  const ownersCount = useMemo(() => {
    return members.filter((m) => (m.role ?? "").toLowerCase() === "owner").length;
  }, [members]);

  const load = async () => {
    setLoading(true);
    setStatusLine("Loading…");
    try {
      const res = await fetch("/api/households", { method: "GET" });
      const json = await res.json();

      if (!json?.ok) {
        setHouseholds([]);
        setActiveHouseholdId(null);
        setMembers([]);
        setInvites([]);
        setStatusLine("Not signed in.");
        return;
      }

      const list: HouseholdItem[] = Array.isArray(json.households) ? json.households : [];
      setHouseholds(list);
      setActiveHouseholdId(json.active_household_id ?? null);

      const activeId = (json.active_household_id ?? null) as string | null;
      const activeName = activeId ? list.find((h) => h.id === activeId)?.name ?? "" : "";
      setNameDraft(activeName);
      setStatusLine("Updated.");
    } catch (e: any) {
      toast({ title: "Couldn’t load Household", description: e?.message ?? "Please try again." });
      setStatusLine("Couldn’t load right now.");
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async (householdId: string) => {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/households/members?household_id=${encodeURIComponent(householdId)}`, { method: "GET" });
      const json = await res.json();
      if (json?.ok) setMembers(Array.isArray(json.members) ? json.members : []);
      else setMembers([]);
    } catch {
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  const loadInvites = async (householdId: string) => {
    setInvitesLoading(true);
    try {
      const res = await fetch(`/api/households/invites?household_id=${encodeURIComponent(householdId)}`, { method: "GET" });
      const json = await res.json();
      if (json?.ok) setInvites(Array.isArray(json.invites) ? json.invites : []);
      else setInvites([]);
    } catch {
      setInvites([]);
    } finally {
      setInvitesLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeHouseholdId) return;
    void loadMembers(activeHouseholdId);
    void loadInvites(activeHouseholdId);
  }, [activeHouseholdId]);

  const startRename = () => {
    if (!active) return;
    setEditingName(true);
    setNameDraft(active.name ?? "");
  };

  const cancelRename = () => {
    setEditingName(false);
    if (active) setNameDraft(active.name ?? "");
  };

  const saveRename = async () => {
    if (!activeHouseholdId) return;

    const nextName = safeStr(nameDraft).trim();
    if (!nextName) {
      toast({ title: "Name is required", description: "A simple name is enough." });
      return;
    }

    try {
      const res = await fetch("/api/households", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ household_id: activeHouseholdId, name: nextName }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "Rename failed");

      setHouseholds((prev) => prev.map((h) => (h.id === activeHouseholdId ? { ...h, name: nextName } : h)));
      setEditingName(false);
      setStatusLine("Saved.");
    } catch (e: any) {
      toast({ title: "Couldn’t save", description: e?.message ?? "Please try again." });
      setStatusLine("Couldn’t save.");
    }
  };

  const updateRole = async (user_id: string, role: string) => {
    if (!activeHouseholdId) return;
    try {
      const res = await fetch("/api/households/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ household_id: activeHouseholdId, user_id, role }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "Role update failed");

      setMembers((prev) => prev.map((m) => (m.user_id === user_id ? { ...m, role } : m)));
      setStatusLine("Saved.");
    } catch (e: any) {
      const msg = e?.message ?? "Please try again.";
      toast({ title: "Couldn’t update role", description: msg });
      setStatusLine("Couldn’t save.");
      await loadMembers(activeHouseholdId);
    }
  };

  const requestRemove = (user_id: string, label: string) => {
    setDeleteConfirm({ open: true, user_id, label: `Remove ${label}?` });
  };

  const performRemove = async () => {
    if (!deleteConfirm.open) return;
    if (!activeHouseholdId) return;

    const user_id = deleteConfirm.user_id;
    setDeleteConfirm({ open: false });

    try {
      const res = await fetch("/api/households/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ household_id: activeHouseholdId, user_id }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "Remove failed");

      setMembers((prev) => prev.filter((m) => m.user_id !== user_id));
      setStatusLine("Removed.");
    } catch (e: any) {
      toast({ title: "Couldn’t remove", description: e?.message ?? "Please try again." });
      setStatusLine("Couldn’t remove.");
      await loadMembers(activeHouseholdId);
    }
  };

  const sendInvite = async () => {
    if (!activeHouseholdId) return;

    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast({ title: "Email required", description: "Enter a valid email address." });
      return;
    }

    setInviteSending(true);
    try {
      const res = await fetch("/api/households/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ household_id: activeHouseholdId, email, role: inviteRole }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "Invite failed");

      setInviteEmail("");
      setInviteRole("viewer");
      setStatusLine("Invite sent.");
      await loadInvites(activeHouseholdId);
    } catch (e: any) {
      toast({ title: "Couldn’t send invite", description: e?.message ?? "Please try again." });
      setStatusLine("Couldn’t send invite.");
    } finally {
      setInviteSending(false);
    }
  };

  const cancelInvite = async (inviteId: string) => {
    if (!activeHouseholdId) return;
    try {
      const res = await fetch("/api/households/invites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inviteId, action: "cancel" }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "Cancel failed");

      setStatusLine("Invite cancelled.");
      await loadInvites(activeHouseholdId);
    } catch (e: any) {
      toast({ title: "Couldn’t cancel invite", description: e?.message ?? "Please try again." });
      setStatusLine("Couldn’t cancel invite.");
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: label });
    } catch {
      toast({ title: "Couldn’t copy", description: "Your browser blocked clipboard access." });
    }
  };

  const myRole = active?.role ?? null;
  const allowRename = canRename(myRole);
  const allowMemberEdits = canEditMembers(myRole);
  const allowInvites = canInvite(myRole);

  const pendingInvites = invites.filter((i) => (i.status ?? "").toLowerCase() === "pending");

  return (
    <Page title="Household" subtitle="Where membership and permissions live.">
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        <div className="text-xs text-zinc-500">{loading ? "Loading…" : statusLine}</div>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Household details</div>
                <div className="text-xs text-zinc-500">The active household is used across the app.</div>
              </div>

              {!active ? null : editingName ? (
                <div className="flex items-center gap-2">
                  <Chip onClick={() => void saveRename()} disabled={!allowRename}>
                    Save
                  </Chip>
                  <Chip onClick={cancelRename}>Cancel</Chip>
                </div>
              ) : (
                <Chip onClick={startRename} disabled={!allowRename}>
                  Edit
                </Chip>
              )}
            </div>

            {!active ? (
              <div className="text-sm text-zinc-600">No household selected.</div>
            ) : editingName ? (
              <div className="space-y-1">
                <div className="text-xs text-zinc-500">Name</div>
                <input
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="e.g. Primary Household"
                />
                {!allowRename ? <div className="text-xs text-zinc-500">Only owners/editors can rename.</div> : null}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-sm text-zinc-900">{active.name}</div>
                <div className="text-xs text-zinc-500">Your role: {active.role}</div>

                <div className="pt-1">
                  <Chip onClick={() => setShowAdvanced((v) => !v)}>{showAdvanced ? "Hide advanced" : "Advanced"}</Chip>
                </div>

                {showAdvanced ? (
                  <div className="text-xs text-zinc-500">
                    <button
                      onClick={() => void copyText(active.id, "Household ID copied")}
                      className="underline underline-offset-2"
                    >
                      Copy household ID
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Members</div>
                <div className="text-xs text-zinc-500">Owners can manage roles and removals.</div>
              </div>
              <div className="text-xs text-zinc-500">{membersLoading ? "Loading…" : ""}</div>
            </div>

            {members.length === 0 ? (
              <div className="text-sm text-zinc-600">No members found.</div>
            ) : (
              <div className="grid gap-2">
                {members.map((m) => {
                  const label = m.label ?? `Member ${maskId(m.user_id)}`;
                  const isOnlyOwnerMe = !!m.is_me && (m.role ?? "").toLowerCase() === "owner" && ownersCount <= 1;

                  return (
                    <div
                      key={m.user_id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">{label}</div>
                        <div className="text-xs text-zinc-500">{m.role}</div>
                        {isOnlyOwnerMe ? <div className="text-xs text-zinc-500">You’re the only owner.</div> : null}

                        {showAdvanced ? (
                          <div className="text-xs text-zinc-500">
                            <button
                              onClick={() => void copyText(m.user_id, "Member ID copied")}
                              className="underline underline-offset-2"
                            >
                              Copy member ID
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {allowMemberEdits ? (
                        <div className="flex items-center gap-2">
                          {isOnlyOwnerMe ? (
                            <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800">
                              Owner
                            </span>
                          ) : (
                            <select
                              className="rounded-xl border border-zinc-200 bg-white px-2 py-2 text-sm text-zinc-800"
                              value={m.role}
                              onChange={(e) => void updateRole(m.user_id, e.target.value)}
                            >
                              <option value="owner">owner</option>
                              <option value="editor">editor</option>
                              <option value="viewer">viewer</option>
                            </select>
                          )}

                          <Chip onClick={() => requestRemove(m.user_id, label)} disabled={isOnlyOwnerMe}>
                            Remove
                          </Chip>
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500">—</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!allowMemberEdits ? <div className="text-xs text-zinc-500">Only owners can change roles or remove members.</div> : null}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Invites</div>
                <div className="text-xs text-zinc-500">Invite someone by email.</div>
              </div>
              <div className="text-xs text-zinc-500">{invitesLoading ? "Loading…" : ""}</div>
            </div>

            {!allowInvites ? (
              <div className="text-sm text-zinc-600">Only owners/editors can invite.</div>
            ) : (
              <div className="rounded-xl border border-zinc-200 p-3 space-y-2">
                <div className="grid gap-2 sm:grid-cols-[1fr,160px,auto] sm:items-center">
                  <input
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Email address"
                  />
                  <select
                    className="rounded-xl border border-zinc-200 bg-white px-2 py-2 text-sm text-zinc-800"
                    value={inviteRole}
                    onChange={(e) => setInviteRole((e.target.value as any) ?? "viewer")}
                  >
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                  </select>
                  <Chip onClick={() => void sendInvite()} disabled={inviteSending || !activeHouseholdId}>
                    Send invite
                  </Chip>
                </div>

                <div className="text-xs text-zinc-500">
                  They’ll accept from the <span className="underline underline-offset-2">Invites</span> page after signing in.
                </div>
              </div>
            )}

            <div className="text-xs text-zinc-500 pt-1">{pendingInvites.length ? "Pending" : ""}</div>

            {pendingInvites.length === 0 ? (
              <div className="text-sm text-zinc-600">No pending invites.</div>
            ) : (
              <div className="grid gap-2">
                {pendingInvites.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-zinc-900">{inv.email}</div>
                      <div className="text-xs text-zinc-500">{inv.role}</div>
                    </div>

                    {allowInvites ? (
                      <Chip onClick={() => void cancelInvite(inv.id)}>Cancel</Chip>
                    ) : (
                      <div className="text-xs text-zinc-500">—</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {deleteConfirm.open ? (
          <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/20 p-4">
            <div className="w-full max-w-[520px] rounded-2xl border border-zinc-200 bg-white shadow-lg">
              <div className="p-4 sm:p-5 space-y-2">
                <div className="text-sm font-semibold text-zinc-900">{deleteConfirm.label}</div>
                <div className="text-sm text-zinc-600">This can’t be undone.</div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <Chip onClick={() => setDeleteConfirm({ open: false })}>Cancel</Chip>
                  <Chip
                    onClick={() => void performRemove()}
                    className="border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800"
                  >
                    Remove
                  </Chip>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Page>
  );
}