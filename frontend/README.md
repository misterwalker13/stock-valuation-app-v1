# Triton Frontend

This is the Next.js frontend for Triton, a login-protected stock valuation dashboard.

The frontend handles:

- Supabase Auth sign-in and logout
- Admin-only dashboard access checks
- Ticker input and save actions
- Valuation refresh requests
- Valuation result display

The frontend does not contain proprietary valuation logic. Protected backend requests include the user's Supabase access token, and the FastAPI backend performs the final admin authorization check.

## Local Development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Environment Variables

```env
NEXT_PUBLIC_API_BASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Only browser-safe public values belong in this file. Do not add private backend credentials or Supabase service role keys to the frontend.
