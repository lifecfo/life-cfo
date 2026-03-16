export type UUID = string;
export type ISODateString = string;
export type ISODateTimeString = string;

export type MemoryTier = "tier_a_ephemeral" | "tier_b_candidates" | "tier_c_durable" | "tier_d_revisit";

export type MemoryRole = "user" | "assistant" | "system";
export type CandidateStatus = "draft" | "promoted" | "dismissed" | "expired";
export type ConfidenceLabel = "low" | "medium" | "high" | "unknown";
export type AssumptionStatus = "active" | "validated" | "invalidated" | "archived";
export type DecisionStatus = "open" | "committed" | "closed" | "archived";
export type RevisitTriggerStatus = "active" | "paused" | "closed";
export type RevisitEventStatus = "fired" | "resolved" | "dismissed";

export type DurableMemoryKind =
  | "insight"
  | "assumption"
  | "decision"
  | "revisit_trigger"
  | "revisit_event"
  | "memory_link"
  | "evidence_ref";

export type CandidateType =
  | "insight_candidate"
  | "assumption_candidate"
  | "decision_candidate"
  | "revisit_candidate";

export type PromotionActionType =
  | "save_insight"
  | "track_assumption"
  | "create_decision"
  | "update_decision"
  | "add_revisit_trigger"
  | "dismiss_candidate";

export interface EphemeralThread {
  id: UUID;
  household_id: UUID | null;
  user_id: UUID | null;
  scope: string | null;
  path: string | null;
  created_at: ISODateTimeString;
  last_active_at: ISODateTimeString;
  expires_at: ISODateTimeString | null;
}

export interface EphemeralMessage {
  id: UUID;
  thread_id: UUID;
  role: MemoryRole;
  content: string;
  created_at: ISODateTimeString;
}

export interface EvidenceRef {
  id: UUID;
  household_id: UUID | null;
  user_id: UUID | null;
  source_type: "money_snapshot" | "transaction" | "account" | "bill" | "goal" | "decision" | "ask_message" | "other";
  source_id: string | null;
  label: string | null;
  uri: string | null;
  observed_at: ISODateTimeString | null;
  metadata: Record<string, unknown> | null;
  created_at: ISODateTimeString;
}

export interface Insight {
  id: UUID;
  household_id: UUID;
  title: string;
  statement: string;
  confidence: ConfidenceLabel;
  status: "active" | "archived";
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
}

export interface Assumption {
  id: UUID;
  household_id: UUID;
  title: string;
  statement: string;
  confidence: ConfidenceLabel;
  status: AssumptionStatus;
  invalidated_reason: string | null;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
}

export interface DecisionMemoryObject {
  id: UUID;
  household_id: UUID;
  decision_id: UUID | null;
  title: string;
  rationale: string;
  status: DecisionStatus;
  committed_at: ISODateTimeString | null;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
}

export interface RevisitTrigger {
  id: UUID;
  household_id: UUID;
  decision_id: UUID | null;
  title: string;
  condition_text: string | null;
  trigger_at: ISODateTimeString | null;
  trigger_type: "time" | "condition" | "manual";
  status: RevisitTriggerStatus;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
}

export interface RevisitEvent {
  id: UUID;
  household_id: UUID;
  trigger_id: UUID;
  decision_id: UUID | null;
  status: RevisitEventStatus;
  fired_at: ISODateTimeString;
  resolved_at: ISODateTimeString | null;
  outcome_note: string | null;
}

export interface MemoryLink {
  id: UUID;
  household_id: UUID;
  source_kind: DurableMemoryKind;
  source_id: UUID;
  target_kind: DurableMemoryKind;
  target_id: UUID;
  relation: string;
  created_at: ISODateTimeString;
}

export interface MemoryCandidateBase {
  id: UUID;
  candidate_type: CandidateType;
  thread_id: UUID | null;
  message_id: UUID | null;
  household_id: UUID | null;
  user_id: UUID | null;
  title: string;
  summary: string;
  confidence: ConfidenceLabel;
  status: CandidateStatus;
  created_at: ISODateTimeString;
  expires_at: ISODateTimeString | null;
  evidence_refs: EvidenceRef[];
}

export interface InsightCandidate extends MemoryCandidateBase {
  candidate_type: "insight_candidate";
  draft: Pick<Insight, "title" | "statement" | "confidence">;
}

export interface AssumptionCandidate extends MemoryCandidateBase {
  candidate_type: "assumption_candidate";
  draft: Pick<Assumption, "title" | "statement" | "confidence">;
}

export interface DecisionCandidate extends MemoryCandidateBase {
  candidate_type: "decision_candidate";
  draft: Pick<DecisionMemoryObject, "title" | "rationale" | "status">;
}

export interface RevisitCandidate extends MemoryCandidateBase {
  candidate_type: "revisit_candidate";
  draft: Pick<RevisitTrigger, "title" | "trigger_type" | "condition_text" | "trigger_at">;
}

