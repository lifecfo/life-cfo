// lib/household.ts
import { cookies } from "next/headers";

export const ACTIVE_HOUSEHOLD_COOKIE = "lifecfo_household";

export async function getActiveHouseholdCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_HOUSEHOLD_COOKIE)?.value ?? null;
}