"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import Link from "next/link";
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

type Notice = {
  tone: "info" | "success" | "warning" | "error";
  text: string;
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
    if (data.detail.includes("maximum of 100")) {
      return "This watchlist is capped at 100 valid tickers for the V2 beta. Trim the list and try again.";
    }

    if (data.detail.includes("maximum of 2 watchlists")) {
      return "V2 beta accounts can use up to 2 watchlists. Rename or reuse an existing watchlist for now.";
    }

    if (data.detail.includes("already running")) {
      return "A refresh is already running for this watchlist. Give it a moment, then check the updated results.";
    }

    if (data.detail.includes("Watchlist not found")) {
      return "That watchlist could not be found. Select another watchlist or reload the dashboard.";
    }

    return data.detail;
  }

  if (data.detail?.retry_after_seconds) {
    return `${data.detail.message ?? "Please wait before refreshing again"} You can try again in about ${data.detail.retry_after_seconds} seconds.`;
  }

  return data.detail?.message ?? "Something went wrong. Please try again.";
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
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [watchlistRefreshSeconds, setWatchlistRefreshSeconds] = useState(60);
  const [isAdmin, setIsAdmin] = useState(false);

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

    if (!rawTickers.some((ticker) => ticker.trim())) {
      setNotice({
        tone: "warning",
        text: "Add at least one ticker before saving this watchlist.",
      });
      return;
    }

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

    setNotice({
      tone: "success",
      text: `Saved ${data.saved_count} ticker${data.saved_count === 1 ? "" : "s"}. Refreshing valuation results now.`,
    });
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
    setNotice({
      tone: "success",
      text: `Created watchlist "${data.watchlist.name}". Add tickers when you are ready.`,
    });
    const activeWatchlistId = data.watchlist.id;
    setSelectedWatchlistId(activeWatchlistId);
    await loadWatchlists();
    await loadTickers(activeWatchlistId);
    await loadResults(activeWatchlistId);
  }

  async function handleWatchlistChange(event: ChangeEvent<HTMLSelectElement>) {
    const watchlistId = event.target.value;
    setSelectedWatchlistId(watchlistId);
    setNotice(null);
    await loadTickers(watchlistId);
    await loadResults(watchlistId);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function refreshValuations(watchlistId = selectedWatchlistId) {
    setIsRefreshing(true);
    setNotice({
      tone: "info",
      text: "Refreshing valuation results. This can take a moment for larger watchlists.",
    });
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

    if (data.total_tickers === 0) {
      setNotice({
        tone: "warning",
        text: "This watchlist has no saved tickers yet. Add tickers, then save and refresh.",
      });
    } else {
      setNotice({
        tone: "success",
        text: `Refresh complete: ${data.completed_tickers} of ${data.total_tickers} ticker${data.total_tickers === 1 ? "" : "s"} processed.`,
      });
    }
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
      setNotice({
        tone: "warning",
        text: "No tickers were found in that CSV. Use a ticker column, symbol column, or put tickers in the first column.",
      });
      event.target.value = "";
      return;
    }

    setTickerText(importedTickers.join("\n"));
    setNotice({
      tone: "success",
      text: `Loaded ${importedTickers.length} ticker${importedTickers.length === 1 ? "" : "s"} from ${file.name}. Review the list, then save and refresh.`,
    });
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
      setIsAdmin(Boolean(data.is_admin));
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

  function noticeClass(tone: Notice["tone"]) {
    if (tone === "success") return "border-green-200 bg-green-50 text-green-800";
    if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
    if (tone === "error") return "border-red-200 bg-red-50 text-red-700";
    return "border-slate-200 bg-white text-slate-700";
  }

  function activeWatchlistName() {
    return watchlists.find((watchlist) => watchlist.id === selectedWatchlistId)?.name ?? "this watchlist";
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

          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <Link
                href="/admin"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                Admin
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="w-fit rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              Log Out
            </button>
          </div>
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

        {notice && (
          <p className={`mb-4 rounded-lg border p-3 text-sm ${noticeClass(notice.tone)}`}>
            {notice.text}
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">Output Table</h2>
              <p className="text-xs text-slate-500">
                {results.length} result{results.length === 1 ? "" : "s"}
              </p>
            </div>

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
                        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
                          <p className="font-medium text-slate-700">
                            {tickers.length === 0
                              ? `${activeWatchlistName()} does not have any saved tickers yet.`
                              : `${activeWatchlistName()} is ready for its first valuation refresh.`}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {tickers.length === 0
                              ? "Add tickers on the right, or upload a CSV, then choose Save Tickers & Refresh."
                              : "Choose Refresh Valuations to populate the output table for the saved tickers."}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    results.map((row) => (
                      <tr key={row.ticker} className={`border-b ${rowClass(row.row_color)}`}>
                        <td className="p-3 font-semibold">
                          <Link
                            href={`/ticker?ticker=${encodeURIComponent(row.ticker)}&ticker_list_id=${encodeURIComponent(selectedWatchlistId)}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {row.ticker}
                          </Link>
                        </td>
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
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Ticker Input</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Use one ticker per line. Invalid symbols and duplicates are ignored on save.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {tickers.length} / 100
              </span>
            </div>

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
              Saving replaces the current ticker list for {activeWatchlistName()} and then refreshes valuations when the beta cooldown allows it.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
