import { NextResponse } from "next/server";

import { DATA_TABLES } from "@/lib/account/dataRegistry";
import { deletionBlockers, soleMemberHouseholdIds, type DeletionMembership } from "@/lib/account/deletionPlan";
import { planDeleteOwnRows } from "@/lib/account/deleteOwnRowsPlan";
import { collectReceiptPaths, isReceiptStoragePath, RECEIPT_BUCKET } from "@/lib/picture/receiptImage";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const dynamic = "force-dynamic";

function missingRelation(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = (error.message || "").toLowerCase();
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("column")
  );
}

function storageGone(error: { message?: string } | null) {
  const message = (error?.message || "").toLowerCase();
  return message.includes("bucket") || message.includes("not found") || message.includes("does not exist");
}

/**
 * keystone_delete_my_data() removes database rows only.
 * Photo bytes live in the private household-receipts bucket, so this route
 * deletes them with the service role before the receipt rows are removed.
 * Photos linked to a shared household stay with that household.
 */
async function removeStoredReceipts(
  admin: ReturnType<typeof supabaseAdmin>,
  householdIds: string[],
  userId: string
) {
  const paths = new Set<string>();
  const draftIds: string[] = [];

  for (const householdId of householdIds) {
    const { data, error } = await admin.from("household_receipts").select("storage_path").eq("household_id", householdId);
    if (error && !missingRelation(error)) throw new Error(error.message);
    const rowPaths = error
      ? []
      : (data ?? []).map((row) => (typeof row.storage_path === "string" ? row.storage_path : null));
    const names: string[] = [];
    for (let offset = 0; offset < 5000; offset += 100) {
      const listed = await admin.storage.from(RECEIPT_BUCKET).list(householdId, { limit: 100, offset });
      if (listed.error) {
        if (storageGone(listed.error)) break;
        throw new Error(listed.error.message);
      }
      const batch = listed.data ?? [];
      for (const entry of batch) {
        if (entry.name) names.push(entry.name);
      }
      if (batch.length < 100) break;
    }
    for (const path of collectReceiptPaths(householdId, rowPaths, names)) {
      paths.add(path);
    }
  }

  const own = await admin
    .from("household_receipts")
    .select("id, storage_path, household_id")
    .eq("created_by", userId)
    .is("item_id", null);
  if (own.error) {
    if (!missingRelation(own.error)) throw new Error(own.error.message);
  } else {
    for (const row of own.data ?? []) {
      const storagePath = typeof row.storage_path === "string" ? row.storage_path : "";
      if (isReceiptStoragePath(storagePath)) paths.add(storagePath);
      const householdId = typeof row.household_id === "string" ? row.household_id : "";
      if (typeof row.id === "string" && householdId && !householdIds.includes(householdId)) draftIds.push(row.id);
    }
  }

  const list = [...paths];
  for (let index = 0; index < list.length; index += 100) {
    const removed = await admin.storage.from(RECEIPT_BUCKET).remove(list.slice(index, index + 100));
    if (removed.error && !storageGone(removed.error)) throw new Error(removed.error.message);
  }
  for (const id of draftIds) {
    const { error } = await admin.from("household_receipts").delete().eq("id", id);
    if (error && !missingRelation(error)) throw new Error(error.message);
  }
}

async function deleteWhere(
  admin: ReturnType<typeof supabaseAdmin>,
  table: string,
  column: "user_id" | "household_id",
  value: string
) {
  const { error } = await admin.from(table).delete().eq(column, value);
  if (error && !missingRelation(error)) {
    throw new Error(error.message || `Couldn't delete ${table}.`);
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { confirm?: unknown };
    if (body.confirm !== "DELETE") {
      return NextResponse.json(
        { ok: false, error: "Type DELETE to confirm account deletion." },
        { status: 400 }
      );
    }

    const preflight = await fetch(new URL("/api/settings/delete/preflight", req.url), {
      headers: { cookie: req.headers.get("cookie") || "" },
    });
    const plan = (await preflight.json().catch(() => null)) as {
      ok?: boolean;
      self_service_allowed?: boolean;
      blockers?: unknown[];
      memberships?: DeletionMembership[];
    } | null;
    if (!preflight.ok || !plan?.ok) {
      return NextResponse.json({ ok: false, error: "Life CFO couldn't check this account yet." }, { status: 503 });
    }
    if (!plan.self_service_allowed) {
      return NextResponse.json(
        { ok: false, error: "This account can't be deleted until the remaining items are cleared.", blockers: plan.blockers ?? [] },
        { status: 409 }
      );
    }

    const admin = supabaseAdmin();
    const memberships = Array.isArray(plan.memberships) ? plan.memberships : [];
    if (deletionBlockers(memberships).length > 0) {
      return NextResponse.json({ ok: false, error: "This account can't be deleted yet." }, { status: 409 });
    }

    await removeStoredReceipts(admin, soleMemberHouseholdIds(memberships), user.id);

    // Only a household where this user is the sole member is deleted outright.
    // A shared household (and everyone's bills/categories/decisions/etc. inside
    // it) is never touched here, no matter how many of its tables this loop
    // covers -- see soleMemberHouseholdIds in lib/account/deletionPlan.ts.
    for (const householdId of soleMemberHouseholdIds(memberships)) {
      for (const table of DATA_TABLES) {
        if (!table.householdIdColumn) continue;
        await deleteWhere(admin, table.table, table.householdIdColumn, householdId);
      }
      const { error: householdError } = await admin.from("households").delete().eq("id", householdId);
      if (householdError && !missingRelation(householdError)) {
        throw new Error(householdError.message);
      }
    }

    const { error: membershipError } = await admin.from("household_members").delete().eq("user_id", user.id);
    if (membershipError && !missingRelation(membershipError)) {
      throw new Error(membershipError.message);
    }

    for (const table of DATA_TABLES) {
      const plan = planDeleteOwnRows(table);
      if (!plan) continue;

      // A table scoped to a household belongs to that household, not to any
      // one member -- only this user's rows with no household at all go
      // here. Rows tied to a (shared) household already got handled above
      // if that household was being deleted outright; otherwise they stay
      // for the remaining members.
      let query = admin.from(table.table).delete().eq(table.userIdColumn!, user.id);
      if (plan.kind === "by_user_and_household_null") {
        query = query.is(table.householdIdColumn!, null);
      }
      const { error } = await query;
      if (error && !missingRelation(error)) {
        throw new Error(error.message || `Couldn't delete ${table.table}.`);
      }
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(user.id);
    if (authDeleteError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Household data was removed, but the sign-in account could not be deleted. Email admin@life-cfo.com.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      deleted: true,
      kept_shared_households: memberships.filter((membership) => membership.member_count > 1).map((membership) => membership.household_id),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Please try again." },
      { status: 500 }
    );
  }
}
