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
 * ASNs that announce the same IP globally via anycast BGP.
 * Geolocation databases map these to registry addresses (often North America),
 * not the PoP that actually handles your TCP connection.
 */
const ANYCAST_ASNS = new Set([
  'AS13335',  // Cloudflare
  'AS209242', // Cloudflare R2 / Workers
  'AS54113',  // Fastly
  'AS20940',  // Akamai
  'AS16509',  // AWS CloudFront
  'AS15169',  // Google / GCP
  'AS8075',   // Microsoft Azure CDN
  'AS22822',  // Limelight
  'AS60068',  // CDN77
  'AS30148',  // Sucuri
  'AS19551',  // Incapsula / Imperva
]);

function isAnycastASN(asn: string): boolean {
  const match = asn.match(/AS\d+/i);
  return match ? ANYCAST_ASNS.has(match[0].toUpperCase()) : false;
}

/**
 * Look up BGP/geo metadata for an IP.
 * Primary:   ipapi.co  (~1k/day free tier)
 * Fallback:  ip-api.com (~2k/min free tier)
 */
export const getIPIntelligence = async (ip: string): Promise<IPIntelligence | null> => {
  // Primary: ipapi.co
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`);
    if (res.ok) {
      const d = await res.json();
      if (d.latitude && d.longitude && !d.error) {
        const asn = d.asn ?? 'AS0';
        return {
          ip: d.ip,
          org: d.org ?? d.isp ?? 'Unknown',
          asn,
          country: d.country_name ?? 'Unknown',
          city: d.city ?? 'Unknown',
          latitude: d.latitude,
          longitude: d.longitude,
          isAnycast: isAnycastASN(asn),
        };
      }
    }
  } catch {
    // fall through to backup
  }

  // Fallback: ip-api.com
  try {
    const res = await fetch(
      `https://ip-api.com/json/${ip}?fields=status,message,country,city,lat,lon,org,as`
    );
    if (res.ok) {
      const d = await res.json();
      if (d.status === 'success' && d.lat && d.lon) {
        const asn = d.as ?? 'AS0';
        return {
          ip,
          org: d.org ?? 'Unknown',
          asn,
          country: d.country ?? 'Unknown',
          city: d.city ?? 'Unknown',
          latitude: d.lat,
          longitude: d.lon,
          isAnycast: isAnycastASN(asn),
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
