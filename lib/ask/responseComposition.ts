export function joinNonEmptyLines(lines: string[]): string {
  return lines.filter(Boolean).join("\n");
}

export function bullets(items: string[]): string {
  return items.filter(Boolean).map((x) => `- ${x}`).join("\n");
}

export function memoSection(title: string, lines: string[]): string {
  const body = joinNonEmptyLines(lines);
  return body ? `**${title}**\n${body}` : "";
}

export function joinNonEmptyWithSpace(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildMemoAnswer(params: {
  headline: string;
  key_points?: string[];
  details?: string;
  assumptions?: string[];
  what_changes_this?: string[];
}): string {
  const headline = (params.headline || "").trim();

  const keyPoints = Array.isArray(params.key_points)
    ? params.key_points.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const assumptions = Array.isArray(params.assumptions)
    ? params.assumptions.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const changes = Array.isArray(params.what_changes_this)
    ? params.what_changes_this.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const details = typeof params.details === "string" ? params.details.trim() : "";

  const blocks: string[] = [];
  if (headline) blocks.push(headline);

  const kpBlock = memoSection("Key points", [bullets(keyPoints)]);
  if (kpBlock) blocks.push(kpBlock);

  const detailsBlock = memoSection("Details", [details]);
  if (detailsBlock) blocks.push(detailsBlock);

  const changesBlock = memoSection("What would change this", [bullets(changes)]);
  if (changesBlock) blocks.push(changesBlock);

  const assumptionsBlock = memoSection("Assumptions", [bullets(assumptions)]);
  if (assumptionsBlock) blocks.push(assumptionsBlock);

  return blocks.filter(Boolean).join("\n\n").trim();
}
