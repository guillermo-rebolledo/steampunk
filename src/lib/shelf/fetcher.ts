/**
 * The data layer's only I/O dependency.
 *
 * Everything downstream of this — parsing, Shelf assembly, price
 * normalisation — is pure, and is tested by handing `fetchShelf` a fetcher
 * that replays a captured Steam payload. Nothing below this line is mocked.
 *
 * Shaped as a subset of the global `fetch` so production can pass `fetch`
 * itself, and so the caching policy (none, for now — ADR-0002 revisits it)
 * stays at the composition root rather than buried in the data layer.
 */
export type Fetcher = (url: string) => Promise<Response>;
