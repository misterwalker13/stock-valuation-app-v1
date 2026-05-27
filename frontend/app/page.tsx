import Link from "next/link";

const navLinks = [
  { href: "/login", label: "Login" },
  { href: "/signup", label: "Signup" },
  { href: "/philosophy", label: "My Philosophy" },
  { href: "/disclaimer", label: "Disclaimer" },
];

const features = [
  {
    title: "Member Watchlists",
    body: "Build focused ticker lists, keep research organized, and refresh valuation outputs inside a clear beta usage limit.",
  },
  {
    title: "Dashboard Review",
    body: "Compare stock price, calculated price, calculated price difference, and double-negative status in one scannable table.",
  },
  {
    title: "Single-Ticker Research",
    body: "Drill into one company at a time with company profile data, a full summary, recent news, and valuation output.",
  },
  {
    title: "Founder-Led Framework",
    body: "Use a structured valuation research framework shaped by a personal investing philosophy, not generic market noise.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-sm font-semibold tracking-wide">
          Triton Valuation Model
        </Link>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-white">
              {link.label}
            </Link>
          ))}
        </div>
      </nav>

      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            Invite-only beta
          </p>
          <h1 className="mt-4 max-w-4xl text-5xl font-bold tracking-tight lg:text-6xl">
            Triton Valuation Model
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            A structured valuation research framework for watchlist review,
            single-company research, and disciplined investment thinking.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-lg bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
            >
              Create Account With Invite
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-slate-600 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-900"
            >
              Sign In
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
          <p className="text-sm font-semibold text-slate-300">
            Research Workflow
          </p>
          <div className="mt-5 space-y-4">
            {["Build a focused watchlist", "Refresh valuation outputs", "Open single-ticker research", "Apply judgment before acting"].map((step, index) => (
              <div key={step} className="flex items-center gap-3 rounded-lg bg-slate-950 p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400 text-sm font-bold text-slate-950">
                  {index + 1}
                </span>
                <span className="text-sm text-slate-200">{step}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-16 text-slate-900">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold">Built For Focused Research</h2>
            <p className="mt-3 text-slate-600">
              Triton helps members move from a broad list of tickers to a more
              disciplined review process without exposing the underlying
              valuation logic in the public product.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <article key={feature.title} className="rounded-lg border border-slate-200 p-5">
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {feature.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-100 px-6 py-16 text-slate-900">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
          <article className="rounded-lg bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold">Founder Philosophy</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              The model is designed around patient research, valuation
              discipline, and the belief that a useful tool should sharpen
              judgment rather than replace it.
            </p>
            <Link href="/philosophy" className="mt-4 inline-block text-sm font-semibold underline">
              Read My Philosophy
            </Link>
          </article>

          <article className="rounded-lg bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold">Responsible Use</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Triton is an educational and research tool. It is not financial,
              investment, tax, or legal advice, and every output requires your
              own review.
            </p>
            <Link href="/disclaimer" className="mt-4 inline-block text-sm font-semibold underline">
              Read Disclaimer
            </Link>
          </article>
        </div>
      </section>

      <footer className="border-t border-slate-800 px-6 py-8 text-sm text-slate-400">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p>Triton Valuation Model</p>
          <div className="flex flex-wrap gap-4">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-white">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}
