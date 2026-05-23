"use client";

import { useEffect, useState } from "react";

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

const API_BASE_URL = "http://127.0.0.1:8000";

export default function Home() {
  const [tickerText, setTickerText] = useState("");
  const [tickers, setTickers] = useState<TickerItem[]>([]);
  const [results, setResults] = useState<ValuationResult[]>([]);
  const [message, setMessage] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  async function loadTickers() {
    const response = await fetch(`${API_BASE_URL}/tickers`);
    const data = await response.json();

    setTickers(data.tickers ?? []);
    setTickerText((data.tickers ?? []).map((item: TickerItem) => item.ticker).join("\n"));
  }

  async function loadResults() {
    const response = await fetch(`${API_BASE_URL}/valuation-results`);
    const data = await response.json();
  
    const valuationResults = data.results ?? [];
    setResults(valuationResults);
  
    const refreshedDates = valuationResults
      .map((row: ValuationResult) => row.last_refreshed_at)
      .filter(Boolean)
      .sort()
      .reverse();
  
    setLastRefreshed(refreshedDates[0] ?? null);
  }

  async function saveTickers() {
    const rawTickers = tickerText.split("\n");

    const response = await fetch(`${API_BASE_URL}/tickers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tickers: rawTickers }),
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.detail ?? "Failed to save tickers.");
      return;
    }

    setMessage(`Saved ${data.saved_count} tickers.`);
    setTickers(data.tickers ?? []);
    setTickerText((data.tickers ?? []).map((item: TickerItem) => item.ticker).join("\n"));
  }

  async function refreshValuations() {
    setIsRefreshing(true);
    setMessage("Refreshing valuations...");

    const response = await fetch(`${API_BASE_URL}/refresh-valuations`, {
      method: "POST",
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.detail ?? "Refresh failed.");
      setIsRefreshing(false);
      return;
    }

    setMessage(`Refresh complete: ${data.completed_tickers} of ${data.total_tickers} tickers processed.`);
    await loadResults();
    setIsRefreshing(false);
  }

  useEffect(() => {
    loadTickers();
    loadResults();
  }, []);

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

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <h1 className="text-3xl font-bold">Stock Valuation Dashboard</h1>
          <p className="mt-2 text-sm text-slate-600">
            Version 1 workspace: valuation output on the left, ticker input on the right.
          </p>
          <p className="mt-1 text-sm font-medium text-slate-700">
            {formatLastRefreshed(lastRefreshed)}
          </p>
        </header>

        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={refreshValuations}
            disabled={isRefreshing}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing..." : "Refresh Valuations"}
          </button>

          <button
            onClick={loadResults}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold"
          >
            Reload Results
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

            <textarea
              value={tickerText}
              onChange={(event) => setTickerText(event.target.value)}
              className="h-80 w-full resize-none rounded-lg border border-slate-300 p-3 font-mono text-sm"
              placeholder={"Paste tickers here, one per line:\nAAPL\nMSFT\nBRK.B"}
            />

            <button
              onClick={saveTickers}
              className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Save Tickers
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