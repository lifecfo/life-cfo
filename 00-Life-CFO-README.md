Life CFO

Life CFO is a household-scoped financial intelligence system designed to reduce cognitive load around money decisions.
It is built as a question-first reasoning layer over structured financial data, not as a budgeting dashboard or transaction tracker.
________________________________________
System Overview
Life CFO is composed of three primary layers:
1.	Data Layer (Ground Truth)
2.	Reasoning Layer (Ask Engine)
3.	Containment Layer (Decision Memory)
The system prioritizes:
•	Deterministic data retrieval
•	Explicit assumption handling
•	Non-autonomous AI behavior
•	Calm UX (no urgency or alert-driven loops)
________________________________________
Core Architecture
Frontend
•	Next.js (App Router)
•	Server Components + Route Handlers
•	TailwindCSS
•	Progressive disclosure UX model
Backend
•	Supabase (Postgres)
•	Row-Level Security (RLS)
•	SECURITY DEFINER functions for scoped access
•	Household-based access boundary
Auth
•	Supabase Auth
•	Centralized identity
•	Household membership model
Hosting
•	Vercel (Frontend)
•	Supabase Cloud (Database)
________________________________________
Data Model
Life CFO operates on a strict household boundary.
All financial entities are scoped by:
household_id (NOT NULL, indexed)
Core tables include:
•	households
•	household_members
•	accounts
•	transactions
•	external_accounts
•	decisions
•	decision_summaries
•	attachments
RLS policies enforce:
•	SELECT for household members
•	INSERT / UPDATE / DELETE restricted by role (owner / editor)
No user-based isolation.
The household is the global workspace.
________________________________________
Money Layer
The Money module is not a dashboard.
It is an orientation hub with:
•	Search-first query input
•	Top-5 surfaced items
•	Drill-down depth
•	Progressive disclosure
Automatic connections:
•	Plaid (primary integration)
•	Manual fallback supported
All external connections are abstracted behind provider layers to allow future expansion.
________________________________________
Ask Engine
The Ask system operates under strict constraints:
•	Retrieval-first (never hallucinate missing data)
•	Single-pass reasoning where possible
•	Escalation to framing when ambiguity exists
•	No auto-commit of conclusions
•	No urgency framing
Ask responses must:
•	Reference real user data
•	State assumptions explicitly
•	Surface trade-offs
•	Offer confidence bounds
•	Suggest revisit triggers when relevant
________________________________________
Decision Containment Model
Decisions move through a lifecycle:
1.	Capture
2.	Thinking
3.	Decision
4.	Revisit
5.	Chapter
Conclusions are:
•	Explicitly user-approved
•	Persisted with assumptions
•	Resurfaced only when justified
The system avoids:
•	Notification loops
•	“Productivity” gamification
•	Forced engagement
Non-engagement is considered a success state.
________________________________________
Security Model
•	TLS in transit
•	Encryption at rest
•	Household-scoped RLS
•	No password storage
•	No financial movement permissions
•	No silent background changes
AI operates as a bounded reasoning layer only.
Life CFO does not:
•	Execute transactions
•	Initiate transfers
•	Act autonomously
•	Modify data without explicit user action
________________________________________
Development Setup
Clone:
git clone https://github.com/lifecfo/life-cfo.git
cd life-cfo
Install:
npm install
Run locally:
npm run dev
Environment variables required:
•	Supabase URL
•	Supabase anon key
•	Supabase service role key (server only)
•	Plaid credentials (if using live connections)
________________________________________
Deployment
Production:
•	Vercel
Database:
•	Supabase (managed Postgres)
Schema changes:
•	SQL migrations applied manually via Supabase SQL editor
________________________________________
Roadmap Direction
•	Full financial automation layer
•	Improved reasoning transparency
•	Provider abstraction expansion
•	Advanced constraint modeling
•	Household multi-role UX refinement
________________________________________
Philosophy
Life CFO is designed to:
•	Reduce vigilance
•	Contain decisions
•	Eliminate re-litigation
•	Replace dashboards with clarity
Silence is a feature.

