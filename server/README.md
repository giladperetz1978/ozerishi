# OZERISHI server

This directory is the private backend for the new OZERISHI app. It is intentionally separate from the legacy RemindMe server.

Planned responsibilities:

- Microsoft Graph read-only access to Outlook mail and calendar.
- Gemini analysis of normalized mail and calendar data.
- Voice assistant request/response orchestration.
- No send, delete, edit, or calendar-write permissions.

The first API surface is `/auth/microsoft`, `/auth/microsoft/callback`, `/api/status`, and `/api/briefing`. The briefing reads Outlook through Microsoft Graph and sends the normalized data to the configured Gemini model. It never writes to Microsoft 365.
The API surface includes `/auth/microsoft`, `/auth/microsoft/callback`, `/api/status`, `/api/briefing`, `/api/assistant`, and `/api/analyze`. These routes read data and send normalized content to Gemini; they never write to Microsoft 365. The current Android UI uses Outlook notification scanning and does not expose the OAuth login link.

For Microsoft Entra ID, register a web application with the exact redirect URI from `MICROSOFT_REDIRECT_URI`, then grant delegated permissions `User.Read`, `Mail.Read`, `Calendars.Read`, and `offline_access`. Admin consent may be required by the work tenant.

Deploy this directory to a new server location such as `/opt/OZERISHI`. Do not reuse the legacy app directory or its environment file.

## Environment

Copy `.env.example` to `.env` on the server and fill the non-secret settings there. Never commit `.env`.

To store the Gemini API key encrypted on the server, upload this directory and run:

```bash
read -r GEMINI_API_KEY && printf '%s' "$GEMINI_API_KEY" | node store-gemini-key.mjs
```

The key is transported through SSH stdin and stored as AES-256-GCM in `data/.gemini.enc`; the vault key is kept separately in `data/.vault-key`, both with owner-only permissions.