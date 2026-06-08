"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

function friendlyLoginError(message: string) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("invalid login credentials")) {
    return "We could not sign you in with that email and password. Check for typos, or use Forgot password? to reset your password.";
  }

  if (lowerMessage.includes("email not confirmed")) {
    return "Please confirm your email before signing in. If you recently signed up and still cannot get in, try resetting your password.";
  }

  return `${message} If you recently signed up and cannot log in, try Forgot password? below.`;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("message") === "account-created") {
      setMessage("Account created. Please sign in. If your password does not work, use Forgot password? to set a new one.");
    }
  }, [searchParams]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsLoading(false);

    if (error) {
      setMessage(friendlyLoginError(error.message));
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-900">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Stock Valuation Login</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in to access the valuation dashboard.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Have an invite code?{" "}
          <Link href="/signup" className="font-semibold text-slate-900 underline">
            Create a member account
          </Link>
        </p>

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
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
            <div className="flex items-center justify-between gap-3">
              <label className="block text-sm font-medium">Password</label>
              <Link
                href="/reset-password"
                className="text-sm font-semibold text-slate-900 underline"
              >
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-green-700 px-4 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {message && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-900">
          <p className="text-sm font-medium">Loading login...</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
