import Link from "next/link";

export default function PhilosophyPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <article className="mx-auto max-w-3xl rounded-xl bg-white p-8 shadow-sm">
        <Link href="/" className="text-sm font-semibold underline">
          Back to Home
        </Link>
        <h1 className="mt-6 text-3xl font-bold">My Philosophy</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Triton Valuation Model is built around a simple belief: investing
          research should be structured enough to create discipline, but humble
          enough to leave room for judgment.
        </p>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          The goal is not to turn a valuation output into an automatic answer.
          The goal is to make research more consistent, help users compare
          opportunities more clearly, and encourage thoughtful review before any
          decision is made.
        </p>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          This first public version keeps the experience focused: watchlists,
          company research, transparent refresh limits, and a framework for
          reviewing valuation outputs without exposing the proprietary model.
        </p>
      </article>
    </main>
  );
}
