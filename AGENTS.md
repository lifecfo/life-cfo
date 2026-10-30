# Rules for AI coding agents

These rules apply to any AI coding agent (Claude Code, Cursor, Grok, or
otherwise) working in this repository. They are not suggestions.

1. Never remove, hide or redirect a user-facing page, feature or nav item
   without the owner's explicit approval in the same conversation.
2. Never merge to main or deploy to production. Work on a branch, push, and
   wait for the owner to review the preview.
3. Never run database writes (insert/update/delete/alter/policy changes) on
   production. Write migration files and let the owner apply them.
4. Never commit .env files, keys or secrets, and never put real passwords in
   files or chat.
5. All AI features and on-screen copy must follow docs/product/ai-boundaries.md
   (the 5-question test) and pass the AI eval suite.
6. Only one agent works on a given area at a time; check for open branches
   touching the same files first.
