// app/(app)/family/FamilyClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

type FamilyMember = {
  id: string;
  user_id: string;
  household_id: string;
  name: string;
  birth_year: number | null;
  relationship: string | null;
  about: string | null;
  created_at: string;
  updated_at: string;
};

type Pet = {
  id: string;
  user_id: string;
  household_id: string;
  name: string;
  type: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type MeDraft = {
  name: string;
  birth_year: number | null;
  about: string;
};

type FamilyDraft = {
  name: string;
  relationship: string;
  birth_year: number | null;
  about: string;
};

type PetDraft = {
  name: string;
  type: string;
  notes: string;
};

type Drafts = Record<string, MeDraft | FamilyDraft | PetDraft>;

type DeleteConfirm =
  | {
      open: true;
      kind: "family" | "pet";
      id: string;
    }
  | { open: false };

const EMPTY_FAMILY_DRAFT: FamilyDraft = {
  name: "",
  relationship: "",
  birth_year: null,
  about: "",
};

const EMPTY_PET_DRAFT: PetDraft = {
  name: "",
  type: "",
  notes: "",
};

function clampYear(y: string) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  if (n < 1900) return 1900;
  const max = new Date().getFullYear();
  if (n > max) return max;
  return Math.floor(n);
}

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Please try again.";
}

function isMe(m: FamilyMember) {
  return (m.relationship ?? "").toLowerCase().trim() === "me";
}

