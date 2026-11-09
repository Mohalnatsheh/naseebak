/**
 * A GET that shares one request with any identical GET still in flight (QA WA-10): the dashboard context and the
 * page both load /api/profile when a page opens. Only requests in flight are shared, never a finished answer, so a
 * load after a save always reads fresh data. Client-safe (no server imports).
 */
const inflight = new Map<string, Promise<Response>>();

export function sharedGet(url: string): Promise<Response> {
  let pending = inflight.get(url);
  if (!pending) {
    pending = fetch(url);
    inflight.set(url, pending);
    const done = () => {
      if (inflight.get(url) === pending) inflight.delete(url);
    };
    pending.then(done, done);
  }
  // Each caller reads its own copy of the body
  return pending.then((res) => (typeof res.clone === "function" ? res.clone() : res));
}
