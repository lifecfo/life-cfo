"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui";
import { formatMoneyFromCents } from "@/lib/money/formatMoney";

type Member = { user_id: string; role: string; label: string };
type Item = {
  id: string;
  kind: string;
  title: string;
  amount_cents: number | null;
  currency: string | null;
  due_on: string | null;
  assignee_user_id: string | null;
};
type Reminder = {
  id: string;
  title: string;
  remind_on: string;
  assignee_user_id: string | null;
  seen: boolean;
};
type Change = { id: string; title: string; verb: string; actor: string; at: string };
type Decision = { id: string; title: string; review_at: string | null };

type Picture = {
  household_id: string | null;
  members: Member[];
  items: Item[];
  reminders: Reminder[];
  recent_changes: Change[];
  decisions: Decision[];
  notice: string | null;
};

function auDate(iso: string | null): string {
  if (!iso) return "No date";
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function labelFor(members: Member[], userId: string | null): string {
  if (!userId) return "Unassigned";
  return members.find((member) => member.user_id === userId)?.label ?? "Household member";
}

export function HouseholdPicture() {
  const [picture, setPicture] = useState<Picture | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/picture", { cache: "no-store" });
    if (response.status === 401) {
      setPicture({
        household_id: null,
        members: [],
        items: [],
        reminders: [],
        recent_changes: [],
        decisions: [],
        notice: null,
      });
      return;
    }
    const json = (await response.json().catch(() => null)) as (Picture & { error?: string }) | null;
    if (!response.ok || !json) {
      setError(json?.error || "The shared picture could not be loaded.");
      return;
    }
    setPicture(json);
    setError(null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function assign(itemId: string, assignee: string) {
    await fetch(`/api/picture/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee_user_id: assignee || null }),
    });
    await load();
  }

  async function markSeen(reminderId: string) {
    await fetch(`/api/picture/reminders/${reminderId}/seen`, { method: "POST" });
    await load();
  }

  if (error) {
    return <p className="text-sm text-zinc-600">{error}</p>;
  }
  if (!picture) {
    return <p className="text-sm text-zinc-600">Loading the shared picture...</p>;
  }

  const dated = picture.items.filter((item) => item.due_on);
  const undated = picture.items.filter((item) => !item.due_on);

  return (
    <Card className="border-neutral-border bg-neutral-surface shadow-none">
      <CardContent className="space-y-6">
        <div>
          <h2 className="text-base font-semibold text-neutral-text">Shared household picture</h2>
          <p className="mt-1 text-sm leading-6 text-neutral-text-2">
            Bills, renewals, and dates the household typed, and who is looking after each one. These are the figures that were entered.
          </p>
          {picture.notice ? <p className="mt-2 text-sm text-zinc-600">{picture.notice}</p> : null}
          {!picture.household_id ? (
            <p className="mt-2 text-sm text-zinc-600">
              <Link className="underline" href="/start">
                Start with a brain dump
              </Link>{" "}
              to put the first items here.
            </p>
          ) : null}
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-900">Coming up</h3>
          {dated.length === 0 && undated.length === 0 ? (
            <p className="text-sm text-zinc-600">Nothing is typed yet.</p>
          ) : null}
          {dated.map((item) => (
            <ItemRow key={item.id} item={item} members={picture.members} onAssign={assign} />
          ))}
          {undated.map((item) => (
            <ItemRow key={item.id} item={item} members={picture.members} onAssign={assign} />
          ))}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-900">Reminders</h3>
          <p className="text-sm leading-6 text-zinc-600">
            Due dates show here for everyone in the household. Reminders aren&apos;t emailed in this beta.
          </p>
          {picture.reminders.length === 0 ? <p className="text-sm text-zinc-600">No due-date reminders yet.</p> : null}
          {picture.reminders.map((reminder) => (
            <div key={reminder.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-neutral-border bg-neutral-bg px-4 py-3">
              <div className="text-sm text-zinc-800">
                <div className="font-medium text-zinc-900">{reminder.title}</div>
                <div>
                  {auDate(reminder.remind_on)} · {labelFor(picture.members, reminder.assignee_user_id)}
                  {reminder.seen ? " · Seen by you" : ""}
                </div>
              </div>
              {reminder.seen ? null : (
                <button type="button" className="text-sm text-zinc-700 underline" onClick={() => void markSeen(reminder.id)}>
                  Mark seen
                </button>
              )}
            </div>
          ))}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-900">Recent changes by someone else</h3>
          {picture.recent_changes.length === 0 ? (
            <p className="text-sm text-zinc-600">No changes from another member in the last 14 days.</p>
          ) : (
            picture.recent_changes.map((change) => (
              <p key={change.id} className="text-sm text-zinc-800">
                {change.actor} {change.verb} {change.title} on {auDate(change.at)}.
              </p>
            ))
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-900">Open decisions</h3>
          {picture.decisions.length === 0 ? <p className="text-sm text-zinc-600">No open decisions.</p> : null}
          {picture.decisions.map((decision) => (
            <div key={decision.id} className="text-sm text-zinc-800">
              <span className="font-medium text-zinc-900">{decision.title}</span>
              {decision.review_at ? ` · Review ${auDate(decision.review_at)}` : ""}
              {" · "}
              <Link className="underline" href={`/decisions/${decision.id}/pack`}>
                Print pack
              </Link>
            </div>
          ))}
        </section>
      </CardContent>
    </Card>
  );
}

function ItemRow({
  item,
  members,
  onAssign,
}: {
  item: Item;
  members: Member[];
  onAssign: (itemId: string, assignee: string) => Promise<void>;
}) {
  const amount =
    item.amount_cents == null ? "No amount" : formatMoneyFromCents(item.amount_cents, item.currency || "AUD");
  return (
    <div className="grid gap-2 rounded-2xl border border-neutral-border bg-neutral-bg px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="text-sm text-zinc-800">
        <div className="font-medium text-zinc-900">{item.title}</div>
        <div>
          {item.kind} · {auDate(item.due_on)} · {amount}
        </div>
      </div>
      <label className="text-sm text-zinc-600">
        Looking after
        <select
          className="mt-1 block rounded-xl border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900"
          value={item.assignee_user_id ?? ""}
          onChange={(event) => void onAssign(item.id, event.target.value)}
        >
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
