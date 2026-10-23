export function factualMoneyHeadline(sampleData: boolean): string {
  return sampleData
    ? "Sample data. These figures are from a demo household, not money you typed."
    : "Figures from what has been entered.";
}

export function factualMoneySummary(summary: string, sampleData: boolean): string {
  const body = summary.trim();
  if (!sampleData) return body;
  if (body.toLowerCase().startsWith("sample data")) return body;
  return `Sample data. ${body}`;
}
