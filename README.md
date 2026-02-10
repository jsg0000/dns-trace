# DNS Route Visualizer

**DNS Route Visualizer** is an interactive network protocol visualization tool designed to demystify the complete journey of a web request. It provides a real-time, animated breakdown of how a domain name is resolved into an IP address, followed by the establishment of a secure connection.

Unlike standard traceroute tools, this application visualizes the full TCP/IP and Application layer stack, including the DNS recursion process, TCP 3-way handshake, and the modern TLS 1.3 key exchange. It is designed for educational purposes and security auditing, offering a "Master's Level" view of web infrastructure.

## Key Features

### 1. Interactive Route Topology
Visualizes the iterative DNS query process step-by-step:
- **Stub & Resolver**: Local cache and ISP recursion.
- **Root (.)**: The 13 global root server clusters.
- **TLD (.com, .org)**: Top-Level Domain registries.
- **Authoritative**: The final source of truth for the domain's IP.

### 2. Protocol Analyzer
A terminal-style log interface that displays simulated packet-level events as they occur:
- **DNS**: Recursive queries and UDP transmission.
- **TCP**: SYN -> SYN/ACK -> ACK handshake.
- **TLS 1.3**: ClientHello, ServerHello, Certificate Exchange, and Handshake Encryption.
- **HTTP/2**: Stream multiplexing and frame delivery.

### 3. AI-Powered Security Audit
Leverages Google's **Gemini** models (via Cloudflare Workers) to generate a real-time, technical security assessment of the target domain. The audit focuses on:
- Theoretical TLS Stack Analysis (Forward Secrecy, Cipher Suites).
- DNSSEC and Route Propagation resilience.
- Certificate Hierarchy validation.

### 4. Security Inspection
- **X.509 Certificate Chain**: Displays issuer details, validity periods, and encryption protocols (e.g., AES_256_GCM).
- **Header Hardening**: Analyzes response headers for security best practices (HSTS, CSP, X-Frame-Options).

## Technology Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Edge Computing**: Cloudflare Workers
- **AI Intelligence**: Google Gemini API (`gemini-3-flash-preview`)
- **Data Source**: DNS over HTTPS (DoH) via Cloudflare and Google

## Setup & Configuration

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Secrets**
   To enable the AI audit feature, you need a Google Gemini API key stored in your Cloudflare Worker secrets.
   ```bash
   npx wrangler secret put GEMINI_API_KEY
   ```

3. **Run Locally**
   ```bash
   npm start
   ```

4. **Deploy**
   ```bash
   npm run deploy
   ```
