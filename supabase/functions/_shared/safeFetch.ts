// supabase/functions/_shared/safeFetch.ts
// Fetches a URL someone typed into the app, without letting it reach anything
// that isn't a public website:
//
//   - only http/https on the default ports;
//   - no localhost, .local/.internal names, or IP addresses (literal or
//     resolved) in private, loopback, link-local (cloud metadata), CGNAT,
//     multicast or IPv6 unique-local ranges;
//   - redirects followed by hand, at most MAX_REDIRECTS, each hop checked again;
//   - the body streamed and cut off past maxBytes, so a huge or endless
//     response can't exhaust the isolate's memory;
//   - a timeout on every request.
//
// DNS is checked before the fetch, so a name that changes its answer between
// the check and the connect could still slip through. That gap is accepted:
// this runs on Supabase's edge runtime, not inside a private network.

const MAX_REDIRECTS = 3;

/** A URL that was refused or a response that broke a limit. Its message is
 *  safe to show the person who typed the link. */
export class UnsafeFetchError extends Error {}

function ipv4Parts(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every(n => n <= 255) ? parts : null;
}

function isPrivateIpv4([a, b]: number[]): boolean {
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b! >= 64 && b! <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b! >= 16 && b! <= 31)
    || (a === 192 && (b === 168 || b === 0))
    || (a === 198 && (b === 18 || b === 19))
    || a! >= 224;
}

function isPrivateIpv6(raw: string): boolean {
  const host = raw.toLowerCase();
  if (host === '::' || host === '::1') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
  if (mapped) {
    const v4 = ipv4Parts(mapped[1]!);
    return !v4 || isPrivateIpv4(v4);
  }
  // ::ffff:7f00:1 style (hex) mapped v4: refuse rather than decode.
  if (host.startsWith('::ffff:')) return true;
  return /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith('ff');
}

function isPrivateAddress(address: string): boolean {
  const v4 = ipv4Parts(address);
  if (v4) return isPrivateIpv4(v4);
  if (address.includes(':')) return isPrivateIpv6(address);
  return false;
}

async function resolvesPrivate(hostname: string): Promise<boolean> {
  const answers: string[] = [];
  let anyLookupWorked = false;
  for (const type of ['A', 'AAAA'] as const) {
    try {
      // Fully qualified, so a resolver's search domain is never appended.
      answers.push(...await Deno.resolveDns(`${hostname}.`, type));
      anyLookupWorked = true;
    } catch (error) {
      // A runtime without DNS lookups can't check; the literal and name rules
      // above still apply. A name with no records simply fails to fetch.
      if (error instanceof TypeError || (error as Error)?.name === 'NotSupported') return false;
    }
  }
  return anyLookupWorked && answers.some(isPrivateAddress);
}

async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UnsafeFetchError('Paste a web link starting with https://');
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new UnsafeFetchError("That link can't be opened. Use the business's normal web address.");
  }
  if (url.username || url.password) {
    throw new UnsafeFetchError("That link can't be opened. Use the business's normal web address.");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const refused = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
    || host.endsWith('.internal') || !host.includes('.') && !host.includes(':')
    || isPrivateAddress(host)
    || (!ipv4Parts(host) && !host.includes(':') && await resolvesPrivate(host));
  if (refused) throw new UnsafeFetchError("That link can't be opened. Use the business's public web address.");
}

async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new UnsafeFetchError('TOO_LARGE');
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new UnsafeFetchError('TOO_LARGE');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  /** Lower-case media type with no parameters, e.g. "text/html". */
  contentType: string;
  bytes: Uint8Array;
  /** Where the last hop landed, after redirects. */
  finalUrl: URL;
}

export async function safeFetch(
  input: URL,
  options: { headers?: Record<string, string>; maxBytes: number; timeoutMs: number },
): Promise<SafeFetchResult> {
  let url = input;
  for (let hop = 0; ; hop++) {
    await assertPublicUrl(url);
    const response = await fetch(url, {
      headers: options.headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      if (hop >= MAX_REDIRECTS) throw new UnsafeFetchError('That link redirects too many times.');
      url = new URL(location, url);
      continue;
    }
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, status: response.status, contentType, bytes: new Uint8Array(), finalUrl: url };
    }
    return { ok: true, status: response.status, contentType, bytes: await readCapped(response, options.maxBytes), finalUrl: url };
  }
}

/** base64 of raw bytes, built in chunks so a large file doesn't blow the stack
 *  or build a huge intermediate string one character at a time. */
export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunk)));
  }
  return btoa(parts.join(''));
}