export type MemoryCandidate = InsightCandidate | AssumptionCandidate | DecisionCandidate | RevisitCandidate;

export interface PromotionAction {
  id: UUID;
  action_type: PromotionActionType;
  candidate_id: UUID | null;
  candidate_type: CandidateType | null;
  thread_id: UUID | null;
  message_id: UUID | null;
  target_kind: DurableMemoryKind | null;
  target_id: UUID | null;
  confirmed_by_user: boolean;
  created_at: ISODateTimeString;
}

export interface AskCandidatePayload {
  insight_candidates?: InsightCandidate[];
  assumption_candidates?: AssumptionCandidate[];
  decision_candidates?: DecisionCandidate[];
  revisit_candidates?: RevisitCandidate[];
}

export interface AskResponseMemory {
  tier: MemoryTier;
  thread?: Pick<EphemeralThread, "id" | "scope" | "path" | "expires_at">;
  promoted_ids?: UUID[];
}

export interface AskResponseBase {
  candidates?: AskCandidatePayload;
  memory?: AskResponseMemory;
}

export type HomeAskAction = "open_bills" | "open_money" | "open_decisions" | "open_review" | "open_chapters" | "none";
export type HomeAskSuggestedNext = "none" | "create_capture" | "open_thinking";

export interface HomeAskCaptureSeed {
  title: string;
  prompt: string;
  notes: string[];
}

export interface HomeAskRequest {
  userId: string;
  question: string;
  path?: string;
  scope?: string | null;
}

export interface HomeAskResponseSuccess extends AskResponseBase {
  answer: string;
  tone: string;
  verdict: string;
  headline: string;
  key_points: string[];
  details: string;
  what_changes_this: string[];
  assumptions: string[];
  action: HomeAskAction;
  suggested_next: HomeAskSuggestedNext;
  capture_seed: HomeAskCaptureSeed | null;
}

export interface MoneyAskRequest {
  q?: string;
  limit?: number;
}

export type MoneyAskMode = "snapshot" | "diagnosis" | "planning" | "affordability" | "scenario" | "search";

export interface MoneyAskSnapshotResponse extends AskResponseBase {
  ok: true;
  mode: "snapshot";
  household_id: string;
  snapshot: unknown;
  explanation: unknown;
  interpretation: unknown;
}

export interface MoneyAskDiagnosisResponse extends AskResponseBase {
  ok: true;
  mode: "diagnosis";
  household_id: string;
  diagnosis: {
    headline: string;
    summary: string;
    drivers: string[];
    signals: {
      structural: string;
      discretionary: string;
      timing: string;
      stability: string;
    };
  };
  interpretation: unknown;
}

export interface MoneyAskPlanningResponse extends AskResponseBase {
  ok: true;
  mode: "planning";
  household_id: string;
  interpretation: unknown;
  planning: {
    headline: string;
    summary: string;
    upcoming: string[];
    notes: string[];
  };
}

export interface MoneyAskAffordabilityResponse extends AskResponseBase {
  ok: true;
  mode: "affordability";
  household_id: string;
  interpretation: unknown;
  affordability: {
    headline: string;
    summary: string;
    signals: string[];
    caveat?: string;
  };
}

export interface MoneyAskScenarioResponse extends AskResponseBase {
  ok: true;
  mode: "scenario";
  household_id: string;
  interpretation: unknown;
  scenario: {
    headline: string;
    summary: string;
    watch: string[];
    caveat?: string;
  };
}

export interface MoneyAskSearchResponse extends AskResponseBase {
  ok: true;
  mode: "search";
  household_id: string;
  role: string | null;
  q: string;
  results: {
    accounts: unknown[];
    bills: unknown[];
    transactions: unknown[];
  };
}

export interface AskErrorResponse {
  ok?: false;
  error: string;
  debug?: Record<string, unknown>;
  version?: string;
}

export type HomeAskResponse = HomeAskResponseSuccess | AskErrorResponse;

export type MoneyAskResponse =
  | MoneyAskSnapshotResponse
  | MoneyAskDiagnosisResponse
  | MoneyAskPlanningResponse
  | MoneyAskAffordabilityResponse
  | MoneyAskScenarioResponse
  | MoneyAskSearchResponse
  | AskErrorResponse;

export interface DecisionConversationRequest {
  decisionTitle?: string;
  decisionStatement?: string;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  mode?: "chat" | "summarise";
}

export interface DecisionConversationChatResponse extends AskResponseBase {
  assistantText: string;
  version: string;
  kind?: string;
}

export interface DecisionConversationSummaryResponse extends AskResponseBase {
  summaryText: string;
  version: string;
  kind?: string;
}

export type DecisionConversationResponse =
  | DecisionConversationChatResponse
  | DecisionConversationSummaryResponse
  | AskErrorResponse;
