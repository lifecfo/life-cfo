// app/(app)/family/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Button, Card, CardContent, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

type FamilyMember = {
  id: string;
  user_id: string;
  name: string;
  birth_year: number;
  relationship: string | null;
  created_at: string;
  updated_at: string;
};

function currentYear() {
  return new Date().getFullYear();
}

function safeAge(birthYear: number) {
  const y = currentYear();
  const age = y - birthYear;
  if (!Number.isFinite(age)) return null;
  if (age < 0 || age > 130) return null;
  return age;
}

export default function FamilyPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [members, setMembers] = useState<FamilyMember[]>([]);

  // Add form
  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState<string>("");
  const [relationship, setRelationship] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBirthYear, setEditBirthYear] = useState<string>("");
  const [editRelationship, setEditRelationship] = useState("");

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      // newest first; stable & simple
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    });
  }, [members]);

  async function loadMembers() {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        setMembers([]);
        return;
      }

      const { data, error } = await supabase
        .from("family_members")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setMembers((data as FamilyMember[]) ?? []);
    } catch (e: any) {
      toast({
        title: "Couldn’t load Family",
        description: e?.message ?? "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function validateBirthYearString(value: string) {
    const y = Number(value);
    if (!Number.isFinite(y) || !Number.isInteger(y)) return { ok: false, y: 0 };
    const now = currentYear();
    if (y < 1900 || y > now) return { ok: false, y };
    return { ok: true, y };
  }

  async function addMember() {
    if (saving) return;

    const trimmedName = name.trim();
    const rel = relationship.trim();

    if (!trimmedName) {
      toast({ title: "Name is required" });
      return;
    }

    const by = validateBirthYearString(birthYear.trim());
    if (!by.ok) {
      toast({ title: "Please enter a valid birth year" });
      return;
    }

    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) throw new Error("Not signed in.");

      const { error } = await supabase.from("family_members").insert({
        user_id: user.id,
        name: trimmedName,
        birth_year: by.y,
        relationship: rel ? rel : null,
      });

      if (error) throw error;

      setName("");
      setBirthYear("");
      setRelationship("");

      toast({ title: "Saved" });
      await loadMembers();
    } catch (e: any) {
      toast({
        title: "Couldn’t save",
        description: e?.message ?? "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(m: FamilyMember) {
    setEditingId(m.id);
    setEditName(m.name ?? "");
    setEditBirthYear(String(m.birth_year ?? ""));
    setEditRelationship(m.relationship ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditBirthYear("");
    setEditRelationship("");
  }

  async function saveEdit(id: string) {
    if (saving) return;

    const trimmedName = editName.trim();
    const rel = editRelationship.trim();

    if (!trimmedName) {
      toast({ title: "Name is required" });
      return;
    }

    const by = validateBirthYearString(editBirthYear.trim());
    if (!by.ok) {
      toast({ title: "Please enter a valid birth year" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("family_members")
        .update({
          name: trimmedName,
          birth_year: by.y,
          relationship: rel ? rel : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Saved" });
      cancelEdit();
      await loadMembers();
    } catch (e: any) {
      toast({
        title: "Couldn’t save",
        description: e?.message ?? "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(id: string) {
    if (saving) return;

    const ok = window.confirm("Remove this family member?");
    if (!ok) return;

    setSaving(true);
    try {
      const { error } = await supabase.from("family_members").delete().eq("id", id);
      if (error) throw error;

      toast({ title: "Removed" });
      await loadMembers();
    } catch (e: any) {
      toast({
        title: "Couldn’t remove",
        description: e?.message ?? "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page title="Family" subtitle="These people help Keystone understand your decisions.">
      <div className="space-y-4">
        {/* Add */}
        <Card>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label className="mb-1 block text-sm text-zinc-600">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Hannah"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="mb-1 block text-sm text-zinc-600">Birth year</label>
                <input
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  inputMode="numeric"
                  placeholder="e.g. 2022"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="mb-1 block text-sm text-zinc-600">Relationship (optional)</label>
                <input
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  placeholder="e.g. Child"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-end">
              <Button onClick={addMember} disabled={saving}>
                Add family member
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-sm text-zinc-500">Loading…</div>
          ) : sortedMembers.length === 0 ? (
            <Card>
              <CardContent>
                <div className="text-sm text-zinc-600">
                  No one added yet. Add the people you’re making decisions for.
                </div>
              </CardContent>
            </Card>
          ) : (
            sortedMembers.map((m) => {
              const age = safeAge(m.birth_year);
              const isEditing = editingId === m.id;

              return (
                <Card key={m.id}>
                  <CardContent className="space-y-3">
                    {!isEditing ? (
                      <>
                        <div className="space-y-1">
                          <div className="text-base font-medium text-zinc-900">{m.name}</div>
                          <div className="text-sm text-zinc-600">
                            {age !== null ? `Age ${age}` : "Age —"}
                            {m.relationship ? ` · ${m.relationship}` : ""}
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <Button variant="secondary" onClick={() => startEdit(m)} disabled={saving}>
                            Edit
                          </Button>
                          <Button variant="ghost" onClick={() => removeMember(m.id)} disabled={saving}>
                            Remove
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <div className="sm:col-span-1">
                            <label className="mb-1 block text-sm text-zinc-600">Name</label>
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                            />
                          </div>

                          <div className="sm:col-span-1">
                            <label className="mb-1 block text-sm text-zinc-600">Birth year</label>
                            <input
                              value={editBirthYear}
                              onChange={(e) => setEditBirthYear(e.target.value)}
                              inputMode="numeric"
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                            />
                          </div>

                          <div className="sm:col-span-1">
                            <label className="mb-1 block text-sm text-zinc-600">Relationship (optional)</label>
                            <input
                              value={editRelationship}
                              onChange={(e) => setEditRelationship(e.target.value)}
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" onClick={cancelEdit} disabled={saving}>
                            Cancel
                          </Button>
                          <Button onClick={() => saveEdit(m.id)} disabled={saving}>
                            Save
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </Page>
  );
}
