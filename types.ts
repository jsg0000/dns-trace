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
  /**
   * True when the IP belongs to a known anycast CDN/network.
   * Geolocation for anycast IPs reflects the registry address, not the
   * actual PoP your TCP connection reaches — callers should use the
   * user's location as the terminal map node instead.
   */
  isAnycast: boolean;
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
  status: StepStatus;
  serverType: ServerType;
  liveResult?: string[];
  latency?: number;
}

// Represents a geolocation point in the live route trace on the map
export interface RoutePoint {
  stepIndex: number;
  label: string;
  lat: number;
  lng: number;
  status: StepStatus;
}
