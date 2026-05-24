"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

type TickerItem = {
  ticker: string;
  sort_order: number;
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

export default function Home() {
  const router = useRouter();
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  const [tickerText, setTickerText] = useState("");
  const [tickers, setTickers] = useState<TickerItem[]>([]);
  const [results, setResults] = useState<ValuationResult[]>([]);
  const [message, setMessage] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

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

  const handleApiAuthError = useCallback(async (response: Response, data: { detail?: string }) => {
    if (response.status === 401 || response.status === 403) {
      await supabase.auth.signOut();
      router.push("/login");
      return true;
    }

    setMessage(data.detail ?? "Request failed.");
    return false;
  }, [router]);

  const loadTickers = useCallback(async () => {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/tickers`, { headers });
    const data = await response.json();

    if (!response.ok) {
      await handleApiAuthError(response, data);
      return;
    }

    setTickers(data.tickers ?? []);
    setTickerText((data.tickers ?? []).map((item: TickerItem) => item.ticker).join("\n"));
  }, [getAuthHeaders, handleApiAuthError]);

  const loadResults = useCallback(async (showMessage = false) => {
    const headers = await getAuthHeaders();
    const response = await fetch(
      `${API_BASE_URL}/valuation-results?timestamp=${Date.now()}`,
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
  
    if (showMessage) {
      setMessage(`Reloaded ${valuationResults.length} valuation results.`);
    }
  }, [getAuthHeaders, handleApiAuthError]);

  async function saveTickers() {
    const rawTickers = tickerText.split("\n");
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/tickers`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tickers: rawTickers }),
    });

    const data = await response.json();

    if (!response.ok) {
      await handleApiAuthError(response, data);
      return;
    }

    setMessage(`Saved ${data.saved_count} tickers.`);
    setTickers(data.tickers ?? []);
    setTickerText((data.tickers ?? []).map((item: TickerItem) => item.ticker).join("\n"));
    await refreshValuations();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function refreshValuations() {
    setIsRefreshing(true);
    setMessage("Refreshing valuations...");
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/refresh-valuations`, {
      method: "POST",
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      await handleApiAuthError(response, data);
      setIsRefreshing(false);
      return;
    }

    setMessage(`Refresh complete: ${data.completed_tickers} of ${data.total_tickers} tickers processed.`);
    await loadResults();
    setIsRefreshing(false);
  }

  async function handleCsvUpload(event: React.ChangeEvent<HTMLInputElement>) {
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
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.push("/login");
          return;
        }
        
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", session.user.id)
          .single();
        
        if (error || !profile) {
          await supabase.auth.signOut();
          router.push("/login");
          return;
        }
        
        if (profile.role !== "admin" && profile.role !== "additional_admin") {
          await supabase.auth.signOut();
          router.push("/login");
          return;
        }
        
        await loadTickers();
        await loadResults();
        setIsAuthChecking(false);
      }

      checkAuthAndLoadData();
    }, [router, loadTickers, loadResults]);

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
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Stock Valuation Dashboard</h1>
            <p className="mt-2 text-sm text-slate-600">
              Version 1 workspace: valuation output on the left, ticker input on the right.
            </p>
            <p className="mt-1 text-sm font-medium text-slate-700">
              {formatLastRefreshed(lastRefreshed)}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            Log Out
          </button>
        </header>

        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={refreshValuations}
            disabled={isRefreshing}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing..." : "Refresh Valuations"}
          </button>

          {message && <p className="text-sm text-slate-700">{message}</p>}
        </div>

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
