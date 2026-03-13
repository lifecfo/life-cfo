export function cleanLines(values: Array<string | null | undefined>) {
  return values
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

export function section(title: string, items: string[]) {
  const cleaned = cleanLines(items);
  if (!cleaned.length) return null;
  return `${title}\n- ${cleaned.join("\n- ")}`;
}

export function paragraph(...parts: Array<string | null | undefined>) {
  return cleanLines(parts).join(" ");
}

export function composeMessage(sections: Array<string | null | undefined>) {
  return cleanLines(sections).join("\n\n");
}
