import { redirect } from "next/navigation";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const params = await Promise.resolve(searchParams);
  const nextParam = params?.next;
  const next = typeof nextParam === "string" ? nextParam : Array.isArray(nextParam) ? nextParam[0] : "/home";
  redirect(`/fine-print?next=${encodeURIComponent(next || "/home")}`);
}
