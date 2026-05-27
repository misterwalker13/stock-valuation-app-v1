"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type WatchlistSummary = {
  id: string;
  name: string;
  is_default: boolean;
  ticker_count: number;
  valuation_result_count: number;
  last_refreshed_at: string | null;
  last_refresh_job: {
    id: string;
    status: string;
    created_at: string;
    finished_at: string | null;
  } | null;
};

type AdminUser = {
  user_id: string;
  email: string;
  role: string;
  newsletter_opted_in: boolean;
  display_name: string | null;
  created_at: string;
  watchlist_count: number;
  ticker_count: number;
  watchlists: WatchlistSummary[];
};

type ApiErrorBody = {
  detail?: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

function formatDate(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Date(value).toLocaleString();
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

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

    setMessage(data.detail ?? "Request failed.");
    return false;
  }, [router]);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/admin/users`, { headers });
    const data = await response.json();

    if (!response.ok) {
      await handleApiAuthError(response, data);
      setIsLoading(false);
      return;
    }

    setUsers(data.users ?? []);
    setIsLoading(false);
  }, [getAuthHeaders, handleApiAuthError]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Triton Valuation Model
            </p>
            <h1 className="text-3xl font-bold">Admin Inspection</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Read-only view of early members, newsletter preference, watchlists, ticker counts, and refresh activity.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadUsers}
              disabled={isLoading}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Loading..." : "Refresh"}
            </button>
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              Dashboard
            </Link>
          </div>
        </header>

        {message && <p className="mb-4 text-sm text-red-700">{message}</p>}

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Members</h2>
            <p className="text-sm text-slate-500">{users.length} total users</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="p-3">Email</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Newsletter</th>
                  <th className="p-3">Watchlists</th>
                  <th className="p-3">Tickers</th>
                  <th className="p-3">Joined</th>
                  <th className="p-3">Last Refreshed</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td className="p-3 text-slate-500" colSpan={7}>
                      {isLoading ? "Loading users..." : "No users found."}
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    const lastRefreshed = user.watchlists
                      .map((watchlist) => watchlist.last_refreshed_at)
                      .filter(Boolean)
                      .sort()
                      .reverse()[0] ?? null;

                    return (
                      <tr key={user.user_id} className="border-b align-top hover:bg-slate-50">
                        <td className="p-3 font-medium">{user.email}</td>
                        <td className="p-3">{user.role}</td>
                        <td className="p-3">{user.newsletter_opted_in ? "Yes" : "No"}</td>
                        <td className="p-3">
                          <div className="space-y-1">
                            <p>{user.watchlist_count} / 2</p>
                            {user.watchlists.map((watchlist) => (
                              <p key={watchlist.id} className="text-xs text-slate-500">
                                {watchlist.name}{watchlist.is_default ? " (Default)" : ""}: {watchlist.ticker_count} tickers
                              </p>
                            ))}
                          </div>
                        </td>
                        <td className="p-3">{user.ticker_count}</td>
                        <td className="p-3">{formatDate(user.created_at)}</td>
                        <td className="p-3">{formatDate(lastRefreshed)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
