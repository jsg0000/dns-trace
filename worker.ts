
export interface Env {
  AI: any;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === '/api/audit' && request.method === 'POST') {
      try {
        const { domain } = await request.json() as { domain: string };
        
        if (!env.AI) {
          return new Response(JSON.stringify({ error: "Cloudflare AI binding not found" }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders } 
          });
        }

        const prompt = `Perform a "Master's Level" security and infrastructure audit for the domain: ${domain}.
      
        Focus on:
        1. Theoretical TLS Stack Analysis (assume modern best practices vs legacy risks).
        2. DNSSEC and Route Propagation resilience.
        3. Certificate Hierarchy validation logic.
        4. Header Hardening (HSTS, CSP) importance.

        Format the output as a concise, 4-point technical breakdown. Use strict, cybersecurity terminology (e.g., "ECDHE key exchange", "Forward Secrecy", "X.509 chain"). Do not use markdown formatting like bolding or headers, just plain text numbers. Keep it under 150 words.`;

        const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            { role: 'system', content: 'You are a senior cybersecurity infrastructure architect.' },
            { role: 'user', content: prompt }
          ]
        });

        const text = response.response || "Audit failed to generate.";

        return new Response(JSON.stringify({ text }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });

      } catch (error) {
        console.error("Worker AI Error:", error);
        return new Response(JSON.stringify({ error: "Internal AI processing error" }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};