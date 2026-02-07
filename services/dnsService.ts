import { DNSResponse } from '../types';

export const cleanDomain = (input: string): string => {
  let domain = input.trim().toLowerCase();
  // Remove protocol
  domain = domain.replace(/^(https?:\/\/)/, '');
  // Remove paths, queries, and fragments
  domain = domain.split(/[/?#]/)[0];
  return domain;
};

export const fetchDNS = async (domain: string, type: string = 'A'): Promise<DNSResponse> => {
  const sanitized = cleanDomain(domain);
  const url = `https://cloudflare-dns.com/query?name=${encodeURIComponent(sanitized)}&type=${type}`;
  const response = await fetch(url, {
    headers: {
      'accept': 'application/dns-json'
    }
  });

  if (!response.ok) {
    throw new Error('Upstream DoH error');
  }

  return await response.json();
};

export const getTLD = (domain: string): string => {
  const sanitized = cleanDomain(domain);
  const parts = sanitized.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
};

export const getDomainRoot = (domain: string): string => {
    const sanitized = cleanDomain(domain);
    const parts = sanitized.split('.');
    if (parts.length <= 2) return sanitized;
    return parts.slice(-2).join('.');
};