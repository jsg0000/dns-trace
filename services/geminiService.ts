
export const getTechnicalInsight = async (domain: string): Promise<string> => {
  try {
    // Call our own Cloudflare Worker endpoint
    const response = await fetch('/api/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ domain }),
    });

    if (!response.ok) {
      throw new Error(`Worker Error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.text || "Audit generation failed: No content returned.";
    
  } catch (error) {
    console.error("Gemini Audit Failed:", error);
    return `Automated Audit Unavailable.\n\nError: ${error instanceof Error ? error.message : 'Connection error'}`;
  }
};
