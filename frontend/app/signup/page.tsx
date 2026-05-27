"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type SignupErrorBody = {
  detail?: string;
};

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [newsletterOptedIn, setNewsletterOptedIn] = useState(true);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsLoading(true);
    setMessage("");

    const response = await fetch(`${API_BASE_URL}/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        invite_code: inviteCode,
        newsletter_opted_in: newsletterOptedIn,
      }),
    });

    const data: SignupErrorBody = await response.json();

    if (!response.ok) {
      setMessage(data.detail ?? "Unable to create account.");
      setIsLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsLoading(false);

    if (error) {
      setMessage("Account created. Please sign in from the login page.");
      router.push("/login");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-900">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Triton Valuation Model
        </p>
        <h1 className="mt-2 text-2xl font-bold">Create Member Account</h1>
        <p className="mt-2 text-sm text-slate-600">
          Early access is invite-only while the research dashboard is in beta.
        </p>

        <form onSubmit={handleSignup} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Invite Code</label>
            <input
              type="text"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
              className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm uppercase"
              required
            />
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={newsletterOptedIn}
              onChange={(event) => setNewsletterOptedIn(event.target.checked)}
              className="mt-1"
            />
            <span>
              Send me Triton updates and founder notes by email. You can opt out later.
            </span>
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        {message && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {message}
          </p>
        )}

        <p className="mt-4 text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-slate-900 underline">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
