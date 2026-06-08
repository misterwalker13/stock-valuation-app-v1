# Triton Valuation Model V3 Checklist

Version 3 introduces a private per-user portfolio tracker. The portfolio feature
should preserve the proprietary valuation model backend-only while allowing
members to track open and closed lots, position sizing, valuation snapshots, and
estimated total returns.

## V3.1 Portfolio Scope And Product Rules

- [ ] Give each user exactly one portfolio.
- [ ] Keep portfolio data private to the owning user.
- [ ] Allow multiple lots per ticker with different start dates.
- [ ] Default each new lot's purchase date to the date it is added.
- [ ] Allow users to edit historical purchase date, shares, purchase price, and notes.
- [ ] Skip brokerage fees and commissions for V3.
- [ ] Support partial sales.
- [ ] Support fully closed lots.
- [ ] Freeze sale values for closed lots.
- [ ] Exclude fully closed lots from current-value refreshes.
- [ ] Keep valuation formula details backend-only.

## V3.2 Schema And Backend Foundation

- [ ] Add portfolio table or equivalent one-portfolio-per-user structure.
- [ ] Add portfolio lots table.
- [ ] Store ticker, company name, shares, purchase date, purchase price, and notes per lot.
- [ ] Store remaining shares per lot.
- [ ] Store sale date, sale price per share, shares sold, and sale notes for closed or partially sold lots.
- [ ] Store entry stock price.
- [ ] Store entry calculated price.
- [ ] Store entry calculated price difference.
- [ ] Store current stock price for open lots.
- [ ] Store current calculated price for open lots.
- [ ] Store current calculated price difference for open lots.
- [ ] Store sale stock price for closed shares.
- [ ] Store sale calculated price for closed shares.
- [ ] Store sale calculated price difference for closed shares.
- [ ] Store latest calculated dividend totals per lot.
- [ ] Add row-level security so users can access only their own portfolio records.
- [ ] Add backend authorization checks for all portfolio endpoints.
- [ ] Add portfolio refresh-event tracking.
- [ ] Enforce a 60-second portfolio refresh cooldown per user portfolio.

## V3.3 Portfolio APIs

- [ ] Add endpoint to get portfolio summary, grouped positions, and lot details.
- [ ] Add endpoint to add a portfolio lot.
- [ ] Add endpoint to edit lot details.
- [ ] Add endpoint to record partial sales.
- [ ] Add endpoint to fully close a lot.
- [ ] Add endpoint to remove a lot.
- [ ] Add endpoint to refresh portfolio values.
- [ ] Add endpoint to export portfolio lots as CSV.
- [ ] Return member-friendly error messages for portfolio validation failures.
- [ ] Keep proprietary valuation calculations in backend code only.

## V3.4 Add-To-Portfolio Flow

- [ ] Add `Add to Portfolio` column button to dashboard output table.
- [ ] Add `Add Lot to Portfolio` button to the single-ticker research page near the watchlist action.
- [ ] Add `Add Position` action on the portfolio page.
- [ ] Use one shared add-to-portfolio modal across dashboard, single-ticker, and portfolio pages.
- [ ] Prefill ticker when launched from dashboard or single-ticker page.
- [ ] Modal fields: ticker, shares, purchase date, purchase price per share, and optional notes.
- [ ] Show cached valuation preview when available.
- [ ] Force a fresh valuation refresh when the user submits the modal.
- [ ] Store the entry valuation snapshot from the add action.
- [ ] Show clear loading/progress state while the fresh valuation snapshot is created.

## V3.5 Portfolio Page

- [ ] Add `/portfolio` route.
- [ ] Title the page `Portfolio`.
- [ ] Add summary cards for total cost basis, current portfolio value, total gain/loss dollars, total return percent, and number of positions.
- [ ] Show one row per ticker.
- [ ] Add expandable lot details under each ticker row.
- [ ] Show current return as both dollars and percent.
- [ ] Show realized gains for closed or partially sold lots.
- [ ] Show simple YTD gain/loss estimate.
- [ ] Include dividends in the YTD gain/loss estimate when yfinance data allows.
- [ ] Include unrealized gains/losses on open lots in the YTD estimate.
- [ ] Include realized gains from lots sold during the current year in the YTD estimate.
- [ ] Ignore cash contributions and withdrawals for V3.
- [ ] Add portfolio refresh button.
- [ ] Refresh current data when the user opens the portfolio page.
- [ ] Add CSV export button.
- [ ] Use subtle green/red row coloring based on total return since entry.

## V3.6 Return And Valuation Calculations

- [ ] Open lot current value equals remaining shares multiplied by current stock price.
- [ ] Dollar gain/loss uses actual prices and current market value.
- [ ] Total return percent uses yfinance adjusted data to account for splits and dividends.
- [ ] Store latest calculated dividend totals per lot.
- [ ] Use yfinance data for dividends, splits, adjusted prices, and current pricing.
- [ ] Refresh current stock price and current calculated price once per unique open ticker.
- [ ] Roll current ticker-level refresh values down to all open lots for that ticker.
- [ ] Do not update frozen sale values for fully closed lots.
- [ ] Display return calculations as estimates where dividend or adjusted-price data is imperfect.

## V3.7 Navigation

- [ ] Standardize logged-in top navigation across dashboard, single-ticker, and portfolio pages.
- [ ] Navigation order: Dashboard, Single-Ticker Research, Portfolio, Admin if admin, Log Out.
- [ ] Keep public pages separate from logged-in navigation.
- [ ] Ensure mobile/tablet navigation does not overflow.

## V3.8 CSV Export

- [ ] Export lot-level detail.
- [ ] Include ticker, company name, lot status, shares purchased, remaining shares, purchase date, purchase price, sale date, sale price, realized gain/loss, current value, current return dollars, current return percent, entry calculated price, current calculated price, entry calculated price difference, current calculated price difference, latest dividend total, and notes.
- [ ] Do not expose valuation formula details in CSV.
- [ ] Ensure CSV export is scoped to the authenticated user only.

## V3.9 Verification

- [ ] Add lot from dashboard.
- [ ] Add lot from single-ticker page.
- [ ] Add lot from portfolio page.
- [ ] Edit shares, purchase date, purchase price, and notes.
- [ ] Record partial sale.
- [ ] Fully close a lot.
- [ ] Remove a lot.
- [ ] Refresh portfolio values.
- [ ] Confirm 60-second portfolio refresh cooldown.
- [ ] Confirm closed lots freeze sale values.
- [ ] Confirm open lots update current stock price and current calculated price.
- [ ] Confirm CSV export downloads lot-level data.
- [ ] Confirm one user cannot access another user's portfolio.
- [ ] Confirm admin cannot inspect member portfolios unless a future requirement changes that privacy rule.
- [ ] Run formula/privacy scan before deployment.
- [ ] Run production smoke test after deployment.

## Out Of Scope For V3 Portfolio

- [ ] Brokerage fees and commissions.
- [ ] Cash deposits and withdrawals.
- [ ] Benchmark comparison on the portfolio page.
- [ ] Formal money-weighted or time-weighted return calculations.
- [ ] Public sharing of portfolios.
- [ ] Admin portfolio inspection.
- [ ] Public exposure of valuation outputs.
- [ ] Any public explanation of the proprietary valuation formula.

