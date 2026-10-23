import { timingSafeEqual } from "node:crypto";

import { getLifeCfoAccess, hasInviteMetadata, type LifeCfoAccess } from "./lifeCfoAccess";

export type BetaUser = {
  id?: string;
  email?: string | null;
  app_metadata?: unknown;
};

function splitList(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function betaInviteCodes(): string[] {
  return splitList(process.env.LIFE_CFO_BETA_INVITE_CODES);
}

export function betaEmailAllowlist(): string[] {
  return splitList(process.env.LIFE_CFO_BETA_EMAIL_ALLOWLIST).map((email) => email.toLowerCase());
}

export function isEmailAllowlisted(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = betaEmailAllowlist();
  if (allowlist.length === 0) return false;
  return allowlist.includes(email.trim().toLowerCase());
}

export function inviteCodeMatches(code: string): boolean {
  const attempt = code.trim();
  const codes = betaInviteCodes();
  if (!attempt || codes.length === 0) return false;

  const attemptBytes = Buffer.from(attempt);
  return codes.some((candidate) => {
    const candidateBytes = Buffer.from(candidate);
    if (candidateBytes.length !== attemptBytes.length) {
      timingSafeEqual(attemptBytes, attemptBytes);
      return false;
    }
    return timingSafeEqual(candidateBytes, attemptBytes);
  });
}

export function betaAccessForUser(user: BetaUser, options?: { hasAccessRow?: boolean }): LifeCfoAccess & {
  isInvited: boolean;
} {
  const base = getLifeCfoAccess(user);
  const isInvited =
    base.isDeveloper ||
    hasInviteMetadata(user) ||
    isEmailAllowlisted(user.email) ||
    options?.hasAccessRow === true;
  return { ...base, isInvited };
}
