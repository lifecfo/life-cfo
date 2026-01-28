"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Button, Card, CardContent, Chip, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

type FamilyMember = {
  id: string;
  name: string;
  birth_year: number | null;
  relationship: string | null;
};

type Pet = {
  id: string;
  name: string;
  type: string | null;
  notes: string | null;
};

export default function FamilyPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);

  const [showFamily, setShowFamily] = useState<boolean | null>(null);
  const [showPets, setShowPets] = useState<boolean | null>(null);

  // forms
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [birthYear, setBirthYear] = useState("");

  const [petName, setPetName] = useState("");
  const [petType, setPetType] = useState("");

  async function loadAll() {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;

      const [{ data: fm }, { data: pt }] = await Promise.all([
        supabase.from("family_members").select("*").order("created_at"),
        supabase.from("pets").select("*").order("created_at"),
      ]);

      setMembers(fm ?? []);
      setPets(pt ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function addFamily() {
    if (!name.trim()) return;

    await supabase.from("family_members").insert({
      name: name.trim(),
      relationship: relationship.trim() || null,
      birth_year: birthYear ? Number(birthYear) : null,
    });

    setName("");
    setRelationship("");
    setBirthYear("");
    toast({ title: "Saved" });
    loadAll();
  }

  async function addPet() {
    if (!petName.trim()) return;

    await supabase.from("pets").insert({
      name: petName.trim(),
      type: petType.trim() || null,
    });

    setPetName("");
    setPetType("");
    toast({ title: "Saved" });
    loadAll();
  }

  return (
    <Page title="Family" subtitle="The people (and pets) who share daily life with you.">
      <div className="space-y-6">

        {/* ME */}
        <Card>
          <CardContent className="space-y-2">
            <div className="text-sm font-medium text-zinc-800">Me</div>
            <div className="text-sm text-zinc-600">
              This helps Keystone understand your decisions.
            </div>
          </CardContent>
        </Card>

        {/* FAMILY QUESTION */}
        <Card>
          <CardContent className="space-y-3">
            <div className="text-sm font-medium text-zinc-800">
              Do you share daily life or responsibilities with any family members?
            </div>

            <div className="flex gap-2">
              <Chip active={showFamily === false} onClick={() => setShowFamily(false)}>
                Just me
              </Chip>
              <Chip active={showFamily === true} onClick={() => setShowFamily(true)}>
                Yes, add family
              </Chip>
            </div>
          </CardContent>
        </Card>

        {/* FAMILY LIST */}
        {showFamily && (
          <Card>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  placeholder="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-xl border px-3 py-2 text-sm"
                />
                <input
                  placeholder="Relationship (optional)"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="rounded-xl border px-3 py-2 text-sm"
                />
                <input
                  placeholder="Birth year (optional)"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  className="rounded-xl border px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={addFamily}>Add family member</Button>
              </div>

              {members.map((m) => (
                <div key={m.id} className="text-sm text-zinc-700">
                  <strong>{m.name}</strong>
                  {m.relationship && ` · ${m.relationship}`}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* PETS QUESTION */}
        <Card>
          <CardContent className="space-y-3">
            <div className="text-sm font-medium text-zinc-800">
              Do you have pets that are part of your daily life?
            </div>

            <div className="flex gap-2">
              <Chip active={showPets === false} onClick={() => setShowPets(false)}>
                No
              </Chip>
              <Chip active={showPets === true} onClick={() => setShowPets(true)}>
                Yes, add a pet
              </Chip>
            </div>
          </CardContent>
        </Card>

        {/* PETS LIST */}
        {showPets && (
          <Card>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  placeholder="Pet name"
                  value={petName}
                  onChange={(e) => setPetName(e.target.value)}
                  className="rounded-xl border px-3 py-2 text-sm"
                />
                <input
                  placeholder="Type (Dog, Cat, etc.)"
                  value={petType}
                  onChange={(e) => setPetType(e.target.value)}
                  className="rounded-xl border px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={addPet}>Add pet</Button>
              </div>

              {pets.map((p) => (
                <div key={p.id} className="text-sm text-zinc-700">
                  <strong>{p.name}</strong>
                  {p.type && ` · ${p.type}`}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {loading && <div className="text-sm text-zinc-500">Loading…</div>}
      </div>
    </Page>
  );
}
