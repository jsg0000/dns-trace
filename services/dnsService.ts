import { DNSResponse, IPIntelligence } from '../types';

export const cleanDomain = (input: string): string => {
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^(https?:\/\/)/, '');
  domain = domain.split(/[/?#]/)[0];
  if (domain.length > 1 && domain.endsWith('.')) {
    domain = domain.slice(0, -1);
  }
  return domain;
};

export const fetchDNS = async (domain: string, type: string = 'A'): Promise<DNSResponse> => {
  const sanitized = cleanDomain(domain);
  const startTime = performance.now();
  
  try {
    const url = `https://cloudflare-dns.com/query?name=${encodeURIComponent(sanitized)}&type=${type}`;
    const response = await fetch(url, {
      headers: { 'accept': 'application/dns-json' }
    });

    if (response.ok) {
      const data = await response.json() as DNSResponse;
      data.latency = Math.round(performance.now() - startTime);
      return data;
    }
  } catch (err) {
    console.warn('Primary DoH failed', err);
  }

  const fallbackStart = performance.now();
  const url = `https://dns.google/resolve?name=${encodeURIComponent(sanitized)}&type=${type}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`DNS failure`);
  const data = await response.json() as DNSResponse;
  data.latency = Math.round(performance.now() - fallbackStart);
  return data;
};

export const getIPIntelligence = async (ip: string): Promise<IPIntelligence | null> => {
  try {
    // Note: ipapi.co has rate limits for free tier, handle gracefully
    const response = await fetch(`https://ipapi.co/${ip}/json/`);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      ip: data.ip,
      org: data.org,
      asn: data.asn,
      country: data.country_name,
      city: data.city,
      latitude: data.latitude,
      longitude: data.longitude
    };
  } catch (e) {
    return null;
  }
};

export const getTLD = (domain: string): string => {
  const sanitized = cleanDomain(domain);
  if (sanitized === '.') return '';
  const parts = sanitized.split('.');
  return parts.length > 0 ? parts[parts.length - 1] : sanitized;
};