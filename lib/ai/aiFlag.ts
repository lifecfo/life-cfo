/** Server switch. Only the exact string "true" turns AI calls on. */
export function isAiEnabled(): boolean {
  return process.env.LIFE_CFO_AI_ENABLED === "true";
}
