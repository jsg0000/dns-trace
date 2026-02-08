export interface Env {
  GEMINI_API_KEY: string;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle API route for Audit
    if (url.pathname === '/api/audit' && request.method === 'POST') {
      try {
        const { domain } = await request.json() as { domain: string };
        
        if (!env.GEMINI_API_KEY) {
          return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured in secrets" }), { status: 500 });
        }

        // Call Gemini API via REST (No SDK needed for Worker to keep it lightweight)
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`;
        
        const prompt = `Perform a "Master's Level" security and infrastructure audit for the domain: ${domain}.
      
        Focus on:
        1. Theoretical TLS Stack Analysis (assume modern best practices vs legacy risks).
        2. DNSSEC and Route Propagation resilience.
        3. Certificate Hierarchy validation logic.
        4. Header Hardening (HSTS, CSP) importance.

        Format the output as a concise, 4-point technical breakdown. Use strict, cybersecurity terminology (e.g., "ECDHE key exchange", "Forward Secrecy", "X.509 chain"). Do not use markdown formatting like bolding or headers, just plain text numbers. Keep it under 150 words.`;

        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });

        const data = await response.json() as any;
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Audit failed to generate.";

        return new Response(JSON.stringify({ text }), {
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (error) {
        return new Response(JSON.stringify({ error: "Failed to connect to AI service" }), { status: 500 });
      }
    }

    // Serve static assets (React App) if not an API call
    // The 'assets' binding is handled automatically by Cloudflare when 'assets' is defined in wrangler.json
    // but we return 404 here for the worker logic, letting the asset server take over for non-matched routes
    // OR if using the new Assets architecture, we just return fetch(request)
    return new Response("Not Found", { status: 404 });
  },
};