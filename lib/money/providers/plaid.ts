import type { MoneyProvider } from "./types";

export const plaidProvider: MoneyProvider = {
  name: "plaid",
  async sync() {
    throw new Error("plaidProvider.sync() not implemented yet.");
  },
};