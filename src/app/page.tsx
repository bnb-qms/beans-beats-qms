import Link from "next/link";

const modules = [
  { href: "/order", name: "Order screen", who: "Staff" },
  { href: "/queue", name: "Barista queue", who: "Staff" },
  { href: "/board", name: "Ready board", who: "Booth display" },
  { href: "/o/example", name: "Guest status page", who: "Guests" },
  { href: "/menu", name: "Menu controls", who: "Admin" },
  { href: "/report", name: "Daily sales report", who: "Admin" },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-[clamp(16px,2.5vw,32px)] py-10">
      <p className="eyebrow">Christmas Together 2026</p>
      <h1 className="display mt-2">Beans&amp;Beats Queue</h1>
      <ul className="mt-10 grid gap-x-6 sm:grid-cols-2">
        {modules.map((m) => (
          <li key={m.href} className="rule">
            <Link
              href={m.href}
              className="flex min-h-tap items-baseline justify-between gap-4 py-4 text-xl font-bold hover:underline"
            >
              {m.name}
              <span className="eyebrow">{m.who}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-10 text-sm text-muted">
        <Link href="/design" className="underline underline-offset-4">
          Design reference
        </Link>
      </p>
    </main>
  );
}
