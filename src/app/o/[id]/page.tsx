// Module 3: Guest status page, opened from the order's QR code (/o/<order id>).
// Placeholder until the module owner builds it. Reading `params` here needs a
// <Suspense> boundary in Next 16, see node_modules/next/dist/docs (blocking-prerender-dynamic).
export default function GuestStatusPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Order status</h1>
      <p className="mt-2 text-zinc-600">
        Live status for the guest&apos;s order.
      </p>
    </main>
  );
}
