export interface DNSRecord {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

export interface DNSResponse {
  Status: number;
  TC: boolean;
  RD: boolean;
  RA: boolean;
  AD: boolean;
  CD: boolean;
  Question: { name: string; type: number }[];
  Answer?: DNSRecord[];
  Authority?: DNSRecord[];
  Additional?: DNSRecord[];
  latency?: number; 
}

export interface IPIntelligence {
  ip: string;
  org: string;
  asn: string;
  country: string;
  city: string;
  latitude: number;
  longitude: number;
}

export interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  cipher: string;
  protocol: string;
  keyExchange: string;
}

export interface SecurityHeader {
  key: string;
  value: string;
  status: 'secure' | 'warning' | 'missing';
  description: string;
}

export enum StepStatus {
  IDLE = 'IDLE',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export type ServerType = 'client' | 'resolver' | 'root' | 'tld' | 'authoritative' | 'tcp' | 'tls' | 'http';

export interface TraceStep {
  id: string;
  title: string;
  description: string;
  technicalDetails: string;
  status: StepStatus;
  serverType: ServerType;
  liveResult?: string[]; 
  latency?: number;
}

export const RECORD_TYPES: Record<number, string> = {
  1: 'A',
  2: 'NS',
  5: 'CNAME',
  6: 'SOA',
  15: 'MX',
  16: 'TXT',
  28: 'AAAA'
};