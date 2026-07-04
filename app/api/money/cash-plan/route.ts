import { createCashPlanGetHandler } from "./routeHandler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createCashPlanGetHandler();
