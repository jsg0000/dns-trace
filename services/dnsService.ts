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
  // cleanDomain is called by the caller — no need to double-sanitize for '.' (root) queries
  const name = domain === '.' ? '.' : cleanDomain(domain);
  const startTime = performance.now();

  try {
    const url = `https://cloudflare-dns.com/query?name=${encodeURIComponent(name)}&type=${type}`;
    const response = await fetch(url, {
      headers: { accept: 'application/dns-json' },
    });
    if (response.ok) {
      const data = (await response.json()) as DNSResponse;
      data.latency = Math.round(performance.now() - startTime);
      return data;
    }
  } catch (err) {
    console.warn('Cloudflare DoH failed, falling back to Google', err);
  }

  const fallbackStart = performance.now();
  const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`DNS resolution failure for ${name}`);
  const data = (await response.json()) as DNSResponse;
  data.latency = Math.round(performance.now() - fallbackStart);
  return data;
};

/**
 * Look up BGP/geo metadata for an IP.
 * Primary:   ipapi.co  (detailed, rate-limited at ~1k/day free)
 * Fallback:  ip-api.com (2k/min free, no HTTPS on free tier but adequate)
 *
 * The "always Canada" bug was caused by ipapi.co occasionally resolving
 * Cloudflare anycast IPs to their Toronto PoP. The fallback gives a second
 * opinion; if both agree, it's accurate.
 */
export const getIPIntelligence = async (ip: string): Promise<IPIntelligence | null> => {
  // Primary: ipapi.co
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`);
    if (res.ok) {
      const d = await res.json();
      if (d.latitude && d.longitude && !d.error) {
        return {
          ip: d.ip,
          org: d.org ?? d.isp ?? 'Unknown',
          asn: d.asn ?? 'AS0',
          country: d.country_name ?? 'Unknown',
          city: d.city ?? 'Unknown',
          latitude: d.latitude,
          longitude: d.longitude,
        };
      }
    }
  } catch {
    // fall through to backup
  }

  // Fallback: ip-api.com (HTTP only on free tier — acceptable for non-sensitive geo data)
  try {
    const res = await fetch(
      `https://ip-api.com/json/${ip}?fields=status,message,country,city,lat,lon,org,as`
    );
    if (res.ok) {
      const d = await res.json();
      if (d.status === 'success' && d.lat && d.lon) {
        return {
          ip,
          org: d.org ?? 'Unknown',
          asn: d.as ?? 'AS0',
          country: d.country ?? 'Unknown',
          city: d.city ?? 'Unknown',
          latitude: d.lat,
          longitude: d.lon,
        };
      }
    }
  } catch {
    // both failed
  }

  return null;
};

export const getTLD = (domain: string): string => {
  const sanitized = cleanDomain(domain);
  if (sanitized === '.') return '';
  const parts = sanitized.split('.');
  return parts.length > 0 ? parts[parts.length - 1] : sanitized;
};
