const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseWaitlistEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 6 || email.length > 200) return null;
  if (!EMAIL.test(email)) return null;
  return email;
}
