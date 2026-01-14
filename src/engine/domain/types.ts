// src/engine/domain/types.ts

export type UUID = string;

export type Account = {
  id: UUID;
  user_id: UUID;
  name: string;
  provider?: string | null;
  type?: string | null;
  status?: string | null;
  created_at?: string | null;
};

export type Transaction = {
  id: UUID;
  user_id: UUID;
  account_id: UUID;
  date: string; // YYYY-MM-DD
  amount: number; // positive = inflow, negative = outflow (we'll standardize later if needed)
  description: string;
  merchant?: string | null;
  category?: string | null;
  pending?: boolean | null;
  created_at?: string | null;
};

export type Bill = {
  id: UUID;
  user_id: UUID;
  merchant_key: string;
  nickname?: string | null;
  due_day_or_date: string; // "15" OR "2026-02-01"
  expected_amount?: number | null;
  status?: string | null; // "active" | "archived"
  created_at?: string | null;
};

export type RecurringPattern = {
  id: UUID;
  user_id: UUID;
  merchant_key: string;
  cadence: string; // weekly | fortnightly | monthly (we’ll keep flexible)
  avg_amount?: number | null;
  next_due_date?: string | null; // YYYY-MM-DD
  confidence: number; // 0..1
  created_at?: string | null;
  status?: "pending" | "confirmed" | "ignored" | null;
  confirmed_at?: string | null;
  ignored_at?: string | null;
};

export type EngineInsight = {
  type: string; // info | warning | recommendation | action
  severity?: number; // 1..5
  payload: Record<string, unknown>;
};
