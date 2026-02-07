
import { GoogleGenAI } from "@google/genai";

export const getTechnicalInsight = async (domain: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Perform a Master's level Security & Network Audit for "${domain}".
      Address the following:
      1. TLS Stack: Comment on the likely use of TLS 1.3, 0-RTT, and Encrypted Client Hello (ECH).
      2. Certificate Strategy: Analyze their use of wildcard certs vs individual SANs and their CA choice.
      3. DNSSEC & Routing: Evaluate the presence of DNSSEC (DS records) and RPKI for BGP route validation.
      4. Header Security: Expected implementation of HSTS (Preload list status) and CSP.
      Use dense, academic language. Be concise (under 200 words).`,
      config: {
        temperature: 0.3,
      },
    });
    return response.text || "Security audit data currently unavailable.";
  } catch (error) {
    console.error("Gemini Insight Error:", error);
    return "Audit failed. Check network layer for LLM connectivity.";
  }
};