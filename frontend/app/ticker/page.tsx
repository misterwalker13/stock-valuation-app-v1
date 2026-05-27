"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type Watchlist = {
  id: string;
  name: string;
  is_default: boolean;
};

type TickerItem = {
  ticker: string;
  sort_order: number;
};

type CompanyProfile = {
  company_name?: string | null;
  sector?: string | null;
  industry?: string | null;
  market_cap?: number | null;
  exchange?: string | null;
  website?: string | null;
  summary?: string | null;
  currency?: string | null;
};

type NewsItem = {
  title?: string | null;
  link?: string | null;
  publisher?: string | null;
  published_at?: string | number | null;
  summary?: string | null;
};

type FinancialRatios = {
  current_ratio_display?: string | null;
  total_debt_ratio_display?: string | null;
  return_on_assets_display?: string | null;
  return_on_equity_display?: string | null;
};

type SingleTickerResult = {
  ticker: string;
  is_cached: boolean;
  is_in_current_watchlist: boolean;
  company_profile: CompanyProfile;
  financial_ratios: FinancialRatios;
  news: NewsItem[];
  valuation: {
    stock_price: number | null;
    calculated_price_display: string | null;
    calculated_price_difference_display: string | null;
    row_color: "green" | "yellow" | "red" | "orange" | "none";
    data_status: string;
    last_refreshed_at: string | null;
  };
};

type ApiErrorBody = {
  detail?: string | {
    message?: string;
    retry_after_seconds?: number;
  };
};

