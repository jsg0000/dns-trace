/**
 * aiService.ts
 * Calls the /api/audit Cloudflare Worker endpoint which uses
 * Workers AI (@cf/meta/llama-3.1-8b-instruct) — not Gemini.
 * Renamed from geminiService.ts to reflect reality.
 */
export const getTechnicalInsight = async (domain: string): Promise<string> => {
  try {
    const response = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain }),
    });

    if (response.status === 429) {
      return 'Rate limit reached. The AI audit is limited to 5 requests per hour per IP to prevent abuse. Try again later.';
    }

    if (!response.ok) {
      throw new Error(`Worker error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.text || 'Audit generation failed: no content returned.';

  } catch (error) {
    console.error('AI Audit failed:', error);
    return `Automated Audit Unavailable.\n\nError: ${error instanceof Error ? error.message : 'Connection error'}`;
  }
};
