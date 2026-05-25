"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

type TickerItem = {
  ticker: string;
  sort_order: number;
};

type Watchlist = {
  id: string;
  name: string;
  is_default: boolean;
};

type ValuationResult = {
  ticker: string;
  stock_price: number | null;
  calculated_price_display: string | null;
  potential_return_display: string | null;
  double_negative: boolean;
  row_color: "green" | "yellow" | "red" | "orange" | "none";
  data_status: string;
  last_refreshed_at: string | null;
};

type ApiErrorBody = {
  detail?: string | {
    message?: string;
    retry_after_seconds?: number;
  };
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

function parseCsvRows(csvText: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const nextCharacter = csvText[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell.trim());
  rows.push(row);

  return rows.filter((currentRow) => currentRow.some(Boolean));
}

function extractTickersFromCsv(csvText: string) {
  const rows = parseCsvRows(csvText);

  if (rows.length === 0) {
    return [];
  }

  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const tickerColumnIndex = header.findIndex((cell) =>
    ["ticker", "tickers", "symbol", "symbols", "ticker symbol"].includes(cell)
  );
  const dataRows = tickerColumnIndex >= 0 ? rows.slice(1) : rows;
  const sourceColumnIndex = tickerColumnIndex >= 0 ? tickerColumnIndex : 0;
  const seen = new Set<string>();
  const tickers: string[] = [];

  for (const row of dataRows) {
    const ticker = (row[sourceColumnIndex] ?? "").trim().toUpperCase();

    if (!ticker || seen.has(ticker)) {
      continue;
    }

    seen.add(ticker);
    tickers.push(ticker);
  }

  return tickers;
}

function apiMessage(data: ApiErrorBody) {
  if (typeof data.detail === "string") {
    return data.detail;
  }

  if (data.detail?.retry_after_seconds) {
    return `${data.detail.message ?? "Please wait before refreshing again"} Try again in ${data.detail.retry_after_seconds} seconds.`;
  }

  return data.detail?.message ?? "Request failed.";
}

export default function Home() {
  const router = useRouter();
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState("");
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [tickerText, setTickerText] = useState("");
  const [tickers, setTickers] = useState<TickerItem[]>([]);
  const [results, setResults] = useState<ValuationResult[]>([]);
  const [message, setMessage] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [watchlistRefreshSeconds, setWatchlistRefreshSeconds] = useState(60);

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

    setMessage(apiMessage(data));
    return false;
  }, [router]);

  const watchlistQuery = useCallback((watchlistId: string) => {
    return watchlistId ? `ticker_list_id=${encodeURIComponent(watchlistId)}&` : "";
  }, []);

  const loadTickers = useCallback(async (watchlistId = selectedWatchlistId) => {
    const headers = await getAuthHeaders();
    const response = await fetch(
      `${API_BASE_URL}/tickers?${watchlistQuery(watchlistId)}timestamp=${Date.now()}`,
      { headers }
    );
    const data = await response.json();

    if (!response.ok) {
      await handleApiAuthError(response, data);
      return;
    }

    setTickers(data.tickers ?? []);
    setTickerText((data.tickers ?? []).map((item: TickerItem) => item.ticker).join("\n"));

    if (!selectedWatchlistId && data.ticker_list?.id) {
      setSelectedWatchlistId(data.ticker_list.id);
    }
  }, [getAuthHeaders, handleApiAuthError, selectedWatchlistId, watchlistQuery]);

  const loadResults = useCallback(async (watchlistId = selectedWatchlistId) => {
    const headers = await getAuthHeaders();
    const response = await fetch(
      `${API_BASE_URL}/valuation-results?${watchlistQuery(watchlistId)}timestamp=${Date.now()}`,
      { headers }
    );

    const data = await response.json();

    if (!response.ok) {
      await handleApiAuthError(response, data);
      return;
    }

    const valuationResults = data.results ?? [];
    setResults(valuationResults);

    const refreshedDates = valuationResults
      .map((row: ValuationResult) => row.last_refreshed_at)
      .filter(Boolean)
      .sort()
      .reverse();

    setLastRefreshed(refreshedDates[0] ?? null);
  }, [getAuthHeaders, handleApiAuthError, selectedWatchlistId, watchlistQuery]);

  const loadWatchlists = useCallback(async () => {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/watchlists`, { headers });
    const data = await response.json();

    if (!response.ok) {
      await handleApiAuthError(response, data);
      return "";
    }

    const loadedWatchlists = data.watchlists ?? [];
    const defaultWatchlist = loadedWatchlists.find((watchlist: Watchlist) => watchlist.is_default);
    const activeWatchlistId = selectedWatchlistId || defaultWatchlist?.id || loadedWatchlists[0]?.id || "";

    setWatchlists(loadedWatchlists);
    setSelectedWatchlistId(activeWatchlistId);
    setWatchlistRefreshSeconds(data.limits?.watchlist_refresh_seconds ?? 60);

    return activeWatchlistId;
  }, [getAuthHeaders, handleApiAuthError, selectedWatchlistId]);

  async function saveTickers() {
    const rawTickers = tickerText.split("\n");
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/tickers`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tickers: rawTickers,
        ticker_list_id: selectedWatchlistId || undefined,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      await handleApiAuthError(response, data);
      return;
    }

    setMessage(`Saved ${data.saved_count} tickers.`);
    setTickers(data.tickers ?? []);
    setTickerText((data.tickers ?? []).map((item: TickerItem) => item.ticker).join("\n"));
    await refreshValuations(data.ticker_list?.id ?? selectedWatchlistId);
  }

  async function handleCreateWatchlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = newWatchlistName.trim();
    if (!name) {
      return;
    }

    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/watchlists`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
    const data = await response.json();

    if (!response.ok) {
      await handleApiAuthError(response, data);
      return;
    }

    setNewWatchlistName("");
    setMessage(`Created watchlist "${data.watchlist.name}".`);
    const activeWatchlistId = data.watchlist.id;
    setSelectedWatchlistId(activeWatchlistId);
    await loadWatchlists();
    await loadTickers(activeWatchlistId);
    await loadResults(activeWatchlistId);
  }

  async function handleWatchlistChange(event: ChangeEvent<HTMLSelectElement>) {
    const watchlistId = event.target.value;
    setSelectedWatchlistId(watchlistId);
    setMessage("");
    await loadTickers(watchlistId);
    await loadResults(watchlistId);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function refreshValuations(watchlistId = selectedWatchlistId) {
    setIsRefreshing(true);
    setMessage("Refreshing valuations...");
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/refresh-valuations`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticker_list_id: watchlistId || undefined }),
    });

    const data = await response.json();

    if (!response.ok) {
      await handleApiAuthError(response, data);
      setIsRefreshing(false);
      return;
    }

    setMessage(`Refresh complete: ${data.completed_tickers} of ${data.total_tickers} tickers processed.`);
    await loadResults(watchlistId);
    setIsRefreshing(false);
  }

  async function handleCsvUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const csvText = await file.text();
    const importedTickers = extractTickersFromCsv(csvText);

    if (importedTickers.length === 0) {
      setMessage("No tickers found in the uploaded CSV.");
      event.target.value = "";
      return;
    }

    setTickerText(importedTickers.join("\n"));
    setMessage(`Loaded ${importedTickers.length} tickers from ${file.name}.`);
    event.target.value = "";
  }

  useEffect(() => {
    async function checkAuthAndLoadData() {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/me`, { headers });
      const data = await response.json();

      if (!response.ok) {
        await handleApiAuthError(response, data);
        return;
      }

      setWatchlistRefreshSeconds(data.refresh_limits?.watchlist_seconds ?? 60);
      const activeWatchlistId = await loadWatchlists();

      if (activeWatchlistId) {
        await loadTickers(activeWatchlistId);
        await loadResults(activeWatchlistId);
      }

      setIsAuthChecking(false);
    }

    checkAuthAndLoadData();
  }, [getAuthHeaders, handleApiAuthError, loadResults, loadTickers, loadWatchlists]);

  function formatLastRefreshed(value: string | null) {
    if (!value) {
      return "Last refreshed: Not yet refreshed";
    }

    return `Last refreshed: ${new Date(value).toLocaleString()}`;
  }

  function rowClass(color: ValuationResult["row_color"]) {
    if (color === "green") return "bg-green-100 hover:bg-green-200";
    if (color === "yellow") return "bg-yellow-100 hover:bg-yellow-200";
    if (color === "red") return "bg-red-100 hover:bg-red-200";
    if (color === "orange") return "bg-orange-100 hover:bg-orange-200";
    return "bg-white hover:bg-slate-50";
  }

  if (isAuthChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-900">
        <p className="text-sm font-medium">Checking access...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Triton Valuation Model
            </p>
            <h1 className="text-3xl font-bold">Research Dashboard</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Manage member watchlists, refresh valuation outputs, and review results inside a structured valuation research framework.
            </p>
            <p className="mt-1 text-sm font-medium text-slate-700">
              {formatLastRefreshed(lastRefreshed)}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="w-fit rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            Log Out
          </button>
        </header>

        <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <h2 className="font-semibold">Dashboard User Guide</h2>
          <p className="mt-1">
            V2 beta accounts can create up to 2 watchlists with 100 tickers each. To keep data usage stable,
            each watchlist can be refreshed once every {watchlistRefreshSeconds} seconds. Saving tickers automatically starts a refresh when the limit allows it.
          </p>
        </section>

        <div className="mb-4 flex flex-col gap-3 rounded-lg bg-white p-4 shadow-sm lg:flex-row lg:items-end lg:justify-between">
          <label className="block flex-1">
            <span className="mb-1 block text-sm font-medium">Current Watchlist</span>
            <select
              value={selectedWatchlistId}
              onChange={handleWatchlistChange}
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
            >
              {watchlists.map((watchlist) => (
                <option key={watchlist.id} value={watchlist.id}>
                  {watchlist.name}{watchlist.is_default ? " (Default)" : ""}
                </option>
              ))}
            </select>
          </label>

          <form onSubmit={handleCreateWatchlist} className="flex flex-1 gap-2">
            <label className="block flex-1">
              <span className="mb-1 block text-sm font-medium">New Watchlist</span>
              <input
                type="text"
                value={newWatchlistName}
                onChange={(event) => setNewWatchlistName(event.target.value)}
                disabled={watchlists.length >= 2}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm disabled:bg-slate-100"
                placeholder={watchlists.length >= 2 ? "2 watchlist limit reached" : "Watchlist name"}
              />
            </label>
            <button
              type="submit"
              disabled={watchlists.length >= 2 || !newWatchlistName.trim()}
              className="self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
          </form>

          <button
            onClick={() => refreshValuations()}
            disabled={isRefreshing}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing..." : "Refresh Valuations"}
          </button>
        </div>

        {message && <p className="mb-4 text-sm text-slate-700">{message}</p>}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold">Output Table</h2>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left">
                    <th className="p-3">Ticker Symbol</th>
                    <th className="p-3">Stock Price</th>
                    <th className="p-3">Calculated Price</th>
                    <th className="p-3">Potential Return</th>
                    <th className="p-3">Double Negative?</th>
                  </tr>
                </thead>
                <tbody>
                  {results.length === 0 ? (
                    <tr>
                      <td className="p-3 text-slate-500" colSpan={5}>
                        No valuation results yet.
                      </td>
                    </tr>
                  ) : (
                    results.map((row) => (
                      <tr key={row.ticker} className={`border-b ${rowClass(row.row_color)}`}>
                        <td className="p-3 font-semibold">{row.ticker}</td>
                        <td className="p-3">
                          {row.stock_price === null ? "n/a" : `$${row.stock_price.toFixed(2)}`}
                        </td>
                        <td className="p-3">
                          {row.calculated_price_display === "" || row.calculated_price_display === null
                            ? ""
                            : row.calculated_price_display}
                        </td>
                        <td className="p-3">{row.potential_return_display || "n/a"}</td>
                        <td className="p-3">
                          <input type="checkbox" checked={row.double_negative} readOnly />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold">Ticker Input</h2>

            <label className="mb-3 block">
              <span className="mb-1 block text-sm font-medium">Upload CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvUpload}
                className="block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
              />
            </label>

            <textarea
              value={tickerText}
              onChange={(event) => setTickerText(event.target.value)}
              className="h-72 w-full resize-none rounded-lg border border-slate-300 p-3 font-mono text-sm"
              placeholder={"Paste tickers here, one per line:\nAAPL\nMSFT\nBRK.B"}
            />

            <button
              onClick={saveTickers}
              disabled={isRefreshing}
              className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRefreshing ? "Refreshing..." : "Save Tickers & Refresh"}
            </button>

            <p className="mt-3 text-xs text-slate-500">
              Current saved tickers: {tickers.length} / 100
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
