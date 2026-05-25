# Triton: Stock Valuation Web App V1

Triton is a full-stack stock valuation dashboard for managing ticker lists, refreshing market data, and reviewing valuation outputs in a focused, spreadsheet-inspired workflow.

The app is built as a private admin workspace: users sign in with Supabase Auth, the frontend verifies admin access, and the backend enforces authenticated admin authorization before serving protected data.

## What It Does

- Stores and manages up to 100 ticker symbols for Version 1
- Cleans ticker input, removes duplicates, and supports symbols like `BRK.B`
- Pulls market data from Yahoo Finance through `yfinance`
- Shows stock price, calculated valuation output, potential return, and double-negative status
- Uses color-coded rows to make results easier to scan
- Tracks refresh jobs and latest refreshed timestamps
- Keeps valuation logic backend-only

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: Python, FastAPI
- Database and auth: Supabase Auth and Supabase Postgres
- Market data: `yfinance` / Yahoo Finance
- Frontend hosting: Vercel
- Backend hosting: Render

## Architecture

```text
Next.js dashboard
  -> Supabase Auth session
  -> FastAPI backend with admin authorization
  -> Supabase Postgres
  -> yfinance market data
```

The browser uses Supabase's public anon key for login and session handling. The backend uses the Supabase service role key for trusted database operations. The service role key must never be exposed to the frontend.

## Environment Variables

Backend:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FRONTEND_ORIGIN=
```

Frontend:

```env
NEXT_PUBLIC_API_BASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

`NEXT_PUBLIC_` values are browser-visible by design. Do not place private credentials or service role keys in frontend environment variables.

## Local Development

Run the backend:

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload
```

Run the frontend:

```bash
cd frontend
npm run dev
```

Local URLs:

```text
Backend:  http://127.0.0.1:8000
Frontend: http://localhost:3000
```

Use `http://localhost:3000` for local browser testing.

## Production Notes

- Vercel should deploy from the `frontend` root directory.
- Render should deploy from the `backend` root directory.
- `FRONTEND_ORIGIN` on Render must include the full scheme, for example:

```env
FRONTEND_ORIGIN=https://stock-valuation-app-v1.vercel.app
```

## Security Notes

- Valuation logic is proprietary and must remain backend-only.
- Do not expose the valuation model in README files, frontend code, public documentation, portfolio posts, or product copy.
- Do not expose the Supabase service role key outside the backend.
- Backend endpoints other than `/health` require a valid Supabase session for an admin or additional admin user.
- Supabase leaked-password protection is pending a Pro plan upgrade. Revisit this before preparing a paid or mass-market release.

## V1 Scope

Version 1 is focused on a single admin workflow: save tickers, refresh valuations, and review results. The database schema is designed with future multi-user support in mind, but the production experience is intentionally narrow and admin-first.

## Pre-Commercial Launch Checklist

- Upgrade Supabase to a plan that supports leaked-password protection.
- Enable leaked-password protection in Authentication settings.
- Re-run Supabase security advisors and confirm the leaked-password warning is cleared.
