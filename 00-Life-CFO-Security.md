SECURITY POLICY
Reporting a Vulnerability
If you discover a security vulnerability in Life CFO, please report it responsibly.
Do not open a public GitHub issue.
Instead, email:
admin@life-cfo.com
Please include:
•	Description of the issue
•	Steps to reproduce
•	Impact assessment (if known)
•	Any proof-of-concept code (if applicable)
We aim to acknowledge reports within 72 hours.
________________________________________
Scope
This policy applies to:
•	Production deployments of Life CFO
•	The public GitHub repository
•	Supabase-backed infrastructure
•	Auth and access-control mechanisms
•	API route handlers
•	External provider integrations (e.g. Plaid)
Out of scope:
•	Issues caused by user device compromise
•	Social engineering attempts
•	Misconfiguration of third-party services outside Life CFO control
________________________________________
Security Architecture Overview
Life CFO is built with security-first principles:
1. Data Boundary
All financial data is scoped at the household level.
Every financial entity contains:
household_id UUID NOT NULL
Row-Level Security (RLS) enforces:
•	SELECT access for household members
•	INSERT / UPDATE / DELETE restricted by role (owner / editor)
There is no global data access layer.
________________________________________
2. Authentication
•	Supabase Auth
•	Centralized identity management
•	JWT-based session handling
•	Secure server-side verification for privileged operations
No passwords are stored within Life CFO application code.
________________________________________
3. Encryption
•	TLS encryption in transit
•	Encryption at rest via Supabase-managed Postgres
•	Secure credential storage in environment variables
Secrets are never committed to source control.
________________________________________
4. AI Safety Model
The reasoning engine:
•	Does not execute transactions
•	Does not move funds
•	Does not auto-commit decisions
•	Does not modify stored data autonomously
AI operates strictly as a bounded reasoning layer over retrieved data.
All durable state changes require explicit user action.
________________________________________
5. Financial Integrations
For external data providers (e.g. Plaid):
•	Access tokens are stored securely
•	Only required scopes are requested
•	No user banking passwords are stored
•	Provider credentials are environment-scoped
Life CFO does not initiate transfers or payments.
________________________________________
Infrastructure
•	Frontend: Vercel
•	Database: Supabase
•	Auth: Supabase Auth
•	Provider integrations via server-side API routes
Role-based access control is enforced at the database layer.
________________________________________
Responsible Disclosure
We appreciate responsible disclosure and will work with researchers to:
•	Confirm findings
•	Mitigate vulnerabilities promptly
•	Communicate transparently when necessary
We reserve the right to determine severity and remediation timeline.
________________________________________
Ongoing Security Improvements
Planned improvements include:
•	Independent security review
•	Penetration testing
•	Formalized internal security documentation
•	Enhanced audit logging
•	Consumer MFA enforcement
________________________________________
Philosophy
Life CFO is designed to reduce mental load — not create hidden risk.
Security is treated as infrastructure, not a feature.

