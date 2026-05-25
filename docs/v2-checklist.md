# Triton Valuation Model V2 Checklist

Version 2 moves the app from an admin-only V1 dashboard into an early member beta for a small circle of invited users.

## V2.1 Data Model And Backend Foundation

- [x] Create `v2-development` branch.
- [x] Add `member` role for non-admin users.
- [x] Add per-user profile metadata for newsletter opt-in and invite-code tracking.
- [x] Add invite-code table for early access signup.
- [x] Add refresh-event tracking table.
- [x] Enforce 2 watchlists per user at the database level.
- [x] Keep 100 tickers per watchlist.
- [x] Scope existing ticker, valuation, and refresh endpoints to the authenticated user.
- [x] Allow admins to use the normal member dashboard.
- [x] Add backend refresh-rate enforcement for watchlist refreshes.
- [x] Add signup endpoint that validates invite code and stores newsletter preference.
- [x] Add admin inspection endpoints for users and watchlists.

## V2.2 Watchlist Dashboard

- [x] Add watchlist selector to dashboard.
- [x] Add create-watchlist UI with 2-watchlist limit messaging.
- [x] Keep CSV upload for ticker entry.
- [x] Keep Save Tickers & Refresh behavior.
- [x] Transparently explain refresh limits in the dashboard user guide.
- [x] Add richer empty states and member-friendly error messaging.
- [x] Add admin link to the separate admin route.

## V2.3 Single-Ticker Research Page

- [x] Add separate single-ticker route.
- [x] Allow drilldown from dashboard ticker links.
- [x] Allow manual ticker lookup from the single-ticker page.
- [x] Show temporary lookup result unless user clicks Add to current watchlist.
- [x] Show company name, sector, industry, market cap, exchange, website, full summary, stock price, valuation output, and last refreshed.
- [x] Add separate yfinance-powered company news box.
- [x] Use cached data when available.
- [x] Add Refresh button with single-ticker refresh-rate enforcement.

## V2.4 Public Product Pages

- [ ] Add public landing page for Triton Valuation Model.
- [ ] Add public login and signup links.
- [ ] Add public disclaimer page with placeholder legal copy.
- [ ] Add public My Philosophy page using safe positioning language.
- [ ] Link My Philosophy from inside the logged-in dashboard.
- [ ] Keep valuation outputs behind login.

## V2.5 Signup And Newsletter

- [x] Add signup UI.
- [x] Require invite/access code for early users.
- [x] Default newsletter opt-in checkbox to selected.
- [x] Store newsletter opt-in in Supabase only for V2.
- [ ] Avoid external email platform integration until a later version.

## Refresh-Rate Policy

V2 uses Option C for the beta:

- Watchlist refresh: once every 60 seconds per watchlist.
- Single-ticker refresh: once every 30 seconds per ticker per user.
- Explain the limits in the dashboard user guide.
- Return clear retry messaging when a user refreshes too soon.

V3 target:

- Switch to Option B once the product has more usage data and a clearer cost profile.

## Out Of Scope For V2

- Billing, subscriptions, and Stripe.
- Public exposure of valuation outputs.
- Any public explanation of the proprietary valuation formula.
- Production legal finalization before attorney review.
