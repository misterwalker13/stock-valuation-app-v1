# Stock Valuation Web App V1 aka Triton

A login-protected stock valuation web app with a Google Sheets-style workflow.

Users can enter U.S. stock ticker symbols, refresh valuation data, and view a read-only valuation output table.

## Current V1 Features

- Supabase Postgres database schema
- Supabase Auth-ready user/profile structure
- FastAPI backend
- yfinance/Yahoo Finance data retrieval
- Next.js frontend
- Ticker cleaning and de-duplication
- 100-ticker Version 1 limit
- Manual valuation refresh
- Calculated price formula
- Potential return formula
- Row color logic
- Double Negative? logic
- Dashboard-level last refreshed timestamp

## Valuation Logic

The app uses a proprietary backend valuation model to calculate estimated price and potential return.

The valuation logic is intentionally not exposed in the frontend or public repository documentation.
