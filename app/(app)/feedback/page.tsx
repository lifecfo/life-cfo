import FeedbackClient from "./FeedbackClient";
import { safeNextPath } from "@/lib/http/safeNextPath";

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const params = await Promise.resolve(searchParams);
  const fromParam = params?.from;
  const from = typeof fromParam === "string" ? fromParam : Array.isArray(fromParam) ? fromParam[0] : undefined;
  const originPath = safeNextPath(from, "/feedback");

  return <FeedbackClient originPath={originPath} />;
}
