// lib/money/plaidClient.ts
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

type PlaidEnvName = "sandbox" | "development" | "production";

function getPlaidEnv(): PlaidEnvName {
  const raw = String(process.env.PLAID_ENV || "sandbox").trim().toLowerCase();

  if (raw === "production") return "production";
  if (raw === "development") return "development";
  return "sandbox";
}

function getPlaidSecret(env: PlaidEnvName): string {
  if (env === "sandbox") {
    return String(process.env.PLAID_SANDBOX_SECRET || "").trim();
  }

  return String(process.env.PLAID_SECRET || "").trim();
}

function getPlaidBase(env: PlaidEnvName) {
  switch (env) {
    case "production":
      return PlaidEnvironments.production;
    case "development":
      return PlaidEnvironments.development;
    default:
      return PlaidEnvironments.sandbox;
  }
}

function getCountryCodes(): string[] {
  const raw = String(process.env.PLAID_COUNTRY_CODES || "US").trim();
  return raw
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

function getProducts(): string[] {
  const raw = String(process.env.PLAID_PRODUCTS || "transactions").trim();
  return raw
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

export function getPlaidConfig() {
  const env = getPlaidEnv();
  const clientId = String(process.env.PLAID_CLIENT_ID || "").trim();
  const secret = getPlaidSecret(env);
  const countryCodes = getCountryCodes();
  const products = getProducts();
  const redirectUri = String(process.env.PLAID_REDIRECT_URI || "").trim();

  if (!clientId) throw new Error("Missing PLAID_CLIENT_ID");
  if (!secret) {
    throw new Error(
      env === "sandbox" ? "Missing PLAID_SANDBOX_SECRET" : "Missing PLAID_SECRET"
    );
  }

  return {
    env,
    clientId,
    secret,
    countryCodes,
    products,
    redirectUri,
  };
}

export function getPlaidClient() {
  const cfg = getPlaidConfig();

  const configuration = new Configuration({
    basePath: getPlaidBase(cfg.env),
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": cfg.clientId,
        "PLAID-SECRET": cfg.secret,
      },
    },
  });

  return new PlaidApi(configuration);
}

export function getPlaidDiag() {
  const cfg = getPlaidConfig();

  return {
    env: cfg.env,
    countryCodes: cfg.countryCodes,
    products: cfg.products,
    hasRedirectUri: Boolean(cfg.redirectUri),
    clientIdPresent: Boolean(cfg.clientId),
    secretPresent: Boolean(cfg.secret),
  };
}