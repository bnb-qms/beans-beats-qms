import Link from "next/link";

const modules = [
  { href: "/order", name: "Order screen", who: "Staff" },
  { href: "/queue", name: "Barista queue", who: "Staff" },
  { href: "/board", name: "Ready board", who: "Booth display" },
  { href: null, name: "Guest status page", who: "Guests, via receipt QR" },
  { href: "/menu", name: "Menu controls", who: "Admin" },
  { href: "/report", name: "Daily sales report", who: "Admin" },
];

// Same public test accounts as the README. Remove this box when the passwords change before 26 Nov.
const testLogins = [
  { role: "Booth lead (admin)", username: "preview-admin" },
  { role: "Barista", username: "preview-barista" },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-[clamp(16px,2.5vw,32px)] py-10">
      <p className="eyebrow">Christmas Together 2026</p>
      <h1 className="display mt-2">Beans&amp;Beats Queue</h1>
      <ul className="mt-10 grid gap-x-6 sm:grid-cols-2">
        {modules.map((m) => (
          <li key={m.name} className="rule">
            {m.href ? (
              <Link
                href={m.href}
                className="flex min-h-tap items-baseline justify-between gap-4 py-4 text-xl font-bold hover:underline"
              >
                {m.name}
                <span className="eyebrow">{m.who}</span>
              </Link>
            ) : (
              <p className="flex min-h-tap items-baseline justify-between gap-4 py-4 text-xl font-bold">
                {m.name}
                <span className="eyebrow">{m.who}</span>
              </p>
            )}
          </li>
        ))}
      </ul>
      <section className="mt-12 bg-panel p-6" aria-labelledby="try-it">
        <h2 id="try-it" className="section-title">
          Try it: test logins
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {testLogins.map((login) => (
            <div key={login.username}>
              <dt className="eyebrow">{login.role}</dt>
              <dd className="mt-1">
                Username <code className="font-bold">{login.username}</code>
                <br />
                Password{" "}
                <code className="font-bold">local-preview-password</code>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-5">
          Take an order on the Order screen and scan its receipt QR with your
          phone to follow it. Then move it to Ready on the Barista queue and
          watch the Ready board and your phone update. Sign out before switching
          accounts.
        </p>
      </section>
    </main>
  );
}
