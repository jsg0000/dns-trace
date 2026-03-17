export interface Env {
  AI: any;
  RATE_LIMITER: KVNamespace;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

/** Only accept valid hostnames — rejects prompt injection attempts */
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

/**
 * Replace with your actual deployed frontend origin.
 * Using '*' lets anyone call your Worker from their own site and drain your AI quota.
 * Your domain from the screenshots: https://dns-trace.cfjsg.workers.dev
 */
const ALLOWED_ORIGIN = 'https://dns-trace.cfjsg.workers.dev';

/** Requests allowed per IP per window */
const RATE_LIMIT = 5;
/** Window duration in seconds */
const RATE_WINDOW_SECONDS = 3600; // 1 hour

function sanitizeDomain(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase().replace(/^https?:\/\//, '').split(/[/?#]/)[0];
  if (trimmed.length === 0 || trimmed.length > 253) return null;
  if (!DOMAIN_RE.test(trimmed)) return null;
  return trimmed;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === '/api/audit' && request.method === 'POST') {
      try {
        // ── Rate limiting ────────────────────────────────────────────────────
        const clientIp = request.headers.get('cf-connecting-ip') ?? 'unknown';
        const rlKey = `rl:${clientIp}`;

        const currentStr = await env.RATE_LIMITER.get(rlKey);
        const current = currentStr ? parseInt(currentStr, 10) : 0;

        if (current >= RATE_LIMIT) {
          return new Response(
            JSON.stringify({ error: `Rate limit exceeded. Max ${RATE_LIMIT} audits per hour per IP.` }),
            { status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
          );
        }

        // Increment count; TTL resets only on first write — use put with expirationTtl
        await env.RATE_LIMITER.put(rlKey, String(current + 1), {
          expirationTtl: RATE_WINDOW_SECONDS,
        });
        // ────────────────────────────────────────────────────────────────────

        const body = await request.json() as { domain?: unknown };

        if (typeof body.domain !== 'string') {
          return new Response(JSON.stringify({ error: 'Invalid payload' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        const domain = sanitizeDomain(body.domain);
        if (!domain) {
          return new Response(JSON.stringify({ error: 'Invalid domain format' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        if (!env.AI) {
          return new Response(JSON.stringify({ error: 'Cloudflare AI binding not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        // Domain is validated as a safe hostname — safe to interpolate
        const prompt = `Perform a master's-level security and infrastructure audit for the domain: ${domain}

Focus on:
1. TLS stack analysis — forward secrecy, cipher suites, ECDHE key exchange risks.
2. DNSSEC and route propagation resilience.
3. X.509 certificate hierarchy validation logic.
4. Header hardening — HSTS preload, CSP policy gaps, X-Frame-Options relevance.

Output a concise 4-point technical breakdown. Use strict cybersecurity terminology. No markdown, no bullet symbols — plain numbered text only. Under 150 words.`;

        const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            { role: 'system', content: 'You are a senior cybersecurity infrastructure architect. Be precise and technical.' },
            { role: 'user', content: prompt },
          ],
        });

        const text = response?.response ?? 'Audit generation failed.';

        return new Response(JSON.stringify({ text }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });

      } catch (error) {
        console.error('Worker AI Error:', error);
        return new Response(JSON.stringify({ error: 'Internal AI processing error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};
