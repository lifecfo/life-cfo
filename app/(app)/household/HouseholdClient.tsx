"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";
import { notifyActiveHouseholdChanged } from "@/lib/households/resolveActiveHouseholdClient";
import { useLifeCfoAccess } from "@/lib/access/useLifeCfoAccess";

type HouseholdItem = { id: string; name: string; role: string };

type MemberRow = {
  membership_id: string;
  role: string;
  label?: string;
  is_me?: boolean;
};

type InviteRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
};

type IncomingInviteRow = {
  id: string;
  household_id: string;
  household_name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
};

type DeleteConfirm =
  | { open: true; membership_id: string; label: string }
  | { open: false };

type LeaveConfirm = { open: boolean };

type OwnershipConfirm =
  | { open: true; action: "make_owner"; membership_id: string; label: string; generic_label: boolean }
  | { open: true; action: "step_down"; membership_id: string }
  | { open: false };

export const dynamic = "force-dynamic";

const DISMISSED_INVITES_STORAGE_KEY = "lifecfo-dismissed-household-invites";

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
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

function formatInviteAge(createdAt: string) {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

export default function HouseholdClient() {
  const access = useLifeCfoAccess();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [statusLine, setStatusLine] = useState("Loading…");

  const [households, setHouseholds] = useState<HouseholdItem[]>([]);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const [needsHousehold, setNeedsHousehold] = useState(false);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm>({ open: false });
  const [leaveConfirm, setLeaveConfirm] = useState<LeaveConfirm>({ open: false });
  const [leaving, setLeaving] = useState(false);
  const [ownershipConfirm, setOwnershipConfirm] = useState<OwnershipConfirm>({ open: false });
  const [changingOwnership, setChangingOwnership] = useState(false);

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Create household
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);

  // Switch active household
  const [switching, setSwitching] = useState(false);
  const [demoStatusLoading, setDemoStatusLoading] = useState(false);
  const [demoStatusChecked, setDemoStatusChecked] = useState(false);
  const [demoReady, setDemoReady] = useState(false);
  const [settingUpDemo, setSettingUpDemo] = useState(false);
  const [demoSetupError, setDemoSetupError] = useState<string | null>(null);
  const autoDemoSetupAttempted = useRef(false);

  // Outgoing invites for active household
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor">("viewer");
  const [inviteSending, setInviteSending] = useState(false);

  // Incoming invites for signed-in user
  const [incomingInvites, setIncomingInvites] = useState<IncomingInviteRow[]>([]);
  const [incomingInvitesLoading, setIncomingInvitesLoading] = useState(false);
  const [dismissedIncomingInviteIds, setDismissedIncomingInviteIds] = useState<string[]>([]);

  const active = useMemo(() => {
    if (!activeHouseholdId) return null;
    return households.find((h) => h.id === activeHouseholdId) ?? null;
  }, [households, activeHouseholdId]);

  const ownersCount = useMemo(() => {
    return members.filter((m) => (m.role ?? "").toLowerCase() === "owner").length;
  }, [members]);

  const myRole = active?.role ?? null;
  const allowRename = canRename(myRole);
  const allowMemberEdits = canEditMembers(myRole);
  const allowInvites = canInvite(myRole);
  const isSoleOwner = (myRole ?? "").toLowerCase() === "owner" && ownersCount <= 1;
  const currentMembership = members.find((member) => member.is_me) ?? null;
  const canStepDown = (myRole ?? "").toLowerCase() === "owner" && ownersCount > 1 && !!currentMembership;

  const outgoingPendingInvites = useMemo(() => {
    return invites.filter((i) => (i.status ?? "").toLowerCase() === "pending");
  }, [invites]);

  const incomingPendingInvites = useMemo(() => {
    return incomingInvites.filter((i) => (i.status ?? "").toLowerCase() === "pending");
  }, [incomingInvites]);

  const visibleIncomingBannerInvites = useMemo(() => {
    return incomingPendingInvites.filter((i) => !dismissedIncomingInviteIds.includes(i.id));
  }, [incomingPendingInvites, dismissedIncomingInviteIds]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DISMISSED_INVITES_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setDismissedIncomingInviteIds(parsed.filter((v) => typeof v === "string"));
      }
    } catch {
      // ignore
    }
  }, []);

  const persistDismissedInviteIds = (nextIds: string[]) => {
    setDismissedIncomingInviteIds(nextIds);
    try {
      window.localStorage.setItem(DISMISSED_INVITES_STORAGE_KEY, JSON.stringify(nextIds));
    } catch {
      // ignore
    }
  };

  const dismissIncomingInviteBanner = (inviteId: string) => {
    if (!inviteId) return;
    if (dismissedIncomingInviteIds.includes(inviteId)) return;
    persistDismissedInviteIds([...dismissedIncomingInviteIds, inviteId]);
  };

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
        setIncomingInvites([]);
        setNeedsHousehold(false);
        setStatusLine("Not signed in.");
        return;
      }

      const list: HouseholdItem[] = Array.isArray(json.households) ? json.households : [];
      setHouseholds(list);
      setActiveHouseholdId(json.active_household_id ?? null);
      setNeedsHousehold(!!json.needs_household);

      const activeId = (json.active_household_id ?? null) as string | null;
      const activeName = activeId ? list.find((h) => h.id === activeId)?.name ?? "" : "";
      setNameDraft(activeName);
      setStatusLine("Updated.");
    } catch (error: unknown) {
      showToast({ message: errorMessage(error, "Couldn’t load Household.") }, 2500);
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

  const loadIncomingInvites = async () => {
    setIncomingInvitesLoading(true);
    try {
      const res = await fetch("/api/households/invites", { method: "GET" });
      const json = await res.json();
      if (json?.ok) {
        const next = Array.isArray(json.invites) ? json.invites : [];
        setIncomingInvites(next);

        const pendingIds = next
          .filter((i: IncomingInviteRow) => (i.status ?? "").toLowerCase() === "pending")
          .map((i: IncomingInviteRow) => i.id);

        const cleanedDismissed = dismissedIncomingInviteIds.filter((id) => pendingIds.includes(id));
        if (cleanedDismissed.length !== dismissedIncomingInviteIds.length) {
          persistDismissedInviteIds(cleanedDismissed);
        }
      } else {
        setIncomingInvites([]);
      }
    } catch {
      setIncomingInvites([]);
    } finally {
      setIncomingInvitesLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadIncomingInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDemoStatus = async () => {
    if (!access.isDemoMode) return;
    setDemoStatusLoading(true);
    try {
      const response = await fetch("/api/demo/status", { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      setDemoReady(response.ok && json.demo_ready === true);
    } catch {
      setDemoReady(false);
    } finally {
      setDemoStatusLoading(false);
      setDemoStatusChecked(true);
    }
  };

  useEffect(() => {
    if (!access.loading && access.isDemoMode) void loadDemoStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.loading, access.isDemoMode]);

  useEffect(() => {
    if (!activeHouseholdId) return;
    void loadMembers(activeHouseholdId);
    void loadInvites(activeHouseholdId);
  }, [activeHouseholdId]);

  const createHousehold = async () => {
    if (creating) return;
    setCreating(true);

    try {
      const name = safeStr(createName).trim();

      const res = await fetch("/api/households", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "Create failed");

      showToast({ message: "Created." }, 1200);
      setCreateName("");
      await load();
      await loadIncomingInvites();
    } catch (error: unknown) {
      showToast({ message: errorMessage(error, "Couldn’t create household.") }, 2500);
    } finally {
      setCreating(false);
    }
  };

  const switchActiveHousehold = async (household_id: string) => {
    if (switching) return;
    if (!household_id) return;

    setSwitching(true);
    try {
      const res = await fetch("/api/households/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ household_id }),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "Switch failed");

      setActiveHouseholdId(household_id);
      setEditingName(false);
      setShowAdvanced(false);
      setStatusLine("Updated.");
      notifyActiveHouseholdChanged(household_id);

      await Promise.all([loadMembers(household_id), loadInvites(household_id), loadIncomingInvites()]);
    } catch (error: unknown) {
      showToast({ message: errorMessage(error, "Couldn’t switch household.") }, 2500);
      setStatusLine("Couldn’t switch.");
      await load();
      await loadIncomingInvites();
    } finally {
      setSwitching(false);
    }
  };

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
      showToast({ message: "Name is required." }, 2000);
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
    } catch (error: unknown) {
      showToast({ message: errorMessage(error, "Couldn’t save.") }, 2500);
      setStatusLine("Couldn’t save.");
    }
  };

  const updateRole = async (membership_id: string, role: string): Promise<boolean> => {
    if (!activeHouseholdId) return false;
    try {
      const res = await fetch("/api/households/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ household_id: activeHouseholdId, membership_id, role }),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "Role update failed");

      const updatedMember = members.find((member) => member.membership_id === membership_id);
      setMembers((prev) => prev.map((m) => (m.membership_id === membership_id ? { ...m, role } : m)));
      if (updatedMember?.is_me) {
        setHouseholds((prev) => prev.map((household) => (
          household.id === activeHouseholdId ? { ...household, role } : household
        )));
      }
      setStatusLine("Saved.");
      return true;
    } catch (error: unknown) {
      showToast({ message: errorMessage(error, "Couldn’t update role.") }, 2500);
      setStatusLine("Couldn’t save.");
      await loadMembers(activeHouseholdId);
      return false;
    }
  };

  const setupDemo = async () => {
    if (settingUpDemo) return;
    setSettingUpDemo(true);
    setDemoSetupError(null);
    try {
      const response = await fetch("/api/demo/setup", { method: "POST" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.household_count !== 2) {
        throw new Error("demo_setup_incomplete");
      }
      setDemoReady(true);
      showToast({ message: "Demo ready." }, 1500);
      window.location.assign("/lifecfo-home");
    } catch {
      await loadDemoStatus();
      setDemoSetupError("We couldn't set up the demo yet. Please try again or contact support.");
    } finally {
      setSettingUpDemo(false);
    }
  };

  useEffect(() => {
    if (
      access.loading ||
      !access.isDemoMode ||
      !demoStatusChecked ||
      demoReady ||
      autoDemoSetupAttempted.current
    ) return;

    autoDemoSetupAttempted.current = true;
    void setupDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.loading, access.isDemoMode, demoStatusChecked, demoReady]);

  const confirmOwnershipChange = async () => {
    if (!ownershipConfirm.open || changingOwnership) return;

    setChangingOwnership(true);
    const role = ownershipConfirm.action === "make_owner" ? "owner" : "editor";
    const saved = await updateRole(ownershipConfirm.membership_id, role);
    if (saved) setOwnershipConfirm({ open: false });
    setChangingOwnership(false);
  };

  const requestRemove = (membership_id: string, label: string) => {
    setDeleteConfirm({ open: true, membership_id, label: `Remove ${label}?` });
  };

  const performRemove = async () => {
    if (!deleteConfirm.open) return;
    if (!activeHouseholdId) return;

    const membership_id = deleteConfirm.membership_id;
    setDeleteConfirm({ open: false });

    try {
      const res = await fetch("/api/households/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ household_id: activeHouseholdId, membership_id }),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "Remove failed");

      setMembers((prev) => prev.filter((m) => m.membership_id !== membership_id));
      setStatusLine("Removed.");
    } catch (error: unknown) {
      showToast({ message: errorMessage(error, "Couldn’t remove.") }, 2500);
      setStatusLine("Couldn’t remove.");
      await loadMembers(activeHouseholdId);
    }
  };

  const leaveHousehold = async () => {
    if (!activeHouseholdId || leaving) return;

    setLeaving(true);
    try {
      const res = await fetch(`/api/households/${encodeURIComponent(activeHouseholdId)}/leave`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "We couldn’t leave this household yet.");

      setLeaveConfirm({ open: false });
      setMembers([]);
      setInvites([]);
      notifyActiveHouseholdChanged(typeof json.active_household_id === "string" ? json.active_household_id : null);
      await load();
      await loadIncomingInvites();
      setStatusLine("Household left.");
    } catch (error: unknown) {
      showToast({ message: errorMessage(error, "We couldn’t leave this household yet.") }, 2500);
    } finally {
      setLeaving(false);
    }
  };

  const sendInvite = async () => {
    if (!activeHouseholdId) return;

    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      showToast({ message: "Enter a valid email address." }, 2000);
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
    } catch (error: unknown) {
      showToast({ message: errorMessage(error, "Couldn’t send invite.") }, 2500);
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
      await loadIncomingInvites();
    } catch (error: unknown) {
      showToast({ message: errorMessage(error, "Couldn’t cancel invite.") }, 2500);
      setStatusLine("Couldn’t cancel invite.");
    }
  };

  const actOnIncomingInvite = async (id: string, action: "accept" | "decline") => {
    try {
      const res = await fetch("/api/households/invites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "Update failed");

      if (action === "accept" && json?.household_id) {
        await fetch("/api/households/active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ household_id: json.household_id }),
        }).catch(() => null);
        notifyActiveHouseholdChanged(String(json.household_id));
      }

      const nextDismissed = dismissedIncomingInviteIds.filter((x) => x !== id);
      persistDismissedInviteIds(nextDismissed);

      setStatusLine(action === "accept" ? "Accepted." : "Declined.");
      await load();
      await loadIncomingInvites();
    } catch (error: unknown) {
      showToast({ message: errorMessage(error, "Couldn’t update invite.") }, 2500);
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast({ message: label }, 1200);
    } catch {
      showToast({ message: "Your browser blocked clipboard access." }, 2500);
    }
  };

  // ---------- NEW USER: needs household ----------
  if (!loading && (needsHousehold || households.length === 0)) {
    if (access.loading || (access.isDemoMode && (demoStatusLoading || !demoStatusChecked))) {
      return (
        <Page title="Welcome to Life CFO beta" subtitle="Setting up your demo...">
          <div />
        </Page>
      );
    }

    if (access.isDemoMode) {
      return (
        <Page title="Welcome to Life CFO beta">
          <div className="mx-auto w-full max-w-[640px] space-y-4">
            <Card className="border-zinc-200 bg-white">
              <CardContent className="space-y-4">
                <p className="text-sm leading-6 text-zinc-600">
                  This demo uses sample household money data, so you can explore safely without connecting a real bank.
                </p>
                {demoSetupError ? <p className="text-sm text-zinc-600">{demoSetupError}</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                  {demoSetupError ? (
                    <Chip onClick={() => void setupDemo()} disabled={settingUpDemo}>
                      {settingUpDemo ? "Setting up your demo..." : "Retry setup"}
                    </Chip>
                  ) : (
                    <span className="text-sm font-medium text-zinc-800">
                      {demoReady ? "Demo ready." : "Setting up your demo..."}
                    </span>
                  )}
                  {demoSetupError ? (
                    <a className="text-sm text-zinc-600 underline underline-offset-2" href="mailto:admin@life-cfo.com">
                      Contact support
                    </a>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </Page>
      );
    }

    return (
      <Page title="Household" subtitle="This is who shares your money picture.">
        <div className="mx-auto w-full max-w-[760px] space-y-6">
          <Card className="border-zinc-200 bg-white">
            <CardContent className="space-y-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Set up your household</div>
                <div className="mt-0.5 text-xs text-zinc-500">You can change this later.</div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-zinc-500">Name (optional)</div>
                <input
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Em & Ryan"
                />
              </div>

              <div className="flex items-center gap-2">
                <Chip onClick={() => void createHousehold()} disabled={creating}>
                  {creating ? "Creating…" : "Create household"}
                </Chip>
              </div>

              <div className="text-xs text-zinc-500">Once created, it becomes your active household across the app.</div>
            </CardContent>
          </Card>
        </div>
      </Page>
    );
  }

  // ---------- NORMAL HOUSEHOLD UI ----------
  return (
    <Page title="Household" subtitle="Membership and permissions.">
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        {access.isDemoMode && !demoReady && !demoStatusLoading ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">Finish setting up your demo</div>
              <div className="text-sm text-zinc-600">
                Life CFO can safely add the remaining sample household.
              </div>
              {demoSetupError ? <div className="text-sm text-zinc-600">{demoSetupError}</div> : null}
              <Chip onClick={() => void setupDemo()} disabled={settingUpDemo}>
                {settingUpDemo ? "Setting up your demo..." : "Retry setup"}
              </Chip>
            </CardContent>
          </Card>
        ) : null}
        {visibleIncomingBannerInvites.length > 0 ? (
          <div className="sticky top-3 z-30">
            <div className="rounded-2xl border border-zinc-200 bg-white/95 shadow-sm backdrop-blur">
              <div className="space-y-3 p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">
                      {visibleIncomingBannerInvites.length === 1 ? "Household invite waiting" : "Household invites waiting"}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {visibleIncomingBannerInvites.length === 1
                        ? "You have a pending household invite."
                        : `You have ${visibleIncomingBannerInvites.length} pending household invites.`}
                    </div>
                  </div>

                  {visibleIncomingBannerInvites.length > 1 ? (
                    <button
                      className="text-xs text-zinc-500 underline underline-offset-2"
                      onClick={() => {
                        const allIds = visibleIncomingBannerInvites.map((i) => i.id);
                        persistDismissedInviteIds([...new Set([...dismissedIncomingInviteIds, ...allIds])]);
                      }}
                    >
                      Close
                    </button>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  {visibleIncomingBannerInvites.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">{inv.household_name}</div>
                        <div className="text-xs text-zinc-500">
                          Role: {inv.role} · Sent {formatInviteAge(inv.created_at)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          className="text-xs text-zinc-500 underline underline-offset-2"
                          onClick={() => dismissIncomingInviteBanner(inv.id)}
                        >
                          Close
                        </button>
                        <Chip onClick={() => void actOnIncomingInvite(inv.id, "decline")}>Decline</Chip>
                        <Chip
                          className="border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800"
                          onClick={() => void actOnIncomingInvite(inv.id, "accept")}
                        >
                          Accept
                        </Chip>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

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
                <div className="flex items-center gap-2">
                  <Chip onClick={startRename} disabled={!allowRename}>
                    Edit
                  </Chip>
                </div>
              )}
            </div>

            {households.length > 1 ? (
              <div className="space-y-1">
                <div className="text-xs text-zinc-500">Active household</div>
                <select
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                  value={activeHouseholdId ?? ""}
                  onChange={(e) => void switchActiveHousehold(e.target.value)}
                  disabled={switching}
                >
                  {households.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name || "Household"}
                    </option>
                  ))}
                </select>
                <div className="text-xs text-zinc-500">{switching ? "Switching…" : " "}</div>
              </div>
            ) : null}

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
                    <button onClick={() => void copyText(active.id, "Household ID copied")} className="underline underline-offset-2">
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
                  const label = m.label ?? "Household member";
                  const isOwner = (m.role ?? "").toLowerCase() === "owner";
                  const isOnlyOwnerMe = !!m.is_me && (m.role ?? "").toLowerCase() === "owner" && ownersCount <= 1;

                  return (
                    <div
                      key={m.membership_id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">{label}</div>
                        <div className="text-xs text-zinc-500">{m.role}</div>
                        {isOnlyOwnerMe ? <div className="text-xs text-zinc-500">You’re the only owner.</div> : null}

                      </div>

                      {allowMemberEdits ? (
                        <div className="flex items-center gap-2">
                          {isOwner ? (
                            <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800">
                              Owner
                            </span>
                          ) : (
                            <>
                              <select
                                className="rounded-xl border border-zinc-200 bg-white px-2 py-2 text-sm text-zinc-800"
                                value={m.role}
                                onChange={(e) => void updateRole(m.membership_id, e.target.value)}
                              >
                                <option value="editor">editor</option>
                                <option value="viewer">viewer</option>
                              </select>
                              <Chip onClick={() => setOwnershipConfirm({
                                open: true,
                                action: "make_owner",
                                membership_id: m.membership_id,
                                label,
                                generic_label: label === "Household member",
                              })}>
                                Make owner
                              </Chip>
                            </>
                          )}

                          {!m.is_me ? (
                            <Chip onClick={() => requestRemove(m.membership_id, label)}>
                              Remove member
                            </Chip>
                          ) : null}
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
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Invites</div>
                <div className="text-xs text-zinc-500">Manage incoming and outgoing household invites here.</div>
              </div>
              <div className="text-xs text-zinc-500">
                {invitesLoading || incomingInvitesLoading ? "Loading…" : ""}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Waiting for you</div>

              {incomingPendingInvites.length === 0 ? (
                <div className="rounded-xl border border-zinc-200 px-3 py-3 text-sm text-zinc-600">
                  No invites waiting for you.
                </div>
              ) : (
                <div className="grid gap-2">
                  {incomingPendingInvites.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">{inv.household_name}</div>
                        <div className="text-xs text-zinc-500">Role: {inv.role}</div>
                        <div className="text-xs text-zinc-500">Sent to: {inv.email}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Chip onClick={() => void actOnIncomingInvite(inv.id, "decline")}>Decline</Chip>
                        <Chip
                          className="border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800"
                          onClick={() => void actOnIncomingInvite(inv.id, "accept")}
                        >
                          Accept
                        </Chip>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Invite someone</div>

              {!allowInvites ? (
                <div className="rounded-xl border border-zinc-200 px-3 py-3 text-sm text-zinc-600">
                  Only owners/editors can invite.
                </div>
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
                      onChange={(e) => setInviteRole((e.target.value as "viewer" | "editor") ?? "viewer")}
                    >
                      <option value="viewer">viewer</option>
                      <option value="editor">editor</option>
                    </select>
                    <Chip onClick={() => void sendInvite()} disabled={inviteSending || !activeHouseholdId}>
                      {inviteSending ? "Sending…" : "Send invite"}
                    </Chip>
                  </div>

                  <div className="text-xs text-zinc-500">
                    They’ll see the invite inside their Household page after signing in.
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Sent invites</div>

              {outgoingPendingInvites.length === 0 ? (
                <div className="rounded-xl border border-zinc-200 px-3 py-3 text-sm text-zinc-600">
                  No pending invites sent from this household.
                </div>
              ) : (
                <div className="grid gap-2">
                  {outgoingPendingInvites.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">{inv.email}</div>
                        <div className="text-xs text-zinc-500">
                          {inv.role} · Sent {formatInviteAge(inv.created_at)}
                        </div>
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
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Your access</div>
              <div className="text-xs text-zinc-500">Leaving removes your access, not the household or its shared information.</div>
            </div>

            {isSoleOwner ? (
              <div className="text-sm text-zinc-600">You’re the only owner. Add another owner before leaving.</div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {canStepDown && currentMembership ? (
                  <Chip onClick={() => setOwnershipConfirm({ open: true, action: "step_down", membership_id: currentMembership.membership_id })}>
                    Step down as owner
                  </Chip>
                ) : null}
                <Chip onClick={() => setLeaveConfirm({ open: true })}>Leave household</Chip>
              </div>
            )}
          </CardContent>
        </Card>

        {deleteConfirm.open ? (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/20 p-4 sm:items-center">
            <div className="w-full max-w-[520px] rounded-2xl border border-zinc-200 bg-white shadow-lg">
              <div className="space-y-2 p-4 sm:p-5">
                <div className="text-sm font-semibold text-zinc-900">{deleteConfirm.label}</div>
                <div className="text-sm text-zinc-600">This can’t be undone.</div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <Chip onClick={() => setDeleteConfirm({ open: false })}>Cancel</Chip>
                  <Chip onClick={() => void performRemove()} className="border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800">
                    Remove member
                  </Chip>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {ownershipConfirm.open ? (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/20 p-4 sm:items-center">
            <div className="w-full max-w-[520px] rounded-2xl border border-zinc-200 bg-white shadow-lg">
              <div className="space-y-2 p-4 sm:p-5">
                <div className="text-sm font-semibold text-zinc-900">
                  {ownershipConfirm.action === "make_owner" ? `Make ${ownershipConfirm.label} an owner?` : "Step down as owner?"}
                </div>
                <div className="text-sm text-zinc-600">
                  {ownershipConfirm.action === "make_owner"
                    ? "This person will be able to manage household members and important settings."
                    : "You will no longer manage household members and important settings."}
                </div>
                {ownershipConfirm.action === "make_owner" && ownershipConfirm.generic_label ? (
                  <div className="text-sm text-zinc-600">Make sure this is the right person before continuing.</div>
                ) : null}

                <div className="mt-4 flex items-center justify-end gap-2">
                  <Chip onClick={() => setOwnershipConfirm({ open: false })} disabled={changingOwnership}>Cancel</Chip>
                  <Chip
                    onClick={() => void confirmOwnershipChange()}
                    disabled={changingOwnership}
                    className="border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800"
                  >
                    {changingOwnership
                      ? "Saving…"
                      : ownershipConfirm.action === "make_owner" ? "Make owner" : "Step down"}
                  </Chip>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {leaveConfirm.open ? (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/20 p-4 sm:items-center">
            <div className="w-full max-w-[520px] rounded-2xl border border-zinc-200 bg-white shadow-lg">
              <div className="space-y-2 p-4 sm:p-5">
                <div className="text-sm font-semibold text-zinc-900">Leave household?</div>
                <div className="text-sm text-zinc-600">
                  You will lose access to this household. Shared household information will stay for the other members.
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <Chip onClick={() => setLeaveConfirm({ open: false })} disabled={leaving}>Cancel</Chip>
                  <Chip
                    onClick={() => void leaveHousehold()}
                    disabled={leaving}
                    className="border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800"
                  >
                    {leaving ? "Leaving…" : "Leave household"}
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
