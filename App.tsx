import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Search,
  Terminal,
  Activity,
  Globe,
  Cpu,
  ShieldCheck,
  Zap,
  Network,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Map as MapIcon,
  BookOpen,
  Rocket,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  fetchDNS,
  getTLD,
  cleanDomain,
  getIPIntelligence,
} from "./services/dnsService";
import { getTechnicalInsight } from "./services/geminiService";
import {
  StepStatus,
  TraceStep,
  CertificateInfo,
  SecurityHeader,
  IPIntelligence,
  RoutePoint,
} from "./types";
import ServerNode from "./components/ServerNode";
import CertificateCard from "./components/CertificateCard";
import WorldMap from "./components/WorldMap";
import MobileHopFeed from "./components/MobileHopFeed";

type TraceSpeed = "educational" | "highspeed" | "instant";

const INFRA_COORDS: Record<string, [number, number]> = {
  resolver: [37.773, -122.431],
  root: [38.895, -77.034],
  com: [38.93, -77.174],
  net: [38.93, -77.174],
  org: [38.894, -77.083],
  io: [51.507, -0.127],
  uk: [51.507, -0.127],
  eu: [52.374, 4.899],
  de: [50.11, 8.682],
  fr: [48.857, 2.352],
  pt: [38.717, -9.143],
  nl: [52.374, 4.899],
  au: [-33.868, 151.209],
  ca: [45.421, -75.69],
  jp: [35.689, 139.692],
  br: [-15.78, -47.929],
};

const LONDON: [number, number] = [51.507, -0.127];

const INITIAL_STEPS: TraceStep[] = [
  {
    id: "browser",
    title: "Stub",
    description: "Local cache lookup.",
    status: StepStatus.IDLE,
    serverType: "client",
  },
  {
    id: "resolver",
    title: "Resolver",
    description: "Recursive ISP (1.1.1.1).",
    status: StepStatus.IDLE,
    serverType: "resolver",
  },
  {
    id: "root",
    title: "Root",
    description: "Root (.) zone hint.",
    status: StepStatus.IDLE,
    serverType: "root",
  },
  {
    id: "tld",
    title: "TLD",
    description: "Registry (.com, .org).",
    status: StepStatus.IDLE,
    serverType: "tld",
  },
  {
    id: "auth",
    title: "Auth",
    description: "Zone Master Record.",
    status: StepStatus.IDLE,
    serverType: "authoritative",
  },
  {
    id: "tcp",
    title: "TCP",
    description: "Transport Handshake.",
    status: StepStatus.IDLE,
    serverType: "tcp",
  },
  {
    id: "tls",
    title: "TLS",
    description: "Secure Tunnel (v1.3).",
    status: StepStatus.IDLE,
    serverType: "tls",
  },
  {
    id: "http",
    title: "HTTP",
    description: "App Layer Request.",
    status: StepStatus.IDLE,
    serverType: "http",
  },
];