export default function FamilyClient() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [statusLine, setStatusLine] = useState<string>("Loading…");
  const [userId, setUserId] = useState<string | null>(null);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);

  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);

  const [addingFamily, setAddingFamily] = useState(false);
  const [addingPet, setAddingPet] = useState(false);
  const [newFamilyDraft, setNewFamilyDraft] = useState<FamilyDraft>(EMPTY_FAMILY_DRAFT);
  const [newPetDraft, setNewPetDraft] = useState<PetDraft>(EMPTY_PET_DRAFT);

  const [editingKey, setEditingKey] = useState<string | null>(null); // "me" | "fm:<id>" | "pet:<id>"
  const [drafts, setDrafts] = useState<Drafts>({});

  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm>({ open: false });

  // Top-5 default (V1 pattern)
  const DEFAULT_LIMIT = 5;
  const [showAllFamily, setShowAllFamily] = useState(false);
  const [showAllPets, setShowAllPets] = useState(false);

  const isMountedRef = useRef(true);

  const me = useMemo(() => family.find((m) => isMe(m)) ?? null, [family]);

  const others = useMemo(() => {
    return family
      .filter((m) => !isMe(m))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [family]);

  const sortedPets = useMemo(() => {
    return [...pets].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [pets]);

  const visibleFamily = useMemo(() => {
    if (showAllFamily) return others;
    return others.slice(0, DEFAULT_LIMIT);
  }, [others, showAllFamily]);

  const visiblePets = useMemo(() => {
    if (showAllPets) return sortedPets;
    return sortedPets.slice(0, DEFAULT_LIMIT);
  }, [sortedPets, showAllPets]);

  const ensureMeRow = async (householdId: string, uid: string) => {
    const { data, error } = await supabase
      .from("family_members")
      .select("id,relationship")
      .eq("household_id", householdId)
      .limit(200);

    if (error) return;

    const hasMe = (data ?? []).some(
      (row: { relationship?: unknown }) =>
        String(row.relationship ?? "").toLowerCase().trim() === "me"
    );
    if (hasMe) return;

    await supabase.from("family_members").insert({
      household_id: householdId,
      user_id: uid,
      name: "Me",
      birth_year: null,
      relationship: "Me",
      about: null,
    });
  };

  const load = async () => {
    setLoading(true);
    setStatusLine("Loading…");

    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        setUserId(null);
        setActiveHouseholdId(null);
        setFamily([]);
        setPets([]);
        setStatusLine("Not signed in.");
        return;
      }

      setUserId(user.id);

      // get active household (cookie + server preference)
      const hhRes = await fetch("/api/households", { method: "GET" });
      const hhJson = await hhRes.json();
      const hhId = hhJson?.ok ? (hhJson.active_household_id as string | null) : null;

      if (!hhId) {
        setActiveHouseholdId(null);
        setFamily([]);
        setPets([]);
        setStatusLine("No household selected.");
        return;
      }

      setActiveHouseholdId(hhId);

      await ensureMeRow(hhId, user.id);

      const [fRes, pRes] = await Promise.all([
        supabase
          .from("family_members")
          .select("id,user_id,household_id,name,birth_year,relationship,about,created_at,updated_at")
          .eq("household_id", hhId)
          .order("created_at", { ascending: true }),
        supabase
          .from("pets")
          .select("id,user_id,household_id,name,type,notes,created_at,updated_at")
          .eq("household_id", hhId)
          .order("created_at", { ascending: true }),
      ]);

      if (fRes.error) throw fRes.error;
      if (pRes.error) throw pRes.error;

      const fam = (fRes.data as FamilyMember[]) ?? [];
      const pts = (pRes.data as Pet[]) ?? [];

      setFamily(fam);
      setPets(pts);

      const famCount = fam.filter((m) => !isMe(m)).length;
      const petCount = pts.length;

      if (famCount === 0 && petCount === 0) setStatusLine("Add a couple of names whenever you’re ready.");
      else setStatusLine("Updated.");
    } catch (e: unknown) {
      toast({ title: "Couldn’t load Family", description: errorMessage(e) });
      setStatusLine("Couldn’t load right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    void load();
    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelEdit = () => setEditingKey(null);

  const startEditMe = () => {
    if (!me) return;
    const key = "me";
    setEditingKey(key);
    const next: MeDraft = { name: me.name ?? "", birth_year: me.birth_year ?? null, about: me.about ?? "" };
    setDrafts((prev) => ({ ...prev, [key]: next }));
  };

  const startEditFamily = (m: FamilyMember) => {
    const key = `fm:${m.id}`;
    setEditingKey(key);
    const next: FamilyDraft = {
      name: m.name ?? "",
      relationship: m.relationship ?? "",
      birth_year: m.birth_year ?? null,
      about: m.about ?? "",
    };
    setDrafts((prev) => ({ ...prev, [key]: next }));
  };

  const startEditPet = (p: Pet) => {
    const key = `pet:${p.id}`;
    setEditingKey(key);
    const next: PetDraft = { name: p.name ?? "", type: p.type ?? "", notes: p.notes ?? "" };
    setDrafts((prev) => ({ ...prev, [key]: next }));
  };

  const saveMe = async () => {
    if (!userId || !me || !activeHouseholdId) return;

    const key = "me";
    const d = drafts[key] as MeDraft | undefined;
    const name = safeStr(d?.name).trim();
    if (!name) {
      toast({ title: "Name is required", description: "Just a simple name is enough." });
      return;
    }

    const birth = d?.birth_year ?? null;
    const about = safeStr(d?.about).trim();

    const patch = {
      name,
      birth_year: typeof birth === "number" && Number.isFinite(birth) ? birth : null,
      about: about.length ? about : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("family_members")
      .update(patch)
      .eq("id", me.id)
      .eq("household_id", activeHouseholdId);

    if (error) {
      toast({ title: "Couldn’t save", description: error.message });
      setStatusLine("Couldn’t save.");
      return;
    }

    setFamily((prev) => prev.map((x) => (x.id === me.id ? { ...x, ...patch } : x)));
    setEditingKey(null);
    setStatusLine("Saved.");
  };

  const saveFamily = async (m: FamilyMember) => {
    if (!activeHouseholdId) return;

    const key = `fm:${m.id}`;
    const d = drafts[key] as FamilyDraft | undefined;

    const name = safeStr(d?.name).trim();
    if (!name) {
      toast({ title: "Name is required", description: "Just a simple name is enough." });
      return;
    }

    const relationship = safeStr(d?.relationship).trim();
    const birth = d?.birth_year ?? null;
    const about = safeStr(d?.about).trim();

    const patch = {
      name,
      relationship: relationship.length ? relationship : null,
      birth_year: typeof birth === "number" && Number.isFinite(birth) ? birth : null,
      about: about.length ? about : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("family_members")
      .update(patch)
      .eq("id", m.id)
      .eq("household_id", activeHouseholdId);

    if (error) {
      toast({ title: "Couldn’t save", description: error.message });
      setStatusLine("Couldn’t save.");
      return;
    }

    setFamily((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...patch } : x)));
    setEditingKey(null);
    setStatusLine("Saved.");
  };

  const savePet = async (p: Pet) => {
    if (!activeHouseholdId) return;

    const key = `pet:${p.id}`;
    const d = drafts[key] as PetDraft | undefined;

    const name = safeStr(d?.name).trim();
    if (!name) {
      toast({ title: "Name is required", description: "Just a simple name is enough." });
      return;
    }

    const type = safeStr(d?.type).trim();
    const notes = safeStr(d?.notes).trim();

    const patch = {
      name,
      type: type.length ? type : null,
      notes: notes.length ? notes : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("pets")
      .update(patch)
      .eq("id", p.id)
      .eq("household_id", activeHouseholdId);

    if (error) {
      toast({ title: "Couldn’t save", description: error.message });
      setStatusLine("Couldn’t save.");
      return;
    }

    setPets((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
    setEditingKey(null);
    setStatusLine("Saved.");
  };

  const requestRemoveFamily = (m: FamilyMember) => {
    if (isMe(m)) return;
    setDeleteConfirm({
      open: true,
      kind: "family",
      id: m.id,
    });
  };

  const requestRemovePet = (p: Pet) => {
    setDeleteConfirm({
      open: true,
      kind: "pet",
      id: p.id,
    });
  };

  const performDelete = async () => {
    if (!activeHouseholdId) return;
    if (!deleteConfirm.open) return;

    const { kind, id } = deleteConfirm;
    setDeleteConfirm({ open: false });

    try {
      if (kind === "family") {
        const row = family.find((x) => x.id === id);
        if (!row) return;
        if (isMe(row)) return;

        setFamily((prev) => prev.filter((x) => x.id !== id));

        const { error } = await supabase.from("family_members").delete().eq("id", id).eq("household_id", activeHouseholdId);
        if (error) throw error;

        setStatusLine("Deleted.");
        return;
      }

      if (kind === "pet") {
        const row = pets.find((x) => x.id === id);
        if (!row) return;

        setPets((prev) => prev.filter((x) => x.id !== id));

        const { error } = await supabase.from("pets").delete().eq("id", id).eq("household_id", activeHouseholdId);
        if (error) throw error;

        setStatusLine("Deleted.");
        return;
      }
    } catch (e: unknown) {
      toast({ title: "Couldn’t delete", description: errorMessage(e) });
      setStatusLine("Couldn’t delete right now.");
      await load();
    }
  };

  const startAddingFamily = () => {
    setEditingKey(null);
    setAddingPet(false);
    setAddingFamily(true);
    setNewFamilyDraft(EMPTY_FAMILY_DRAFT);
  };

  const cancelAddingFamily = () => {
    setAddingFamily(false);
    setNewFamilyDraft(EMPTY_FAMILY_DRAFT);
  };

  const saveNewFamilyMember = async () => {
    if (!userId || !activeHouseholdId) return;

    const name = newFamilyDraft.name.trim();
    if (!name) {
      toast({ title: "Name is required", description: "Just a simple name is enough." });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("family_members")
        .insert({
          household_id: activeHouseholdId,
          user_id: userId,
          name,
          birth_year: newFamilyDraft.birth_year,
          relationship: newFamilyDraft.relationship.trim() || null,
          about: newFamilyDraft.about.trim() || null,
        })
        .select("id,user_id,household_id,name,birth_year,relationship,about,created_at,updated_at")
        .single();

      if (error) throw error;

      const row = data as FamilyMember;
      setFamily((prev) => [...prev, row]);
      setAddingFamily(false);
      setNewFamilyDraft(EMPTY_FAMILY_DRAFT);
      setStatusLine("Added.");
    } catch (e: unknown) {
      toast({ title: "Couldn’t add", description: errorMessage(e) });
      setStatusLine("Couldn’t add right now.");
    }
  };

  const startAddingPet = () => {
    setEditingKey(null);
    setAddingFamily(false);
    setAddingPet(true);
    setNewPetDraft(EMPTY_PET_DRAFT);
  };

  const cancelAddingPet = () => {
    setAddingPet(false);
    setNewPetDraft(EMPTY_PET_DRAFT);
  };

  const saveNewPet = async () => {
    if (!userId || !activeHouseholdId) return;

    const name = newPetDraft.name.trim();
    if (!name) {
      toast({ title: "Name is required", description: "Just a simple name is enough." });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("pets")
        .insert({
          household_id: activeHouseholdId,
          user_id: userId,
          name,
          type: newPetDraft.type.trim() || null,
          notes: newPetDraft.notes.trim() || null,
        })
        .select("id,user_id,household_id,name,type,notes,created_at,updated_at")
        .single();

      if (error) throw error;

      const row = data as Pet;
      setPets((prev) => [...prev, row]);
      setAddingPet(false);
      setNewPetDraft(EMPTY_PET_DRAFT);
      setStatusLine("Added.");
    } catch (e: unknown) {
      toast({ title: "Couldn’t add", description: errorMessage(e) });
      setStatusLine("Couldn’t add right now.");
    }
  };

  return (
    <Page title="Family" subtitle="People and pets Life CFO can keep in mind.">
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        <div className="text-xs text-zinc-500">{loading ? "Loading…" : statusLine}</div>

        {/* Me */}
        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Me</div>
                <div className="text-xs text-zinc-500">Optional. Only what you want Life CFO to consider.</div>
              </div>

              {editingKey === "me" ? (
                <div className="flex items-center gap-2">
                  <Chip onClick={() => void saveMe()}>Save</Chip>
                  <Chip onClick={cancelEdit}>Cancel</Chip>
                </div>
              ) : (
                <Chip onClick={startEditMe}>Edit</Chip>
              )}
            </div>

            {me ? (
              editingKey === "me" ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="text-xs text-zinc-500">Name</div>
                    <input
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                      value={safeStr((drafts["me"] as MeDraft | undefined)?.name)}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          me: {
                            ...(prev.me as MeDraft),
                            name: e.target.value,
                            birth_year: (prev.me as MeDraft)?.birth_year ?? null,
                            about: (prev.me as MeDraft)?.about ?? "",
                          },
                        }))
                      }
                      placeholder="e.g. Em"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs text-zinc-500">Year of birth (optional)</div>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                      value={(drafts["me"] as MeDraft | undefined)?.birth_year == null ? "" : String((drafts["me"] as MeDraft).birth_year)}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          me: {
                            ...(prev.me as MeDraft),
                            name: (prev.me as MeDraft)?.name ?? "",
                            birth_year: e.target.value ? clampYear(e.target.value) : null,
                            about: (prev.me as MeDraft)?.about ?? "",
                          },
                        }))
                      }
                      placeholder="e.g. 1992"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs text-zinc-500">About (optional)</div>
                    <textarea
                      className="min-h-[96px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                      value={safeStr((drafts["me"] as MeDraft | undefined)?.about)}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          me: {
                            ...(prev.me as MeDraft),
                            name: (prev.me as MeDraft)?.name ?? "",
                            birth_year: (prev.me as MeDraft)?.birth_year ?? null,
                            about: e.target.value,
                          },
                        }))
                      }
                      placeholder="Values, goals, constraints…"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm text-zinc-800">{me.name}</div>
                  {me.birth_year ? <div className="text-sm text-zinc-700">Born {me.birth_year}</div> : null}
                  {me.about ? (
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{me.about}</div>
                  ) : (
                    <div className="text-sm text-zinc-500">No notes yet.</div>
                  )}
                </div>
              )
            ) : (
              <div className="text-sm text-zinc-600">Setting up…</div>
            )}
          </CardContent>
        </Card>

        {/* Family members */}
        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-zinc-900">Family</div>

              <div className="flex items-center gap-2">
                {others.length > DEFAULT_LIMIT ? (
                  <Chip onClick={() => setShowAllFamily((v) => !v)}>{showAllFamily ? "Show less" : "Show all"}</Chip>
                ) : null}
                <button
                  type="button"
                  aria-label="Add family member"
                  title="Add family member"
                  disabled={loading || !userId || !activeHouseholdId}
                  onClick={startAddingFamily}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-lg leading-none text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  +
                </button>
              </div>
            </div>

            {addingFamily ? (
              <Card className="border-zinc-200 bg-zinc-50/50">
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-zinc-900">Add family</div>
                    <div className="flex items-center gap-2">
                      <Chip onClick={() => void saveNewFamilyMember()}>Save</Chip>
                      <Chip onClick={cancelAddingFamily}>Cancel</Chip>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-zinc-500">Name</div>
                    <input
                      autoFocus
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                      value={newFamilyDraft.name}
                      onChange={(event) =>
                        setNewFamilyDraft((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="e.g. Alex"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-zinc-500">Relationship (optional)</div>
                    <input
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                      value={newFamilyDraft.relationship}
                      onChange={(event) =>
                        setNewFamilyDraft((current) => ({ ...current, relationship: event.target.value }))
                      }
                      placeholder="e.g. Partner, child, parent"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-zinc-500">Year of birth (optional)</div>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                      value={newFamilyDraft.birth_year == null ? "" : String(newFamilyDraft.birth_year)}
                      onChange={(event) =>
                        setNewFamilyDraft((current) => ({
                          ...current,
                          birth_year: event.target.value ? clampYear(event.target.value) : null,
                        }))
                      }
                      placeholder="e.g. 2019"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-zinc-500">About (optional)</div>
                    <textarea
                      className="min-h-[88px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                      value={newFamilyDraft.about}
                      onChange={(event) =>
                        setNewFamilyDraft((current) => ({ ...current, about: event.target.value }))
                      }
                      placeholder="Anything helpful to keep in mind…"
                    />
                  </div>
                </CardContent>
              </Card>
            ) : others.length === 0 ? (
              <div className="space-y-1 text-sm text-zinc-600">
                <div>No family added yet.</div>
                <div className="text-xs text-zinc-500">
                  Example: Partner, child, parent, or anyone Life CFO should keep in mind.
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                {visibleFamily.map((m) => {
                  const key = `fm:${m.id}`;
                  const isEditing = editingKey === key;
                  const d = drafts[key] as FamilyDraft | undefined;

                  return (
                    <Card key={m.id} className="border-zinc-200 bg-white">
                      <CardContent className="space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-zinc-900">{m.name}</div>
                            <div className="text-xs text-zinc-500">{m.relationship ? m.relationship : "Family member"}</div>
                          </div>

                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <Chip onClick={() => void saveFamily(m)}>Save</Chip>
                              <Chip onClick={cancelEdit}>Cancel</Chip>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Chip onClick={() => startEditFamily(m)}>Edit</Chip>
                              <Chip onClick={() => requestRemoveFamily(m)}>Delete forever</Chip>
                            </div>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <div className="text-xs text-zinc-500">Name</div>
                              <input
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                                value={safeStr(d?.name)}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [key]: {
                                      name: e.target.value,
                                      relationship: safeStr(d?.relationship),
                                      birth_year: d?.birth_year ?? null,
                                      about: safeStr(d?.about),
                                    },
                                  }))
                                }
                              />
                            </div>

                            <div className="space-y-1">
                              <div className="text-xs text-zinc-500">Relationship (optional)</div>
                              <input
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                                value={safeStr(d?.relationship)}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [key]: {
                                      name: safeStr(d?.name),
                                      relationship: e.target.value,
                                      birth_year: d?.birth_year ?? null,
                                      about: safeStr(d?.about),
                                    },
                                  }))
                                }
                                placeholder="e.g. Partner, Child, Mum"
                              />
                            </div>

                            <div className="space-y-1">
                              <div className="text-xs text-zinc-500">Year of birth (optional)</div>
                              <input
                                type="number"
                                inputMode="numeric"
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                                value={d?.birth_year == null ? "" : String(d.birth_year)}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [key]: {
                                      name: safeStr(d?.name),
                                      relationship: safeStr(d?.relationship),
                                      birth_year: e.target.value ? clampYear(e.target.value) : null,
                                      about: safeStr(d?.about),
                                    },
                                  }))
                                }
                                placeholder="e.g. 2019"
                              />
                            </div>

                            <div className="space-y-1">
                              <div className="text-xs text-zinc-500">About (optional)</div>
                              <textarea
                                className="min-h-[96px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                                value={safeStr(d?.about)}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [key]: {
                                      name: safeStr(d?.name),
                                      relationship: safeStr(d?.relationship),
                                      birth_year: d?.birth_year ?? null,
                                      about: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="Anything helpful to keep in mind…"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {m.birth_year ? <div className="text-sm text-zinc-700">Born {m.birth_year}</div> : null}
                            {m.about ? (
                              <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{m.about}</div>
                            ) : (
                              <div className="text-sm text-zinc-500">No notes yet.</div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {others.length > DEFAULT_LIMIT && !showAllFamily ? (
              <div className="text-xs text-zinc-500">
                Showing {Math.min(DEFAULT_LIMIT, others.length)} of {others.length}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Pets */}
        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-zinc-900">Pets</div>

              <div className="flex items-center gap-2">
                {sortedPets.length > DEFAULT_LIMIT ? (
                  <Chip onClick={() => setShowAllPets((v) => !v)}>{showAllPets ? "Show less" : "Show all"}</Chip>
                ) : null}
                <button
                  type="button"
                  aria-label="Add pet"
                  title="Add pet"
                  disabled={loading || !userId || !activeHouseholdId}
                  onClick={startAddingPet}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-lg leading-none text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  +
                </button>
              </div>
            </div>

            {addingPet ? (
              <Card className="border-zinc-200 bg-zinc-50/50">
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-zinc-900">Add pet</div>
                    <div className="flex items-center gap-2">
                      <Chip onClick={() => void saveNewPet()}>Save</Chip>
                      <Chip onClick={cancelAddingPet}>Cancel</Chip>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-zinc-500">Name</div>
                    <input
                      autoFocus
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                      value={newPetDraft.name}
                      onChange={(event) =>
                        setNewPetDraft((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="e.g. Milo"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-zinc-500">Type (optional)</div>
                    <input
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                      value={newPetDraft.type}
                      onChange={(event) =>
                        setNewPetDraft((current) => ({ ...current, type: event.target.value }))
                      }
                      placeholder="e.g. Dog, cat"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-zinc-500">About (optional)</div>
                    <textarea
                      className="min-h-[88px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                      value={newPetDraft.notes}
                      onChange={(event) =>
                        setNewPetDraft((current) => ({ ...current, notes: event.target.value }))
                      }
                      placeholder="Care, routines, or regular costs…"
                    />
                  </div>
                </CardContent>
              </Card>
            ) : sortedPets.length === 0 ? (
              <div className="space-y-1 text-sm text-zinc-600">
                <div>No pets added yet.</div>
                <div className="text-xs text-zinc-500">
                  Example: Dog, cat, or any pet with regular care or costs.
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                {visiblePets.map((p) => {
                  const key = `pet:${p.id}`;
                  const isEditing = editingKey === key;
                  const d = drafts[key] as PetDraft | undefined;

                  return (
                    <Card key={p.id} className="border-zinc-200 bg-white">
                      <CardContent className="space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-zinc-900">{p.name}</div>
                            <div className="text-xs text-zinc-500">{p.type ? p.type : "Pet"}</div>
                          </div>

                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <Chip onClick={() => void savePet(p)}>Save</Chip>
                              <Chip onClick={cancelEdit}>Cancel</Chip>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Chip onClick={() => startEditPet(p)}>Edit</Chip>
                              <Chip onClick={() => requestRemovePet(p)}>Delete forever</Chip>
                            </div>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <div className="text-xs text-zinc-500">Name</div>
                              <input
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                                value={safeStr(d?.name)}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [key]: { name: e.target.value, type: safeStr(d?.type), notes: safeStr(d?.notes) },
                                  }))
                                }
                              />
                            </div>

                            <div className="space-y-1">
                              <div className="text-xs text-zinc-500">Type (optional)</div>
                              <input
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                                value={safeStr(d?.type)}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [key]: { name: safeStr(d?.name), type: e.target.value, notes: safeStr(d?.notes) },
                                  }))
                                }
                                placeholder="e.g. Dog, Cat"
                              />
                            </div>

                            <div className="space-y-1">
                              <div className="text-xs text-zinc-500">About (optional)</div>
                              <textarea
                                className="min-h-[96px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                                value={safeStr(d?.notes)}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [key]: { name: safeStr(d?.name), type: safeStr(d?.type), notes: e.target.value },
                                  }))
                                }
                                placeholder="Health needs, meds, routines, costs…"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {p.notes ? (
                              <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{p.notes}</div>
                            ) : (
                              <div className="text-sm text-zinc-500">No notes yet.</div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {sortedPets.length > DEFAULT_LIMIT && !showAllPets ? (
              <div className="text-xs text-zinc-500">
                Showing {Math.min(DEFAULT_LIMIT, sortedPets.length)} of {sortedPets.length}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Confirm delete modal */}
        {deleteConfirm.open ? (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/20 p-4 sm:items-center">
            <div className="w-full max-w-[520px] rounded-2xl border border-zinc-200 bg-white shadow-lg">
              <div className="space-y-2 p-4 sm:p-5">
                <div className="text-sm font-semibold text-zinc-900">Delete forever?</div>
                <div className="text-sm text-zinc-600">This cannot be undone.</div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <Chip onClick={() => setDeleteConfirm({ open: false })} title="Cancel">
                    Cancel
                  </Chip>
                  <Chip onClick={() => void performDelete()} title="Delete forever" className="border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800">
                    Delete forever
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

