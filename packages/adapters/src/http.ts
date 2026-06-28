/**
 * Minimal HTTP transport abstraction for the real venue adapters
 * (`CantonSwapAdapter`, `OneSwapAdapter`).
 *
 * The point of this seam is testability and purity (ARCHITECTURE.md §1
 * invariant #5): an adapter's quote normalization is a pure function of
 * `(request, venue response, receivedAt)`, and the impure act of *fetching* the
 * venue response is injected. In production the default {@link fetchJson}
 * (built on the global `fetch`) is used; in tests a fixture-backed {@link Fetcher}
 * returns recorded responses, so **no live network call happens in CI**.
 */

/** A venue's HTTP response, already parsed as JSON (or `undefined` if no body). */
export interface HttpResponse {
  /** HTTP status code. */
  readonly status: number;
  /** Parsed JSON body (treated as untrusted input by the normalizer). */
  readonly body: unknown;
}

/** A single HTTP request an adapter wants to make. */
export interface HttpRequest {
  readonly url: string;
  readonly method: 'GET' | 'POST';
  readonly headers?: Readonly<Record<string, string>>;
  /** JSON-serializable request body (POST only). */
  readonly body?: unknown;
}

/**
 * Injectable transport: performs one {@link HttpRequest} and resolves the
 * parsed {@link HttpResponse}. Transport/timeout failures reject the promise
 * (the adapter turns network errors into rejected promises, business "no"s into
 * typed `QuoteRejection`s — ARCHITECTURE.md §6).
 */
export type Fetcher = (request: HttpRequest) => Promise<HttpResponse>;

/**
 * Default, honest User-Agent for live requests. Some venue WAFs reject a request
 * that carries no User-Agent with a 403 (verified: Tradecraft 403s a request
 * with no UA, and any non-empty UA, including this one, returns 200 identically
 * to curl/browser UAs). This is a truthful identifier, not a browser spoof, and
 * a caller can override it via `HttpRequest.headers`. Bump the version on release.
 */
const DEFAULT_USER_AGENT = 'synfin-adapters/0.1.0 (+https://synfin.xyz)';

/**
 * Default {@link Fetcher} backed by the global `fetch`, with a timeout. Used by
 * the CLI for live, read-only quote requests. Never used in tests/CI.
 */
export function fetchJson(timeoutMs = 8000): Fetcher {
  return async (request: HttpRequest): Promise<HttpResponse> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        accept: 'application/json',
        ...(request.body !== undefined
          ? { 'content-type': 'application/json' }
          : {}),
        // Sent before the request.headers spread so a caller can override it.
        'user-agent': DEFAULT_USER_AGENT,
        ...request.headers,
      };
      const res = await fetch(request.url, {
        method: request.method,
        signal: controller.signal,
        headers,
        ...(request.body !== undefined
          ? { body: JSON.stringify(request.body) }
          : {}),
      });
      const text = await res.text();
      let body: unknown;
      try {
        body = text === '' ? undefined : JSON.parse(text);
      } catch {
        // Non-JSON body: surface the raw text so the normalizer can reject it.
        body = text;
      }
      return { status: res.status, body };
    } finally {
      clearTimeout(timer);
    }
  };
}