const App: React.FC = () => {
  const [domainInput, setDomainInput] = useState("");
  const [isTracing, setIsTracing] = useState(false);
  const [steps, setSteps] = useState<TraceStep[]>(INITIAL_STEPS);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [packetLogs, setPacketLogs] = useState<
    { msg: string; type: "info" | "pkt" | "success" | "err" }[]
  >([]);
  const [certInfo, setCertInfo] = useState<CertificateInfo | null>(null);
  const [headers, setHeaders] = useState<SecurityHeader[]>([]);
  const [ipIntel, setIpIntel] = useState<IPIntelligence | null>(null);
  const [traceSpeed, setTraceSpeed] = useState<TraceSpeed>("educational");
  const [isAuditExpanded, setIsAuditExpanded] = useState(true);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number]>(LONDON);

  const logRef = useRef<HTMLDivElement>(null);
  const traceListRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
      () => setUserLocation(LONDON),
      { timeout: 4000 },
    );
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [packetLogs]);

  useEffect(() => {
    const container = traceListRef.current;
    const el = stepRefs.current[activeStepIndex];
    if (!container || !el || activeStepIndex < 0) return;
    const id = setTimeout(() => {
      const cr = container.getBoundingClientRect();
      const ar = el.getBoundingClientRect();
      container.scrollTo({
        top:
          container.scrollTop + ar.top - cr.top - cr.height / 2 + ar.height / 2,
        behavior: "smooth",
      });
    }, 100);
    return () => clearTimeout(id);
  }, [activeStepIndex]);

  useEffect(() => {
    if (aiInsight) setIsAuditExpanded(true);
  }, [aiInsight]);

  const addLog = useCallback(
    (msg: string, type: "info" | "pkt" | "success" | "err" = "info") => {
      setPacketLogs((prev) => [...prev, { msg, type }]);
    },
    [],
  );

  const updateStep = useCallback(
    (index: number, updates: Partial<TraceStep>) => {
      setSteps((prev) =>
        prev.map((s, i) => (i === index ? { ...s, ...updates } : s)),
      );
    },
    [],
  );

  const setRoutePoint = useCallback(
    (
      stepIndex: number,
      label: string,
      lat: number,
      lng: number,
      status: StepStatus,
    ) => {
      setRoutePoints((prev) => {
        const next = [...prev];
        const existing = next.findIndex((p) => p.stepIndex === stepIndex);
        const point: RoutePoint = { stepIndex, label, lat, lng, status };
        if (existing >= 0) next[existing] = point;
        else next.push(point);
        next.sort((a, b) => a.stepIndex - b.stepIndex);
        return next;
      });
    },
    [],
  );

  const synthesizeSecurityData = useCallback(
    (domain: string, orgName?: string) => {
      setCertInfo({
        subject: domain,
        issuer: orgName || "DigiCert Global CA G2",
        validFrom: "2024-01-01",
        validTo: "2025-01-01",
        cipher: "AES_256_GCM",
        protocol: "TLSv1.3",
        keyExchange: "ECDHE_X25519",
      });
      setHeaders([
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; preload",
          status: "secure",
          description: "Force HTTPS.",
        },
        {
          key: "Content-Security-Policy",
          value: "default-src 'self'...",
          status: "secure",
          description: "Restricts origins.",
        },
        {
          key: "X-Frame-Options",
          value: "DENY",
          status: "secure",
          description: "Anti-clickjacking.",
        },
      ]);
    },
    [],
  );

  const runTrace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainInput || isTracing) return;
    const domain = cleanDomain(domainInput);
    const tld = getTLD(domain);
    setIsTracing(true);
    setSteps(
      INITIAL_STEPS.map((s) => ({
        ...s,
        status: StepStatus.IDLE,
        liveResult: undefined,
        latency: undefined,
      })),
    );
    setAiInsight(null);
    setPacketLogs([]);
    setCertInfo(null);
    setHeaders([]);
    setIpIntel(null);
    setRoutePoints([]);

    const delay = (ms: number) => {
      if (traceSpeed === "instant") return Promise.resolve();
      if (traceSpeed === "highspeed")
        return new Promise((r) => setTimeout(r, ms * 0.2));
      return new Promise((r) => setTimeout(r, ms));
    };

    try {
      addLog(`Initializing telemetry for: ${domain}`, "info");

      setActiveStepIndex(0);
      updateStep(0, { status: StepStatus.ACTIVE });
      setRoutePoint(
        0,
        "Stub (You)",
        userLocation[0],
        userLocation[1],
        StepStatus.ACTIVE,
      );
      addLog("L1/L2 Cache Probe…", "pkt");
      await delay(600);
      updateStep(0, {
        status: StepStatus.COMPLETED,
        liveResult: ["127.0.0.1 (Cache Miss)"],
        latency: 2,
      });
      setRoutePoint(
        0,
        "Stub (You)",
        userLocation[0],
        userLocation[1],
        StepStatus.COMPLETED,
      );

      setActiveStepIndex(1);
      updateStep(1, { status: StepStatus.ACTIVE });
      setRoutePoint(
        1,
        "Resolver (1.1.1.1)",
        INFRA_COORDS.resolver[0],
        INFRA_COORDS.resolver[1],
        StepStatus.ACTIVE,
      );
      addLog("DNS-over-HTTPS (DoH) Handshake…", "pkt");
      const resolverData = await fetchDNS(domain);
      updateStep(1, {
        status: StepStatus.COMPLETED,
        liveResult: ["Cloudflare (1.1.1.1)"],
        latency: resolverData.latency,
      });
      setRoutePoint(
        1,
        "Resolver (1.1.1.1)",
        INFRA_COORDS.resolver[0],
        INFRA_COORDS.resolver[1],
        StepStatus.COMPLETED,
      );
      await delay(500);

      setActiveStepIndex(2);
      updateStep(2, { status: StepStatus.ACTIVE });
      setRoutePoint(
        2,
        "Root (.)",
        INFRA_COORDS.root[0],
        INFRA_COORDS.root[1],
        StepStatus.ACTIVE,
      );
      addLog("Querying Root (.) Servers…", "pkt");
      const rootData = await fetchDNS(".", "NS");
      updateStep(2, {
        status: StepStatus.COMPLETED,
        liveResult: rootData.Answer?.slice(0, 1).map((a) => a.data),
        latency: rootData.latency,
      });
      setRoutePoint(
        2,
        "Root (.)",
        INFRA_COORDS.root[0],
        INFRA_COORDS.root[1],
        StepStatus.COMPLETED,
      );
      await delay(800);

      setActiveStepIndex(3);
      updateStep(3, { status: StepStatus.ACTIVE });
      const tldCoords = INFRA_COORDS[tld] ?? INFRA_COORDS.io;
      setRoutePoint(
        3,
        `TLD (.${tld})`,
        tldCoords[0],
        tldCoords[1],
        StepStatus.ACTIVE,
      );
      addLog(`Traversing .${tld} Registry…`, "pkt");
      const tldData = await fetchDNS(`${tld}.`, "NS");
      updateStep(3, {
        status: StepStatus.COMPLETED,
        liveResult: tldData.Answer?.slice(0, 1).map((a) => a.data),
        latency: tldData.latency,
      });
      setRoutePoint(
        3,
        `TLD (.${tld})`,
        tldCoords[0],
        tldCoords[1],
        StepStatus.COMPLETED,
      );
      await delay(800);

      setActiveStepIndex(4);
      updateStep(4, { status: StepStatus.ACTIVE });
      setRoutePoint(
        4,
        "Auth NS",
        tldCoords[0],
        tldCoords[1],
        StepStatus.ACTIVE,
      );
      addLog("Authoritative Resolution…", "pkt");
      getTechnicalInsight(domain).then(setAiInsight);
      const dnsData = await fetchDNS(domain);
      const ip = dnsData.Answer?.find((a) => a.type === 1)?.data ?? "0.0.0.0";
      updateStep(4, {
        status: StepStatus.COMPLETED,
        liveResult: [`A → ${ip}`],
        latency: dnsData.latency,
      });
      addLog(`Endpoint: ${ip}. Fetching BGP/ASN metadata…`, "info");
      const intel = await getIPIntelligence(ip);
      if (intel) {
        setIpIntel(intel);
        addLog(
          intel.isAnycast
            ? `AS${intel.asn} → Anycast CDN. Nearest PoP: your location.`
            : `AS${intel.asn}: ${intel.org} (${intel.city})`,
          "success",
        );
        const authLat = intel.isAnycast ? userLocation[0] : intel.latitude;
        const authLng = intel.isAnycast ? userLocation[1] : intel.longitude;
        setRoutePoint(
          4,
          intel.isAnycast
            ? "Auth NS · Anycast (near you)"
            : `Auth NS (${intel.city})`,
          authLat,
          authLng,
          StepStatus.COMPLETED,
        );
      } else {
        setRoutePoint(
          4,
          "Auth NS",
          tldCoords[0],
          tldCoords[1],
          StepStatus.COMPLETED,
        );
      }
      await delay(1000);

      const targetLat =
        (intel?.isAnycast ? userLocation[0] : intel?.latitude) ?? tldCoords[0];
      const targetLng =
        (intel?.isAnycast ? userLocation[1] : intel?.longitude) ?? tldCoords[1];

      setActiveStepIndex(5);
      updateStep(5, { status: StepStatus.ACTIVE });
      setRoutePoint(5, "TCP Connect", targetLat, targetLng, StepStatus.ACTIVE);
      addLog("[TCP] Outbound: SYN", "pkt");
      await delay(600);
      addLog("[TCP] Inbound: SYN/ACK", "success");
      updateStep(5, {
        status: StepStatus.COMPLETED,
        liveResult: ["ESTABLISHED"],
        latency: 12,
      });
      setRoutePoint(
        5,
        "TCP Connect",
        targetLat,
        targetLng,
        StepStatus.COMPLETED,
      );
      await delay(800);

      setActiveStepIndex(6);
      updateStep(6, { status: StepStatus.ACTIVE });
      setRoutePoint(6, "TLS 1.3", targetLat, targetLng, StepStatus.ACTIVE);
      addLog("[TLS 1.3] ECDHE Key Exchange", "pkt");
      await delay(1000);
      synthesizeSecurityData(domain, intel?.org);
      updateStep(6, {
        status: StepStatus.COMPLETED,
        liveResult: ["TLS 1.3 AES_256"],
        latency: 32,
      });
      setRoutePoint(6, "TLS 1.3", targetLat, targetLng, StepStatus.COMPLETED);
      await delay(1200);

      setActiveStepIndex(7);
      updateStep(7, { status: StepStatus.ACTIVE });
      setRoutePoint(
        7,
        `${domain} (200 OK)`,
        targetLat,
        targetLng,
        StepStatus.ACTIVE,
      );
      addLog("[HTTP/2] GET / HTTP/2", "pkt");
      await delay(600);
      updateStep(7, {
        status: StepStatus.COMPLETED,
        liveResult: ["200 OK"],
        latency: 18,
      });
      setRoutePoint(
        7,
        `${domain} (200 OK)`,
        targetLat,
        targetLng,
        StepStatus.COMPLETED,
      );
      setActiveStepIndex(8);
    } catch {
      addLog("CRITICAL: Peer connection interrupted.", "err");
    } finally {
      setIsTracing(false);
    }
  };

  // ─── Shared sub-components ────────────────────────────────────────────────

  const SearchBar = (
    <div className="bg-black border border-zinc-800 rounded-3xl p-4 lg:p-6 shadow-2xl space-y-3 lg:space-y-4">
      <div className="flex justify-between items-center px-1">
        <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">
          Playback Controls
        </span>
        <div className="flex bg-zinc-900/80 p-1 rounded-xl border border-zinc-800">
          {(["educational", "highspeed", "instant"] as TraceSpeed[]).map(
            (speed) => {
              const cfg = {
                educational: {
                  label: "Edu",
                  Icon: BookOpen,
                  active: "bg-emerald-500",
                },
                highspeed: {
                  label: "Fast",
                  Icon: Rocket,
                  active: "bg-orange-500",
                },
                instant: { label: "Instant", Icon: Zap, active: "bg-blue-500" },
              }[speed];
              return (
                <button
                  key={speed}
                  onClick={() => setTraceSpeed(speed)}
                  className={`flex items-center gap-1.5 px-2 lg:px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all ${traceSpeed === speed ? `${cfg.active} text-black shadow-lg` : "text-zinc-500 hover:text-zinc-300"}`}
                >
                  <cfg.Icon className="w-3 h-3" />
                  {cfg.label}
                </button>
              );
            },
          )}
        </div>
      </div>
      <form onSubmit={runTrace} className="flex gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="DOMAIN (e.g. cloudflare.com)"
            className="w-full bg-zinc-900/50 border border-zinc-700 rounded-2xl py-3.5 pl-11 pr-4 text-xs text-white font-mono focus:ring-1 focus:ring-emerald-500 transition-all outline-none"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            disabled={isTracing}
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        </div>
        <button
          type="submit"
          disabled={isTracing || !domainInput}
          className="px-5 lg:px-6 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all"
        >
          {isTracing ? "SCANNING" : "INITIATE"}
        </button>
      </form>
    </div>
  );

  const MapPanel = (
    <div
      className="bg-zinc-900/20 border border-zinc-800/80 rounded-3xl overflow-hidden relative shadow-inner"
      style={{ height: "260px" }}
    >
      <WorldMap routePoints={routePoints} userLocation={userLocation} />
    </div>
  );

  const BGPIntelPanel = ipIntel ? (
    <div className="bg-zinc-900 border border-blue-500/20 rounded-3xl p-5 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-blue-500/10 p-2 rounded-lg text-blue-500">
          <Globe className="w-4 h-4" />
        </div>
        <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400">
          BGP Infrastructure Intel
        </h4>
      </div>
      <div className="grid grid-cols-2 gap-y-4 font-mono text-[10px]">
        <div>
          <span className="text-zinc-600 block mb-1">PROVIDER</span>
          <span className="text-zinc-200">{ipIntel.org}</span>
        </div>
        <div>
          <span className="text-zinc-600 block mb-1">AS_PATH</span>
          <span className="text-zinc-200">AS{ipIntel.asn}</span>
        </div>
        <div>
          <span className="text-zinc-600 block mb-1">GEO_CITY</span>
          <span className="text-emerald-400">
            {ipIntel.isAnycast ? "Anycast — nearest PoP" : ipIntel.city}
          </span>
        </div>
        <div>
          <span className="text-zinc-600 block mb-1">COUNTRY</span>
          <span className="text-zinc-200">
            {ipIntel.isAnycast ? "Global" : ipIntel.country}
          </span>
        </div>
        {ipIntel.isAnycast && (
          <div className="col-span-2 mt-1 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2">
            <p className="text-[9px] font-mono text-orange-400 leading-relaxed">
              <span className="font-black">ANYCAST DETECTED</span> — This IP is
              announced globally from 300+ PoPs. Map shows your nearest PoP.
            </p>
          </div>
        )}
      </div>
    </div>
  ) : null;

  const AuditPanel = (
    <div
      className={`bg-gradient-to-br from-zinc-900 to-black border border-zinc-800 rounded-3xl p-6 lg:p-8 relative overflow-hidden transition-all duration-1000 ${aiInsight ? "opacity-100" : "opacity-40 grayscale"}`}
    >
      {aiInsight ? (
        <>
          <div
            className="flex items-center justify-between mb-4 cursor-pointer"
            onClick={() => setIsAuditExpanded((v) => !v)}
          >
            <div className="flex items-center gap-3 lg:gap-4">
              <div className="bg-purple-500/10 p-2.5 rounded-xl text-purple-400 border border-purple-500/20">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-tight">
                  Technical Audit
                </h3>
                <p className="text-[9px] text-purple-500 font-bold uppercase tracking-widest">
                  Workers AI • Llama 3.1
                </p>
              </div>
            </div>
            <button className="text-zinc-500 hover:text-white transition-colors">
              {isAuditExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
          <div
            className={`text-[11px] leading-relaxed text-zinc-300 font-medium whitespace-pre-wrap font-mono transition-all duration-500 overflow-hidden ${isAuditExpanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"}`}
          >
            {aiInsight}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center text-zinc-700 space-y-4 py-10">
          <Activity className="w-10 h-10 opacity-20 animate-pulse" />
          <p className="text-[10px] font-mono uppercase tracking-widest text-center opacity-50">
            Handshake in progress…
          </p>
        </div>
      )}
    </div>
  );

  const HeadersPanel =
    headers.length > 0 ? (
      <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-3xl p-5 animate-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center gap-3 mb-4">
          <ShieldCheck className="w-4 h-4 text-orange-500" />
          <h3 className="text-xs font-black text-white uppercase tracking-wider">
            Header Hardening
          </h3>
        </div>
        <div className="space-y-2">
          {headers.map((h, i) => (
            <div
              key={i}
              className="bg-black/40 border border-zinc-800/50 p-3 rounded-xl flex items-center justify-between hover:border-emerald-500/20 transition-colors"
            >
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-mono text-zinc-300">
                  {h.key}
                </span>
                <span className="text-[9px] text-zinc-600 truncate max-w-[200px]">
                  {h.value}
                </span>
              </div>
              {h.status === "secure" ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/80 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-orange-500/80 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>
    ) : null;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 flex flex-col">
      <div className="scanline" />

      {/* Nav */}
      <nav className="flex-none bg-black/80 backdrop-blur-2xl border-b border-zinc-900 px-4 lg:px-8 py-4 z-50 sticky top-0">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 lg:gap-5">
            <div className="bg-emerald-600/20 p-2 lg:p-2.5 rounded-xl border border-emerald-500/30">
              <Shield className="text-emerald-500 w-4 h-4 lg:w-5 lg:h-5" />
            </div>
            <h1 className="text-lg lg:text-xl font-black text-white tracking-tight">
              DNS<span className="text-emerald-500 italic">TRACE</span>
              <span className="hidden sm:inline ml-3 text-[9px] bg-zinc-800 px-2 py-1 rounded text-zinc-500 font-mono tracking-widest uppercase">
                Global_Telemetry_v6.0
              </span>
            </h1>
          </div>
          <div className="hidden lg:flex gap-10 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">
            <span className="flex items-center gap-2 text-emerald-500">
              <Zap className="w-3.5 h-3.5" /> Live_Telemetry
            </span>
            <span className="flex items-center gap-2">
              <MapIcon className="w-3.5 h-3.5" /> BGP_Geo_Pinpoint
            </span>
          </div>
        </div>
      </nav>

      {/* ══════════════════════════════════════════════════════
          MOBILE LAYOUT  (hidden on lg+)
          Order: Search → Map → Hop Feed → Intel Cards
      ══════════════════════════════════════════════════════ */}
      <div className="lg:hidden flex flex-col gap-4 px-4 pt-5 pb-32">
        {/* 1. Search + speed controls */}
        {SearchBar}

        {/* 2. Live map — always visible, updates as hops fire */}
        {MapPanel}

        {/* 3. Hop feed — each step card slides in as it activates */}
        {activeStepIndex >= 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-2 mb-2">
              <Network className="w-3.5 h-3.5 text-emerald-500/70" />
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500/70">
                Route Topology
              </span>
              {isTracing && (
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-orange-500 animate-ping ml-1" />
              )}
            </div>
            <MobileHopFeed steps={steps} activeStepIndex={activeStepIndex} />
          </div>
        )}

        {/* 4. BGP / ASN intel — appears when auth step resolves */}
        {BGPIntelPanel}

        {/* 5. X.509 cert */}
        {certInfo && <CertificateCard cert={certInfo} isVisible />}

        {/* 6. AI Audit */}
        {AuditPanel}

        {/* 7. Security headers */}
        {HeadersPanel}

        {/* 8. Protocol stream — at the bottom for nerds */}
        <div
          className="bg-black border border-zinc-800 rounded-3xl overflow-hidden flex flex-col"
          style={{ height: "200px" }}
        >
          <div className="bg-zinc-900/80 px-4 py-2.5 border-b border-zinc-800 flex items-center gap-2 shrink-0">
            <Terminal className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">
              Protocol Stream
            </span>
          </div>
          <div
            ref={logRef}
            className="flex-1 p-4 font-mono text-[10px] overflow-y-auto space-y-1.5 bg-black/50"
          >
            {packetLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-800 text-[10px] font-bold uppercase tracking-widest animate-pulse">
                Awaiting Payload…
              </div>
            ) : (
              packetLogs.map((log, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-zinc-700 flex-shrink-0">›</span>
                  <span
                    className={`break-all ${log.type === "pkt" ? "text-blue-400" : log.type === "success" ? "text-emerald-400" : log.type === "err" ? "text-red-400" : "text-zinc-500"}`}
                  >
                    {log.msg}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          DESKTOP LAYOUT  (hidden below lg)
          Original 3-column grid — unchanged
      ══════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex lg:flex-1 lg:overflow-hidden">
        <main className="flex-1 max-w-[1800px] mx-auto w-full px-8 py-8 overflow-hidden">
          <div className="grid grid-cols-12 gap-8 h-full">
            {/* Col 1: Route topology */}
            <div className="col-span-3 h-full flex flex-col bg-zinc-900/10 rounded-3xl border border-zinc-800/50 p-5 overflow-hidden">
              <div className="flex items-center gap-3 mb-4 px-2 text-emerald-500/80 shrink-0">
                <Network className="w-4 h-4" />
                <h2 className="text-xs font-black uppercase tracking-widest">
                  Route Topology
                </h2>
              </div>
              <div
                ref={traceListRef}
                className="flex-1 overflow-y-auto pr-2 scroll-smooth"
              >
                <div className="relative pt-2">
                  <div className="absolute left-[29px] top-8 bottom-14 w-[1px] bg-zinc-800">
                    <div
                      className="absolute top-0 w-full bg-emerald-500 transition-all duration-700"
                      style={{
                        height: `${(Math.max(0, activeStepIndex) / (steps.length - 1)) * 100}%`,
                      }}
                    />
                  </div>
                  {steps.map((step, idx) => (
                    <div
                      key={step.id}
                      ref={(el) => {
                        stepRefs.current[idx] = el;
                      }}
                      className="relative flex gap-6 items-center z-10 mb-10 last:mb-0"
                    >
                      <div className="w-16 flex-shrink-0">
                        <ServerNode
                          type={step.serverType}
                          title={step.title}
                          status={step.status}
                          isActive={activeStepIndex === idx}
                          latency={step.latency}
                        />
                      </div>
                      <div
                        className={`flex-1 transition-all duration-700 ${activeStepIndex >= idx ? "opacity-100" : "opacity-20"}`}
                      >
                        <h4 className="text-[10px] font-black text-white uppercase tracking-tight mb-1">
                          {step.description}
                        </h4>
                        {step.liveResult && (
                          <div className="flex gap-1 flex-wrap">
                            {step.liveResult.map((r, i) => (
                              <span
                                key={i}
                                className="text-[8px] font-mono bg-zinc-900 px-1.5 py-0.5 rounded text-emerald-400 border border-zinc-800 whitespace-nowrap"
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="h-20" />
              </div>
            </div>

            {/* Col 2: Search + Map + Packet log */}
            <div className="col-span-5 flex flex-col h-full space-y-8 overflow-y-auto pr-2 scroll-smooth">
              <div className="sticky top-0 z-40">{SearchBar}</div>
              <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-3xl h-[300px] shrink-0 overflow-hidden relative shadow-inner">
                <WorldMap
                  routePoints={routePoints}
                  userLocation={userLocation}
                />
              </div>
              <div className="bg-black border border-zinc-800 rounded-3xl overflow-hidden h-[250px] shrink-0 flex flex-col">
                <div className="bg-zinc-900/80 px-5 py-3 border-b border-zinc-800 flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">
                    Protocol Stream
                  </span>
                </div>
                <div
                  ref={logRef}
                  className="flex-1 p-5 font-mono text-[10px] overflow-y-auto space-y-2 bg-black/50 scroll-smooth"
                >
                  {packetLogs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-zinc-800 text-[10px] font-bold uppercase tracking-widest animate-pulse">
                      Awaiting Payload…
                    </div>
                  ) : (
                    packetLogs.map((log, i) => (
                      <div
                        key={i}
                        className="flex gap-3 animate-in slide-in-from-left-2 duration-300"
                      >
                        <span className="text-zinc-700">›</span>
                        <span
                          className={`break-all ${log.type === "pkt" ? "text-blue-400" : log.type === "success" ? "text-emerald-400" : log.type === "err" ? "text-red-400" : "text-zinc-500"}`}
                        >
                          {log.msg}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="h-20 shrink-0" />
            </div>

            {/* Col 3: BGP Intel + Cert + Audit + Headers */}
            <div className="col-span-4 flex flex-col h-full space-y-8 overflow-y-auto pr-2 scroll-smooth">
              {BGPIntelPanel}
              {certInfo && <CertificateCard cert={certInfo} isVisible />}
              {AuditPanel}
              {HeadersPanel}
              <div className="h-20 shrink-0" />
            </div>
          </div>
        </main>
      </div>

      {/* Status pill */}
      <div className="fixed bottom-6 right-4 lg:right-6 z-50 pointer-events-none">
        <div className="bg-black/80 backdrop-blur-md border border-zinc-800 pl-3 pr-4 py-2 lg:pl-4 lg:pr-5 lg:py-2.5 rounded-full text-[9px] font-black text-zinc-500 tracking-[0.2em] flex items-center gap-2 lg:gap-3 shadow-2xl">
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </div>
          CF_EDGE_ACTIVE
        </div>
      </div>
    </div>
  );
};

export default App;
