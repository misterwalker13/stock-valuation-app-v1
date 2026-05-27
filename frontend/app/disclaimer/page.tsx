import Link from "next/link";

export default function DisclaimerPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <article className="mx-auto max-w-3xl rounded-xl bg-white p-8 shadow-sm">
        <Link href="/" className="text-sm font-semibold underline">
          Back to Home
        </Link>
        <h1 className="mt-6 text-3xl font-bold">Disclaimer</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Placeholder legal copy for attorney review. Triton Valuation Model is
          provided for educational and research purposes only. It is not
          financial, investment, tax, accounting, or legal advice.
        </p>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Outputs from the application are research inputs, not recommendations
          to buy, sell, or hold any security. Users are responsible for their
          own decisions and should consult qualified professionals where
          appropriate.
        </p>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Market data may be delayed, incomplete, inaccurate, or unavailable.
          No representation is made that any result is complete, current, or
          suitable for any particular person or purpose.
        </p>
      </article>
    </main>
  );
}
