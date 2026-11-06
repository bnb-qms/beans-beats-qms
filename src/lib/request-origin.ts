export function sameRequestOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    // Next can normalise request.url to localhost behind its server/proxy.
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      parsed.origin === origin &&
      parsed.host === request.headers.get("host")
    );
  } catch {
    return false;
  }
}
