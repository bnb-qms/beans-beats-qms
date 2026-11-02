import Link from "next/link";

const modules = [
  { href: "/order", name: "Order screen" },
  { href: "/queue", name: "Barista queue" },
  { href: "/o/example", name: "Guest status page" },
  { href: "/board", name: "Ready board" },
  { href: "/menu", name: "Menu controls" },
  { href: "/report", name: "Daily sales report" },
];

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Beans&amp;Beats Queue</h1>
      <ul className="mt-4 list-disc pl-6">
        {modules.map((m) => (
          <li key={m.href}>
            <Link className="underline" href={m.href}>
              {m.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
