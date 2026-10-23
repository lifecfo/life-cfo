import { SHEET_TEMPLATE } from "@/lib/picture/sheetRows";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(SHEET_TEMPLATE, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="life-cfo-household-template.csv"',
      "cache-control": "no-store",
    },
  });
}
