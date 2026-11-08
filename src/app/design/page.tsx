import Link from "next/link";
import { Button } from "@/components/button";

// Living style guide: the base look every screen builds on. Rules in docs/design.md.
const colours = [
  ["ink", "bg-ink", "Text, rules, primary buttons"],
  ["paper", "bg-paper border-2 border-ink", "Staff screen background"],
  ["panel", "bg-panel", "Ticket and card backgrounds"],
  ["muted", "bg-muted", "Secondary text"],
  ["signal", "bg-signal", "READY only"],
  ["error", "bg-error", "Destructive actions, form errors"],
];

export default function DesignPage() {
  return (
    <main className="staff-gutters mx-auto w-full max-w-5xl py-8">
      <p className="eyebrow">Beans&amp;Beats Queue</p>
      <h1 className="display mt-2">Design</h1>
      <p className="mt-4 max-w-prose text-muted">
        The base look for every screen, taken from the Beans&amp;Beats deck.
        Black on white, heavy capitals, huge numbers, thick rules. Orange means
        ready, and nothing else.
      </p>

      <section className="mt-8">
        <h2 className="section-title">Navigation &amp; spacing</h2>
        <nav
          aria-label="Example staff navigation"
          className="mt-4 border border-hair bg-panel"
        >
          <ul className="flex flex-wrap">
            <li>
              <Link
                href="/design"
                className="staff-nav-link"
                aria-current="page"
              >
                Design reference
              </Link>
            </li>
            <li>
              <Link href="/order" className="staff-nav-link">
                Take orders
              </Link>
            </li>
            <li>
              <Link href="/queue" className="staff-nav-link">
                Barista queue
              </Link>
            </li>
          </ul>
        </nav>
        <p className="mt-4 text-muted">
          Navigation uses a paper background and black underline for the current
          page. Account actions sit separately. Every target is at least 52px
          tall.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["16 / 32px", "Phone / larger gutters"],
            ["16px", "Between cards"],
            ["24px", "Related groups"],
            ["32px", "Major sections"],
          ].map(([value, label]) => (
            <div key={label} className="rule bg-panel p-4">
              <dt className="eyebrow">{label}</dt>
              <dd className="numeral mt-2 text-2xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
        <p role="status" className="mt-6 border-l-4 border-ink bg-panel p-4">
          Offline · changes will sync when connected
        </p>
        <p className="mt-4 text-muted">
          Connection and pending-sync notices stay neutral; errors use error.
          The orange keyboard-focus outline remains visible.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="section-title">Colours</h2>
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {colours.map(([name, swatch, use]) => (
            <li key={name}>
              <div className={`h-20 ${swatch}`} />
              <p className="mt-2 font-bold">{name}</p>
              <p className="text-sm text-muted">{use}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="section-title">Type</h2>
        <div className="mt-4 space-y-4">
          <p className="display numeral">14</p>
          <p className="headline">Ready for pickup</p>
          <p className="eyebrow">Eyebrow label</p>
          <p>
            Body text, 17px. Used for drink names, options and short
            instructions.
          </p>
          <p className="numeral text-2xl font-bold">S$18.00</p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="section-title">Buttons</h2>
        <div className="mt-4 flex flex-wrap gap-4">
          <Button variant="primary">Submit order</Button>
          <Button>Mark preparing</Button>
          <Button variant="danger">Cancel order</Button>
          <Button variant="quiet">Undo</Button>
          <Button variant="primary" disabled>
            Submit order
          </Button>
        </div>
        <p className="mt-4 text-sm text-muted">
          At least 52px tall. Black when pressed. Labels are a verb and an
          object.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="section-title">Barista queue card</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <article className="rule flex min-w-0 flex-col bg-panel p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <p className="numeral text-5xl font-bold">14</p>
              <p className="eyebrow">Queued · 2 min</p>
            </div>
            <p className="mt-1 truncate text-xl font-bold">Mei</p>
            <ul className="mt-4 mb-4 space-y-1">
              <li>
                <span className="numeral font-bold">2×</span> Latte · Iced · Oat
              </li>
              <li>
                <span className="numeral font-bold">1×</span> Espresso · Hot
              </li>
            </ul>
            <Button variant="primary" block className="mt-auto">
              Mark preparing
            </Button>
          </article>
          <article className="animate-arrive flex min-w-0 flex-col border-t-[6px] border-signal bg-panel p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <p className="numeral text-5xl font-bold">12</p>
              <p className="eyebrow text-ink">Ready</p>
            </div>
            <p className="mt-1 truncate text-xl font-bold">Arjun</p>
            <ul className="mt-4 mb-4 space-y-1">
              <li>
                <span className="numeral font-bold">1×</span> Flat white · Hot
              </li>
            </ul>
            <Button block className="mt-auto">
              Mark collected
            </Button>
          </article>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="section-title">Ready board</h2>
        <div className="mt-4 bg-ink p-6 text-paper">
          <p className="headline">Ready for pickup</p>
          <ul className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3">
            {[
              ["12", "Arjun"],
              ["9", "Siti"],
              ["15", "Wei Ling"],
            ].map(([n, name]) => (
              <li key={n} className="border-t-[6px] border-signal pt-4">
                <p className="numeral text-6xl font-bold">{n}</p>
                <p className="mt-1 truncate text-2xl font-bold">{name}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-4 text-sm text-muted">
          White on black so it reads from across the hall.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="section-title">Guest page, ready</h2>
        <div className="mt-4 max-w-sm bg-signal p-6 text-ink">
          <p className="eyebrow text-ink">Order 12</p>
          <p className="display mt-2">Ready</p>
          <p className="mt-4 text-lg font-bold">
            Collect your drink at the counter.
          </p>
        </div>
        <p className="mt-4 text-sm text-muted">
          Black on orange, about 6:1 contrast. The whole screen turns orange
          when the order is ready.
        </p>
      </section>
    </main>
  );
}
