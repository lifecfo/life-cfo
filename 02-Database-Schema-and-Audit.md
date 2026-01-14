**Keystone — Database Schema \& Audit Model (v1)**



**Status**



**Canonical — Locked unless a data integrity or safety issue is found**



1\. Design Principles (Why the DB looks this way)



The database exists to:



enforce human authority



prevent silent scope expansion



guarantee auditability



make unsafe actions impossible



support silence by default



The database is not an analytics store, engagement tracker, or optimisation engine.



Every table answers one question:



“What must be true for this system to be safe?”



2\. Tenancy Model (Critical)

2.1 Household as the Primary Boundary



All user data belongs to a household



A household may contain one or more users



No data crosses household boundaries



household\_id = hard isolation boundary





There is no concept of “global user data.”



3\. Core Tables (v1)

3.1 households



Represents a single trusted unit (individual or family).



Field	Type	Notes

id	UUID (PK)	Immutable

created\_at	timestamp	

status	enum	active / paused / closed

3.2 users



Authenticated humans within a household.



Field	Type	Notes

id	UUID (PK)	

household\_id	UUID (FK)	RLS enforced

email	text	Auth provider

role	enum	owner / member

created\_at	timestamp	



Only owners can grant structural consent.



3.3 accounts (Bank / Financial Accounts)



Represents external financial sources (abstracted).



Field	Type	Notes

id	UUID (PK)	

household\_id	UUID (FK)	

provider	text	abstracted (not bank name)

masked\_label	text	e.g. “Everyday account”

created\_at	timestamp	



Sensitive identifiers are never stored in plaintext.



3.4 transactions



Raw financial events (immutable).



Field	Type	Notes

id	UUID (PK)	

household\_id	UUID (FK)	

account\_id	UUID (FK)	

posted\_at	timestamp	

amount\_cents	integer	+ in / − out

description	text	

merchant	text	nullable

created\_at	timestamp	



Transactions are append-only.

Corrections create new rows — never updates.



4\. Derived Structures (System Intelligence, Not Opinion)

4.1 income\_profiles



Detected income cadence (system-generated).



Field	Type	Notes

id	UUID (PK)	

household\_id	UUID (FK)	

frequency\_days	integer	7 / 14 / 30

typical\_amount\_cents	integer	

confidence	float	0–1

detected\_at	timestamp	



These rows:



are recalculated when data changes



do not imply advice



do not trigger automation without consent



4.2 recurring\_obligations



Bills, subscriptions, debts, annual costs.



Field	Type	Notes

id	UUID (PK)	

household\_id	UUID (FK)	

merchant	text	

typical\_amount\_cents	integer	

frequency\_days	integer	

next\_due\_at	timestamp	

confidence	float	

category	enum	rent / utility / debt / subscription / annual

created\_at	timestamp	



Obligations exist before automation.



5\. Decision System (Human Authority Layer)

5.1 decisions



Represents requests for authority, not recommendations.



Field	Type	Notes

id	UUID (PK)	

household\_id	UUID (FK)	

type	enum	e.g. setup\_bills

title	text	

payload	jsonb	bounded scope

status	enum	active / approved / declined / expired

priority	integer	1–5

created\_at	timestamp	

resolved\_at	timestamp	nullable



Rules:



only one active decision per household per domain



declined is terminal



expired requires new justification



5.2 consents



Explicit grants of authority.



Field	Type	Notes

id	UUID (PK)	

household\_id	UUID (FK)	

scope	enum	action / scope / structural

payload	jsonb	explicit bounds

granted\_at	timestamp	

revoked\_at	timestamp	nullable



No automation may execute without an active consent covering its scope.



6\. Automation Layer (Mechanical Execution)

6.1 automations



Planned or executed actions.



Field	Type	Notes

id	UUID (PK)	

household\_id	UUID (FK)	

type	enum	pay\_bill / transfer / set\_aside

payload	jsonb	

scheduled\_for	timestamp	

status	enum	scheduled / executed / failed

executed\_at	timestamp	nullable

idempotency\_key	text (UNIQUE)	critical

failure\_reason	text	nullable



Idempotency is enforced at DB level.



7\. Audit Log (Append-Only, Non-Negotiable)

7.1 audit\_events



The legal and moral backbone.



Field	Type	Notes

id	UUID (PK)	

household\_id	UUID (FK)	

event\_type	enum	see below

actor	enum	system / user

related\_id	UUID	nullable

metadata	jsonb	redacted

occurred\_at	timestamp	

Audit Event Types include:



consent\_granted / revoked



decision\_created / approved / declined



automation\_scheduled / executed / failed



provider\_connected / revoked



system\_paused / resumed



Audit rows are never updated or deleted.



8\. Row Level Security (RLS) Model

Rules:



All tables require household\_id = auth.household\_id



Users cannot read/write other households



Engine uses service role (never client)



This is enforced at the database, not in application code.



9\. Data Lifecycle Rules



No hard deletes of:



transactions



decisions



automations



audit events



“Removal” means:



revocation



deactivation



archival flags



History is preserved. Silence is achieved structurally.



10\. Why This Matters



With this schema:



silent failure is visible



overreach is impossible



trust violations are auditable



future domains can attach cleanly



complexity is constrained



This is the load-bearing slab of Keystone.



End of Canonical Document #2

