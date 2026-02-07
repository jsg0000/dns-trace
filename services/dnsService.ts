
import { DNSResponse } from '../types';

export const cleanDomain = (input: string): string => {
  let domain = input.trim().toLowerCase();
  // Remove protocol
  domain = domain.replace(/^(https?:\/\/)/, '');
  // Remove paths, queries, and fragments
  domain = domain.split(/[/?#]/)[0];
  // Remove trailing dot if present to normalize (except for root query)
  if (domain.length > 1 && domain.endsWith('.')) {
    domain = domain.slice(0, -1);
  }
  return domain;
};

export const fetchDNS = async (domain: string, type: string = 'A'): Promise<DNSResponse> => {
  const sanitized = cleanDomain(domain);
  
  // Strategy 1: Cloudflare DoH (Primary)
  try {
    const url = `https://cloudflare-dns.com/query?name=${encodeURIComponent(sanitized)}&type=${type}`;
    const response = await fetch(url, {
      headers: {
        'accept': 'application/dns-json'
      }
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.warn('Cloudflare DoH failed, failing over to Google DNS', err);
  }

  // Strategy 2: Google Public DNS (Fallback)
  try {
    const url = `https://dns.google/resolve?name=${encodeURIComponent(sanitized)}&type=${type}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Google DoH error: ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    console.error('All DNS resolvers failed', err);
    throw new Error('Failed to resolve DNS via Cloudflare or Google');
  }
};

export const getTLD = (domain: string): string => {
  const sanitized = cleanDomain(domain);
  if (sanitized === '.') return '';
  const parts = sanitized.split('.');
  // If domain is "example.com", return "com"
  // If domain is "com", return "com"
  return parts.length > 0 ? parts[parts.length - 1] : sanitized;
};

export const getDomainRoot = (domain: string): string => {
    const sanitized = cleanDomain(domain);
    const parts = sanitized.split('.');
    if (parts.length <= 2) return sanitized;
    return parts.slice(-2).join('.');
};
