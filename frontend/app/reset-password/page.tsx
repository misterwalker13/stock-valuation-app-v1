"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type ResetMode = "request" | "update";

function passwordRecoveryUrl() {
  return `${window.location.origin}/reset-password`;
}

export default function ResetPasswordPage() {
  const router = useRouter();

  const [mode, setMode] = useState<ResetMode>("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    const looksLikeRecoveryLink =
      hash.includes("type=recovery") ||
      hash.includes("access_token") ||
      params.has("code");

    if (looksLikeRecoveryLink) {
      setMode("update");
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("update");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session && looksLikeRecoveryLink) {
        setMode("update");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleResetRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsLoading(true);
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: passwordRecoveryUrl(),
    });

    setIsLoading(false);

    if (error) {
      setMessageTone("error");
      setMessage(error.message);
      return;
    }

    setMessageTone("success");
    setMessage("If an account exists for that email, a password reset link has been sent.");
  }

  async function handlePasswordUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 8) {
      setMessageTone("error");
      setMessage("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessageTone("error");
      setMessage("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    const { error } = await supabase.auth.updateUser({ password });

    setIsLoading(false);

    if (error) {
      setMessageTone("error");
      setMessage(error.message);
      return;
    }

    setMessageTone("success");
    setMessage("Password updated. Redirecting you to login...");
    await supabase.auth.signOut();
    window.setTimeout(() => {
      router.push("/login");
    }, 1200);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-900">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Triton Valuation Model
        </p>
        <h1 className="mt-2 text-2xl font-bold">
          {mode === "update" ? "Set New Password" : "Reset Password"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {mode === "update"
            ? "Enter a new password for your account."
            : "Enter the email you used to sign up. We will send a secure password reset link if the account exists."}
        </p>

        {mode === "request" ? (
          <form onSubmit={handleResetRequest} className="mt-6 space-y-4">
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

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-green-700 px-4 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Sending reset link..." : "Send Reset Link"}
            </button>
          </form>
        ) : (
          <form onSubmit={handlePasswordUpdate} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium">New Password</label>
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
              <label className="block text-sm font-medium">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-green-700 px-4 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Updating password..." : "Update Password"}
            </button>
          </form>
        )}

        {message && (
          <p
            className={`mt-4 rounded-lg p-3 text-sm ${
              messageTone === "success"
                ? "bg-green-50 text-green-800"
                : "bg-red-50 text-red-700"
            }`}
          >
            {message}
          </p>
        )}

        <p className="mt-4 text-sm text-slate-600">
          Remember your password?{" "}
          <Link href="/login" className="font-semibold text-slate-900 underline">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
