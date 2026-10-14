/**
 * Runs once when the Node.js server starts.
 *
 * Hostinger's log collector serialises console arguments as JSON, which drops an Error's
 * (non-enumerable) message and stack — Prisma errors showed up only as {"clientVersion":"7.4.0"}.
 * Converting Error objects to plain text keeps the real cause in the production logs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const format = (err: Error & { code?: unknown; errorCode?: unknown }) => {
    const code = err.code ?? err.errorCode;
    const stack = err.stack?.split("\n").slice(1, 4).join("\n") ?? "";
    return `${err.name}${code ? ` [${String(code)}]` : ""}: ${err.message}\n${stack}`;
  };

  const original = console.error.bind(console);
  console.error = (...args: unknown[]) =>
    original(...args.map((a) => (a instanceof Error ? format(a) : a)));
}
