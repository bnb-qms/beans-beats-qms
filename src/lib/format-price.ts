/** Formats a price stored in cents, e.g. 800 -> "S$8.00". */
export function formatPrice(cents: number): string {
  return `S$${(cents / 100).toFixed(2)}`;
}