type Notice = {
  tone: "info" | "success" | "warning" | "error";
  text: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

function apiMessage(data: ApiErrorBody) {
  if (typeof data.detail === "string") {
    return data.detail;
  }

  if (data.detail?.retry_after_seconds) {
    return `${data.detail.message ?? "Please wait before refreshing again"} You can try again in about ${data.detail.retry_after_seconds} seconds.`;
  }

  return data.detail?.message ?? "Something went wrong. Please try again.";
}

function formatCurrency(value: number | null | undefined, currency = "USD") {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatLargeNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | number | null | undefined) {
  if (!value) {
    return "n/a";
  }

  if (typeof value === "number") {
    return new Date(value * 1000).toLocaleString();
  }

  return new Date(value).toLocaleString();
}

function rowClass(color: SingleTickerResult["valuation"]["row_color"]) {
  if (color === "green") return "border-green-200 bg-green-50 text-green-800";
  if (color === "yellow") return "border-yellow-200 bg-yellow-50 text-yellow-800";
  if (color === "red") return "border-red-200 bg-red-50 text-red-800";
  if (color === "orange") return "border-orange-200 bg-orange-50 text-orange-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function noticeClass(tone: Notice["tone"]) {
  if (tone === "success") return "border-green-200 bg-green-50 text-green-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  if (tone === "error") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-white text-slate-700";
}

export default function TickerPage() {
  const router = useRouter();
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState("");
  const [tickerInput, setTickerInput] = useState("");
  const [result, setResult] = useState<SingleTickerResult | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const getAuthHeaders = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.push("/login");
      throw new Error("Missing session.");
    }

    return {
      Authorization: `Bearer ${session.access_token}`,
    };
  }, [router]);

  const handleApiAuthError = useCallback(async (response: Response, data: ApiErrorBody) => {
    if (response.status === 401 || response.status === 403) {
      await supabase.auth.signOut();
      router.push("/login");
      return true;
    }

    setNotice({
      tone: response.status === 429 ? "warning" : "error",
      text: apiMessage(data),
    });
    return false;
  }, [router]);

  const loadWatchlists = useCallback(async (preferredWatchlistId = "") => {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/watchlists`, { headers });
    const data = await response.json();

    if (!response.ok) {
      await handleApiAuthError(response, data);
      return "";
    }

    const loadedWatchlists = data.watchlists ?? [];
    const defaultWatchlist = loadedWatchlists.find((watchlist: Watchlist) => watchlist.is_default);
    const activeWatchlistId = preferredWatchlistId || defaultWatchlist?.id || loadedWatchlists[0]?.id || "";

    setWatchlists(loadedWatchlists);
    setSelectedWatchlistId(activeWatchlistId);

    return activeWatchlistId;
  }, [getAuthHeaders, handleApiAuthError]);

  const lookupTicker = useCallback(async (ticker: string, watchlistId: string) => {
    const cleanedTicker = ticker.trim().toUpperCase();

    if (!cleanedTicker) {
      setNotice({
        tone: "warning",
        text: "Enter a ticker symbol to research.",
      });
      return;
    }

    setIsLoading(true);
    setNotice(null);

    const headers = await getAuthHeaders();
    const response = await fetch(
      `${API_BASE_URL}/single-ticker?ticker=${encodeURIComponent(cleanedTicker)}&ticker_list_id=${encodeURIComponent(watchlistId)}&timestamp=${Date.now()}`,
      { headers }
    );
    const data = await response.json();

    setIsLoading(false);

    if (!response.ok) {
      await handleApiAuthError(response, data);
      return;
    }

    setTickerInput(data.result.ticker);
    setResult(data.result);
    setNotice({
      tone: data.result.is_cached ? "info" : "success",
      text: data.result.is_cached
        ? "Loaded the most recent cached research data. Use Refresh for a current pull."
        : "Loaded a temporary research result. Add it to your current watchlist to save the ticker.",
    });
  }, [getAuthHeaders, handleApiAuthError]);

  useEffect(() => {
    async function bootstrap() {
      const params = new URLSearchParams(window.location.search);
      const ticker = params.get("ticker") ?? "";
      const watchlistId = params.get("ticker_list_id") ?? "";
      const activeWatchlistId = await loadWatchlists(watchlistId);

      if (ticker) {
        await lookupTicker(ticker, activeWatchlistId);
      }

      setTickerInput(ticker.toUpperCase());
      setIsAuthChecking(false);
    }

    bootstrap();
  }, [loadWatchlists, lookupTicker]);

  async function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await lookupTicker(tickerInput, selectedWatchlistId);
  }

  async function handleWatchlistChange(watchlistId: string) {
    setSelectedWatchlistId(watchlistId);

    if (result) {
      await lookupTicker(result.ticker, watchlistId);
    }
  }

  async function refreshTicker() {
    const cleanedTicker = tickerInput.trim().toUpperCase();

    if (!cleanedTicker) {
      setNotice({
        tone: "warning",
        text: "Enter a ticker symbol before refreshing.",
      });
      return;
    }

    setIsRefreshing(true);
    setNotice({
      tone: "info",
      text: "Refreshing this ticker. Single-ticker refreshes are limited during the V2 beta.",
    });

    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/single-ticker/refresh`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticker: cleanedTicker }),
    });
    const data = await response.json();

    setIsRefreshing(false);

    if (!response.ok) {
      await handleApiAuthError(response, data);
      return;
    }

    setResult(data.result);
    setTickerInput(data.result.ticker);
    setNotice({
      tone: "success",
      text: "Single-ticker refresh complete. This result stays temporary unless you add it to a watchlist.",
    });
  }

  async function addToCurrentWatchlist() {
    if (!result || !selectedWatchlistId) {
      return;
    }

    setIsAdding(true);
    const authHeaders = await getAuthHeaders();
    const tickersResponse = await fetch(
      `${API_BASE_URL}/tickers?ticker_list_id=${encodeURIComponent(selectedWatchlistId)}&timestamp=${Date.now()}`,
      { headers: authHeaders }
    );
    const tickersData = await tickersResponse.json();

    if (!tickersResponse.ok) {
      await handleApiAuthError(tickersResponse, tickersData);
      setIsAdding(false);
      return;
    }

    const existingTickers = (tickersData.tickers ?? []).map((item: TickerItem) => item.ticker);
    const nextTickers = Array.from(new Set([...existingTickers, result.ticker]));

    const saveResponse = await fetch(`${API_BASE_URL}/tickers`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ticker_list_id: selectedWatchlistId,
        tickers: nextTickers,
      }),
    });
    const saveData = await saveResponse.json();

    setIsAdding(false);

    if (!saveResponse.ok) {
      await handleApiAuthError(saveResponse, saveData);
      return;
    }

    setResult({
      ...result,
      is_in_current_watchlist: true,
    });
    setNotice({
      tone: "success",
      text: `${result.ticker} was added to ${activeWatchlistName()}. Refresh that watchlist from the dashboard when you are ready.`,
    });
  }

  function activeWatchlistName() {
    return watchlists.find((watchlist) => watchlist.id === selectedWatchlistId)?.name ?? "your current watchlist";
  }

  if (isAuthChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-900">
        <p className="text-sm font-medium">Checking access...</p>
      </main>
    );
  }

  const profile = result?.company_profile ?? {};
  const financialRatios = result?.financial_ratios ?? {};
  const valuation = result?.valuation;
  const currency = profile.currency ?? "USD";

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Triton Valuation Model
            </p>
            <h1 className="text-3xl font-bold">Single-Ticker Research</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Look up a company, review cached or refreshed valuation output, and optionally add the ticker to your current watchlist.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="w-fit rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            Dashboard
          </Link>
        </header>

        <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <h2 className="font-semibold">Research Page Guide</h2>
          <p className="mt-1">
            Manual lookups are temporary. Add a ticker to {activeWatchlistName()} if you want it saved. Single-ticker refreshes are limited to once every 30 seconds per ticker during the V2 beta.
          </p>
        </section>

        <section className="mb-4 rounded-xl bg-white p-4 shadow-sm">
          <form onSubmit={handleLookup} className="grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Ticker</span>
              <input
                type="text"
                value={tickerInput}
                onChange={(event) => setTickerInput(event.target.value.toUpperCase())}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm uppercase"
                placeholder="AAPL"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Current Watchlist</span>
              <select
                value={selectedWatchlistId}
                onChange={(event) => handleWatchlistChange(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
              >
                {watchlists.map((watchlist) => (
                  <option key={watchlist.id} value={watchlist.id}>
                    {watchlist.name}{watchlist.is_default ? " (Default)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Looking up..." : "Lookup"}
            </button>

            <button
              type="button"
              onClick={refreshTicker}
              disabled={isRefreshing}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </form>
        </section>

        {notice && (
          <p className={`mb-4 rounded-lg border p-3 text-sm ${noticeClass(notice.tone)}`}>
            {notice.text}
          </p>
        )}

        {!result ? (
          <section className="rounded-xl bg-white p-8 text-sm text-slate-600 shadow-sm">
            Enter a ticker above to begin single-company research.
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
            <section className="space-y-6">
              <div className="rounded-xl bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      {result.ticker}
                    </p>
                    <h2 className="text-3xl font-bold">
                      {profile.company_name ?? result.ticker}
                    </h2>
                    <p className="mt-2 text-sm text-slate-600">
                      {[profile.exchange, profile.sector, profile.industry].filter(Boolean).join(" / ") || "Company profile fields unavailable."}
                    </p>
                  </div>

                  <button
                    onClick={addToCurrentWatchlist}
                    disabled={isAdding || result.is_in_current_watchlist}
                    className="w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {result.is_in_current_watchlist
                      ? "In Watchlist"
                      : isAdding
                        ? "Adding..."
                        : "Add to Current Watchlist"}
                  </button>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Market Cap</p>
                    <p className="mt-1 font-semibold">{formatLargeNumber(profile.market_cap)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Stock Price</p>
                    <p className="mt-1 font-semibold">{formatCurrency(valuation?.stock_price, currency)}</p>
                  </div>
                  <div className={`rounded-lg border p-3 ${rowClass(valuation?.row_color ?? "none")}`}>
                    <p className="text-xs">Calculated Price</p>
                    <p className="mt-1 font-semibold">{valuation?.calculated_price_display ?? "n/a"}</p>
                  </div>
                  <div className={`rounded-lg border p-3 ${rowClass(valuation?.row_color ?? "none")}`}>
                    <p className="text-xs">Calculated Price Difference</p>
                    <p className="mt-1 font-semibold">{valuation?.calculated_price_difference_display ?? "n/a"}</p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Current Ratio</p>
                    <p className="mt-1 font-semibold">{financialRatios.current_ratio_display ?? "n/a"}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Total Debt Ratio</p>
                    <p className="mt-1 font-semibold">{financialRatios.total_debt_ratio_display ?? "n/a"}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Return on Assets</p>
                    <p className="mt-1 font-semibold">{financialRatios.return_on_assets_display ?? "n/a"}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Return on Equity</p>
                    <p className="mt-1 font-semibold">{financialRatios.return_on_equity_display ?? "n/a"}</p>
                  </div>
                </div>

                <p className="mt-4 text-xs text-slate-500">
                  Last refreshed: {formatDate(valuation?.last_refreshed_at)} / {result.is_cached ? "cached result" : "temporary lookup"}
                </p>
              </div>

              <div className="rounded-xl bg-white p-5 shadow-sm">
                <h3 className="text-xl font-semibold">Company Summary</h3>
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">
                  {profile.summary ?? "Company summary is unavailable from the current data source."}
                </p>
                {profile.website && (
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-block text-sm font-semibold text-slate-900 underline"
                  >
                    Company website
                  </a>
                )}
              </div>
            </section>

            <aside className="rounded-xl bg-white p-5 shadow-sm">
              <h3 className="text-xl font-semibold">Company News</h3>
              <div className="mt-4 space-y-4">
                {result.news.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No recent yfinance news is available for this ticker.
                  </p>
                ) : (
                  result.news.map((item, index) => (
                    <article key={`${item.title}-${index}`} className="border-b border-slate-200 pb-4 last:border-0">
                      <h4 className="text-sm font-semibold">
                        {item.link ? (
                          <a href={item.link} target="_blank" rel="noreferrer" className="hover:underline">
                            {item.title ?? "Untitled news item"}
                          </a>
                        ) : (
                          item.title ?? "Untitled news item"
                        )}
                      </h4>
                      <p className="mt-1 text-xs text-slate-500">
                        {[item.publisher, formatDate(item.published_at)].filter(Boolean).join(" / ")}
                      </p>
                      {item.summary && (
                        <p className="mt-2 text-sm text-slate-600">{item.summary}</p>
                      )}
                    </article>
                  ))
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
