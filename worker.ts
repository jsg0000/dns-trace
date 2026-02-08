
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
    
    // CORS headers for local development or cross-origin access if needed
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Handle API route for Audit
    if (url.pathname === '/api/audit' && request.method === 'POST') {
      try {
        const { domain } = await request.json() as { domain: string };
        
        // 1. Verify API Key exists in Secrets
        if (!env.GEMINI_API_KEY) {
          console.error("Missing GEMINI_API_KEY in secrets");
          return new Response(JSON.stringify({ error: "Server misconfiguration: Missing API Key" }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders } 
          });
        }

        // 2. Call Gemini API via REST
        // Using gemini-3-flash-preview as requested for best text performance
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${env.GEMINI_API_KEY}`;
        
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

        if (!response.ok) {
           const errText = await response.text();
           console.error("Gemini API Error:", errText);
           throw new Error(`Gemini API returned ${response.status}`);
        }

        const data = await response.json() as any;
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Audit failed to generate.";

        return new Response(JSON.stringify({ text }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });

      } catch (error) {
        console.error("Worker Error:", error);
        return new Response(JSON.stringify({ error: "Failed to connect to AI service" }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // Fallback for non-API routes (if Assets binding misses)
    return new Response("Not Found", { status: 404 });
  },
};
