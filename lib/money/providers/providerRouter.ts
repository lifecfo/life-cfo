import type { ProviderName } from "./types";
import {
  getBasiqAccounts,
  getBasiqTransactions,
  getManualAccounts,
  getManualTransactions,
} from "./index";

/**
 * NOTE:
 * In this file, `userId` should be interpreted as the provider's user identifier.
 * For Basiq, that's the Basiq user id (not your Supabase auth user id).
 * We'll map from connectionId -> basiqUserId in the provider `sync()` later.
 */
export async function getAccounts(provider: ProviderName, userId: string) {
  switch (provider) {
    case "basiq":
      return getBasiqAccounts(userId);
    case "manual":
      return getManualAccounts(userId);
    default:
      throw new Error(`Provider not supported here: ${provider}`);
  }
}

export async function getTransactions(provider: ProviderName, userId: string) {
  switch (provider) {
    case "basiq":
      return getBasiqTransactions(userId);
    case "manual":
      return getManualTransactions(userId);
    default:
      throw new Error(`Provider not supported here: ${provider}`);
  }
}