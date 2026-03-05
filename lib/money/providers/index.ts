import type { MoneyProvider, ProviderName } from "./types";
import { manualProvider } from "./manual";
import { basiqProvider } from "./basiq";
import { plaidProvider } from "./plaid";

const registry: Record<ProviderName, MoneyProvider> = {
  manual: manualProvider,
  plaid: plaidProvider,
  basiq: basiqProvider,
};

export function getProvider(provider: string): MoneyProvider {
  const key = provider as ProviderName;

  if (!registry[key]) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  return registry[key];
}