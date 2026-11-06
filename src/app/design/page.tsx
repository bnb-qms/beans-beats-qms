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
    <main className="mx-auto w-full max-w-5xl px-[clamp(16px,2.5vw,32px)] py-10">
      <p className="eyebrow">Beans&amp;Beats Queue</p>
      <h1 className="display mt-2">Design</h1>
      <p className="mt-4 max-w-prose text-muted">
        The base look for every screen, taken from the Beans&amp;Beats deck.
        Black on white, heavy capitals, huge numbers, thick rules. Orange means
        ready, and nothing else.
      </p>

      <section className="mt-12">
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

      <section className="mt-12">
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

      <section className="mt-12">
        <h2 className="section-title">Buttons</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="primary">Submit order</Button>
          <Button>Mark making</Button>
          <Button variant="danger">Cancel order</Button>
          <Button variant="quiet">Undo</Button>
          <Button variant="primary" disabled>
            Submit order
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted">
          At least 52px tall. Black when pressed. Labels are a verb and an
          object.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="section-title">Barista queue card</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <article className="rule bg-panel p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="numeral text-5xl font-bold">14</p>
              <p className="eyebrow">Queued · 2 min</p>
            </div>
            <p className="mt-1 truncate text-xl font-bold">Mei</p>
            <ul className="mt-3 space-y-1">
              <li>
                <span className="numeral font-bold">2×</span> Latte · Iced · Oat
              </li>
              <li>
                <span className="numeral font-bold">1×</span> Espresso · Hot
              </li>
            </ul>
            <Button variant="primary" block className="mt-4">
              Mark making
            </Button>
          </article>
          <article className="animate-arrive border-t-[6px] border-signal bg-panel p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="numeral text-5xl font-bold">12</p>
              <p className="eyebrow text-ink">Ready</p>
            </div>
            <p className="mt-1 truncate text-xl font-bold">Arjun</p>
            <ul className="mt-3 space-y-1">
              <li>
                <span className="numeral font-bold">1×</span> Flat white · Hot
              </li>
            </ul>
            <Button block className="mt-4">
              Mark collected
            </Button>
          </article>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="section-title">Ready board</h2>
        <div className="mt-4 bg-ink p-6 text-paper">
          <p className="headline">Ready for pickup</p>
          <ul className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3">
            {[
              ["12", "Arjun"],
              ["9", "Siti"],
              ["15", "Wei Ling"],
            ].map(([n, name]) => (
              <li key={n} className="border-t-[6px] border-signal pt-3">
                <p className="numeral text-6xl font-bold">{n}</p>
                <p className="mt-1 truncate text-2xl font-bold">{name}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-3 text-sm text-muted">
          White on black so it reads from across the hall.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="section-title">Guest page, ready</h2>
        <div className="mt-4 max-w-sm bg-signal p-6 text-ink">
          <p className="eyebrow text-ink">Order 12</p>
          <p className="display mt-2">Ready</p>
          <p className="mt-4 text-lg font-bold">
            Collect your drink at the counter.
          </p>
        </div>
        <p className="mt-3 text-sm text-muted">
          Black on orange, about 6:1 contrast. The whole screen turns orange
          when the order is ready.
        </p>
      </section>
    </main>
  );
}
