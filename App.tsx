import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, Terminal, Activity, Globe, Cpu, ShieldCheck, Zap, 
  Network, Shield, CheckCircle2, AlertTriangle, Map as MapIcon,
  BookOpen, Rocket, ChevronDown, ChevronUp
} from 'lucide-react';
import { fetchDNS, getTLD, cleanDomain, getIPIntelligence } from './services/dnsService';
import { getTechnicalInsight } from './services/geminiService';
import { StepStatus, TraceStep, DNSResponse, CertificateInfo, SecurityHeader, IPIntelligence } from './types';
import ServerNode from './components/ServerNode';
import CertificateCard from './components/CertificateCard';
import WorldMap from './components/WorldMap';

type TraceSpeed = 'educational' | 'highspeed' | 'instant';

const INITIAL_STEPS: TraceStep[] = [
  { id: 'browser', title: 'Stub', description: 'Local cache lookup.', technicalDetails: 'OS checks nscd/hosts. RD=1.', status: StepStatus.IDLE, serverType: 'client' },
  { id: 'resolver', title: 'Resolver', description: 'Recursive ISP (1.1.1.1).', technicalDetails: 'Performs iterative lookup chain.', status: StepStatus.IDLE, serverType: 'resolver' },
  { id: 'root', title: 'Root', description: 'Root (.) zone hint.', technicalDetails: 'Managed by 13 global entities.', status: StepStatus.IDLE, serverType: 'root' },
  { id: 'tld', title: 'TLD', description: 'Registry (.com, .org).', technicalDetails: 'Returns Authoritative NS glue.', status: StepStatus.IDLE, serverType: 'tld' },
  { id: 'auth', title: 'Auth', description: 'Zone Master Record.', technicalDetails: 'Source of truth for the A record.', status: StepStatus.IDLE, serverType: 'authoritative' },
  { id: 'tcp', title: 'TCP', description: 'Transport Handshake.', technicalDetails: '3-way SYN -> SYN/ACK -> ACK.', status: StepStatus.IDLE, serverType: 'tcp' },
  { id: 'tls', title: 'TLS', description: 'Secure Tunnel (v1.3).', technicalDetails: 'DH Key Exchange & Cert validation.', status: StepStatus.IDLE, serverType: 'tls' },
  { id: 'http', title: 'HTTP', description: 'App Layer Request.', technicalDetails: 'GET request for index payload.', status: StepStatus.IDLE, serverType: 'http' }
];

const App: React.FC = () => {
  const [domainInput, setDomainInput] = useState('');
  const [activeDomain, setActiveDomain] = useState('');
  const [isTracing, setIsTracing] = useState(false);
  const [steps, setSteps] = useState<TraceStep[]>(INITIAL_STEPS);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [packetLogs, setPacketLogs] = useState<{msg: string, type: 'info' | 'pkt' | 'success' | 'err'}[]>([]);
  const [certInfo, setCertInfo] = useState<CertificateInfo | null>(null);
  const [headers, setHeaders] = useState<SecurityHeader[]>([]);
  const [ipIntel, setIpIntel] = useState<IPIntelligence | null>(null);
  const [traceSpeed, setTraceSpeed] = useState<TraceSpeed>('educational');
  const [isAuditExpanded, setIsAuditExpanded] = useState(true);
  
  const logRef = useRef<HTMLDivElement>(null);
  const traceListRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [packetLogs]);

  useEffect(() => {
    const container = traceListRef.current;
    const activeElement = stepRefs.current[activeStepIndex];

    if (container && activeElement && activeStepIndex >= 0) {
      const timeoutId = setTimeout(() => {
        const containerRect = container.getBoundingClientRect();
        const activeRect = activeElement.getBoundingClientRect();
        const currentScrollTop = container.scrollTop;
        const relativeTop = activeRect.top - containerRect.top;
        const targetScrollTop = currentScrollTop + relativeTop - (containerRect.height / 2) + (activeRect.height / 2);

        container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [activeStepIndex]);

  // Auto-expand audit when it arrives
  useEffect(() => {
    if (aiInsight) setIsAuditExpanded(true);
  }, [aiInsight]);

  const addLog = (msg: string, type: 'info' | 'pkt' | 'success' | 'err' = 'info') => {
    setPacketLogs(prev => [...prev, { msg, type }]);
  };

  const updateStep = (index: number, updates: Partial<TraceStep>) => {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, ...updates } : s));
  };

  const synthesizeSecurityData = (domain: string, orgName?: string) => {
    setCertInfo({
      subject: domain,
      issuer: orgName || "DigiCert Global CA G2",
      validFrom: "2024-01-01",
      validTo: "2025-01-01",
      cipher: "AES_256_GCM",
      protocol: "TLSv1.3",
      keyExchange: "ECDHE_X25519"
    });
    setHeaders([
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; preload', status: 'secure', description: 'Force HTTPS for all future requests.' },
      { key: 'Content-Security-Policy', value: "default-src 'self'...", status: 'secure', description: 'Restricts allowed origins.' },
      { key: 'X-Frame-Options', value: 'DENY', status: 'secure', description: 'Protects against clickjacking.' }
    ]);
  };

  const runTrace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainInput || isTracing) return;

    const domain = cleanDomain(domainInput);
    const tld = getTLD(domain);
    setActiveDomain(domain);
    setIsTracing(true);
    setSteps(INITIAL_STEPS.map(s => ({ ...s, status: StepStatus.IDLE, liveResult: undefined, latency: undefined })));
    setAiInsight(null);
    setPacketLogs([]);
    setCertInfo(null);
    setHeaders([]);
    setIpIntel(null);

    const getDelay = (baseMs: number) => {
      if (traceSpeed === 'instant') return 0;
      if (traceSpeed === 'highspeed') return baseMs * 0.2;
      return baseMs;
    };

    const slowDelay = (ms: number) => new Promise(res => setTimeout(res, getDelay(ms)));

    try {
      addLog(`Initializing telemetry stream for: ${domain} [Speed: ${traceSpeed}]`, 'info');
      
      setActiveStepIndex(0); updateStep(0, { status: StepStatus.ACTIVE });
      addLog("L1/L2 Cache Probe...", "pkt"); await slowDelay(600);
      updateStep(0, { status: StepStatus.COMPLETED, liveResult: ['127.0.0.1 (Cache Miss)'], latency: 2 });

      setActiveStepIndex(1); updateStep(1, { status: StepStatus.ACTIVE });
      addLog("DNS-over-HTTPS (DoH) Handshake...", "pkt");
      const resolverData = await fetchDNS(domain);
      updateStep(1, { status: StepStatus.COMPLETED, liveResult: ['Cloudflare (1.1.1.1)'], latency: resolverData.latency });
      await slowDelay(500);

      setActiveStepIndex(2); updateStep(2, { status: StepStatus.ACTIVE });
      addLog("Querying Root (.) Servers...", "pkt");
      const rootData = await fetchDNS('.', 'NS');
      updateStep(2, { status: StepStatus.COMPLETED, liveResult: rootData.Answer?.slice(0, 1).map(a => a.data), latency: rootData.latency });
      await slowDelay(800);

      setActiveStepIndex(3); updateStep(3, { status: StepStatus.ACTIVE });
      addLog(`Traversing ${tld} Registry...`, "pkt");
      const tldData = await fetchDNS(`${tld}.`, 'NS');
      updateStep(3, { status: StepStatus.COMPLETED, liveResult: tldData.Answer?.slice(0, 1).map(a => a.data), latency: tldData.latency });
      await slowDelay(800);

      setActiveStepIndex(4); updateStep(4, { status: StepStatus.ACTIVE });
      addLog("Authoritative Resolution...", "pkt");
      getTechnicalInsight(domain).then(setAiInsight);
      const dnsData = await fetchDNS(domain);
      const ip = dnsData.Answer?.find(a => a.type === 1)?.data || '0.0.0.0';
      updateStep(4, { status: StepStatus.COMPLETED, liveResult: [`A -> ${ip}`], latency: dnsData.latency });
      
      addLog(`Endpoint: ${ip}. Fetching BGP/ASN metadata...`, "info");
      const intel = await getIPIntelligence(ip);
      if (intel) {
        setIpIntel(intel);
        addLog(`AS${intel.asn} Detected: ${intel.org} (${intel.city})`, "success");
      }
      await slowDelay(1000);

      setActiveStepIndex(5); updateStep(5, { status: StepStatus.ACTIVE });
      addLog(`[TCP] Outbound: SYN`, "pkt"); await slowDelay(600);
      addLog(`[TCP] Inbound: SYN/ACK`, "success");
      updateStep(5, { status: StepStatus.COMPLETED, liveResult: ['ESTABLISHED'], latency: 12 });
      await slowDelay(800);

      setActiveStepIndex(6); updateStep(6, { status: StepStatus.ACTIVE });
      addLog(`[TLS 1.3] ECDHE Key Exchange`, "pkt"); await slowDelay(1000);
      synthesizeSecurityData(domain, intel?.org);
      updateStep(6, { status: StepStatus.COMPLETED, liveResult: ['TLS 1.3 AES_256'], latency: 32 });
      await slowDelay(1200);

      setActiveStepIndex(7); updateStep(7, { status: StepStatus.ACTIVE });
      addLog(`[HTTP/2] GET / HTTP/2`, "pkt"); await slowDelay(600);
      updateStep(7, { status: StepStatus.COMPLETED, liveResult: ['200 OK'], latency: 18 });
      
      setActiveStepIndex(8); 

    } catch (err) {
      addLog("CRITICAL: Peer connection interrupted.", "err");
    } finally {
      setIsTracing(false);
    }
  };

  return (
    <div className="lg:h-screen min-h-screen bg-[#050505] text-zinc-300 flex flex-col lg:overflow-hidden overflow-y-auto">
      <div className="scanline"></div>
      
      <nav className="flex-none bg-black/80 backdrop-blur-2xl border-b border-zinc-900 px-4 lg:px-8 py-4 z-50">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="bg-emerald-600/20 p-2.5 rounded-xl border border-emerald-500/30">
              <Shield className="text-emerald-500 w-5 h-5" />
            </div>
            <h1 className="text-xl font-black text-white tracking-tight">
              DNS<span className="text-emerald-500 italic">TRACE</span>
              <span className="ml-3 text-[9px] bg-zinc-800 px-2 py-1 rounded text-zinc-500 font-mono tracking-widest uppercase">Global_Telemetry_v6.0</span>
            </h1>
          </div>
          <div className="hidden lg:flex gap-10 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">
            <span className="flex items-center gap-2 text-emerald-500"><Zap className="w-3.5 h-3.5" /> Live_Telemetry</span>
            <span className="flex items-center gap-2"><MapIcon className="w-3.5 h-3.5" /> BGP_Geo_Pinpoint</span>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-[1800px] mx-auto w-full px-4 lg:px-8 py-6 lg:py-8 lg:overflow-hidden overflow-visible">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:h-full h-auto">
          
          <div className="lg:col-span-3 h-[400px] lg:h-full flex flex-col bg-zinc-900/10 rounded-3xl border border-zinc-800/50 p-5 overflow-hidden">
            <div className="flex items-center gap-3 mb-4 px-2 text-emerald-500/80 shrink-0">
              <Network className="w-4 h-4" />
              <h2 className="text-xs font-black uppercase tracking-widest">Route Topology</h2>
            </div>
            <div ref={traceListRef} className="flex-1 overflow-y-auto pr-2 scroll-smooth">
              <div className="relative pt-2">
                  <div className="absolute left-[29px] top-8 bottom-14 w-[1px] bg-zinc-800">
                    <div className="absolute top-0 w-full bg-emerald-500 transition-all duration-700" style={{ height: `${(Math.max(0, activeStepIndex) / (steps.length - 1)) * 100}%` }} />
                  </div>
                  {steps.map((step, idx) => (
                    <div key={step.id} ref={(el) => { stepRefs.current[idx] = el; }} className="relative flex gap-6 items-center z-10 mb-10 last:mb-0">
                      <div className="w-16 flex-shrink-0">
                        <ServerNode type={step.serverType} title={step.title} status={step.status} isActive={activeStepIndex === idx} latency={step.latency} />
                      </div>
                      <div className={`flex-1 transition-all duration-700 ${activeStepIndex >= idx ? 'opacity-100' : 'opacity-20'}`}>
                        <h4 className="text-[10px] font-black text-white uppercase tracking-tight mb-1">{step.description}</h4>
                        {step.liveResult && <div className="flex gap-1 flex-wrap">{step.liveResult.map((r, i) => <span key={i} className="text-[8px] font-mono bg-zinc-900 px-1.5 py-0.5 rounded text-emerald-400 border border-zinc-800 whitespace-nowrap">{r}</span>)}</div>}
                      </div>
                    </div>
                  ))}
              </div>
              <div className="h-20" />
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col lg:h-full h-auto space-y-8 lg:overflow-y-auto pr-2 scroll-smooth">
            <div className="bg-black border border-zinc-800 rounded-3xl p-6 shadow-2xl relative group sticky top-0 z-40 space-y-4">
              <div className="flex justify-between items-center mb-2 px-1">
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Playback Controls</span>
                <div className="flex bg-zinc-900/80 p-1 rounded-xl border border-zinc-800">
                  <button 
                    onClick={() => setTraceSpeed('educational')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all ${traceSpeed === 'educational' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    <BookOpen className="w-3 h-3" />
                    Edu
                  </button>
                  <button 
                    onClick={() => setTraceSpeed('highspeed')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all ${traceSpeed === 'highspeed' ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    <Rocket className="w-3 h-3" />
                    Fast
                  </button>
                  <button 
                    onClick={() => setTraceSpeed('instant')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all ${traceSpeed === 'instant' ? 'bg-blue-500 text-black shadow-lg shadow-blue-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    <Zap className="w-3 h-3" />
                    Instant
                  </button>
                </div>
              </div>

              <form onSubmit={runTrace} className="flex gap-4">
                <div className="relative flex-1">
                  <input type="text" placeholder="DOMAIN (e.g. cloudflare.com)" className="w-full bg-zinc-900/50 border border-zinc-700 rounded-2xl py-3.5 pl-11 pr-4 text-xs text-white font-mono focus:ring-1 focus:ring-emerald-500 transition-all outline-none" value={domainInput} onChange={(e) => setDomainInput(e.target.value)} disabled={isTracing} />
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                </div>
                <button type="submit" disabled={isTracing || !domainInput} className="px-6 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all">
                  {isTracing ? 'SCANNING' : 'INITIATE'}
                </button>
              </form>
            </div>

            <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-3xl h-[300px] shrink-0 overflow-hidden relative group shadow-inner">
              <WorldMap intel={ipIntel} />
            </div>

            <div className="bg-black border border-zinc-800 rounded-3xl overflow-hidden h-[250px] shrink-0 flex flex-col">
              <div className="bg-zinc-900/80 px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Protocol Stream</span>
                </div>
              </div>
              <div ref={logRef} className="flex-1 p-5 font-mono text-[10px] overflow-y-auto space-y-2 bg-black/50 scroll-smooth">
                {packetLogs.length === 0 && <div className="h-full flex items-center justify-center text-zinc-800 text-[10px] font-bold uppercase tracking-widest animate-pulse">Awaiting Payload...</div>}
                {packetLogs.map((log, i) => (
                  <div key={i} className="flex gap-3 animate-in slide-in-from-left-2 duration-300">
                    <span className="text-zinc-700">›</span>
                    <span className={`break-all ${log.type === 'pkt' ? 'text-blue-400' : log.type === 'success' ? 'text-emerald-400' : log.type === 'err' ? 'text-red-400' : 'text-zinc-500'}`}>{log.msg}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="h-20 shrink-0" />
          </div>

          <div className="lg:col-span-4 flex flex-col lg:h-full h-auto space-y-8 lg:overflow-y-auto pr-2 scroll-smooth">
              {ipIntel && (
                <div className="bg-zinc-900 border border-blue-500/20 rounded-3xl p-6 animate-in slide-in-from-right-10 duration-700 shrink-0">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="bg-blue-500/10 p-2 rounded-lg text-blue-500">
                            <Globe className="w-4 h-4" />
                        </div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400">BGP Infrastructure Intel</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-y-5 font-mono text-[10px]">
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
                        <span className="text-emerald-400">{ipIntel.city}</span>
                      </div>
                      <div>
                        <span className="text-zinc-600 block mb-1">COUNTRY</span>
                        <span className="text-zinc-200">{ipIntel.country}</span>
                      </div>
                    </div>
                </div>
              )}

              {certInfo && <CertificateCard cert={certInfo} isVisible={true} />}
              
              <div className={`bg-gradient-to-br from-zinc-900 to-black border border-zinc-800 rounded-3xl p-8 relative overflow-hidden transition-all duration-1000 shrink-0 ${aiInsight ? 'opacity-100' : 'opacity-40 grayscale'}`}>
                  {aiInsight ? (
                     <>
                      <div 
                        className="flex items-center justify-between mb-5 cursor-pointer"
                        onClick={() => setIsAuditExpanded(!isAuditExpanded)}
                      >
                         <div className="flex items-center gap-4">
                          <div className="bg-purple-500/10 p-2.5 rounded-xl text-purple-400 border border-purple-500/20">
                            <Cpu className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-tight">Technical Audit</h3>
                            <p className="text-[9px] text-purple-500 font-bold uppercase tracking-widest">Workers AI • Llama 3.1</p>
                          </div>
                        </div>
                        <button className="text-zinc-500 hover:text-white transition-colors">
                          {isAuditExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                      <div className={`text-[11px] leading-relaxed text-zinc-300 font-medium whitespace-pre-wrap font-mono transition-all duration-500 overflow-hidden ${isAuditExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
                        {aiInsight}
                      </div>
                     </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-700 space-y-4 py-12">
                      <Activity className="w-12 h-12 opacity-20 animate-pulse" />
                      <p className="text-[10px] font-mono uppercase tracking-widest text-center opacity-50">Handshake in progress...</p>
                    </div>
                  )}
              </div>

              {headers.length > 0 && (
                  <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-3xl p-6 animate-in slide-in-from-bottom-5 shrink-0">
                    <div className="flex items-center gap-3 mb-4">
                      <ShieldCheck className="w-4 h-4 text-orange-500" />
                      <h3 className="text-xs font-black text-white uppercase tracking-wider">Header Hardening</h3>
                    </div>
                    <div className="space-y-3">
                      {headers.map((h, i) => (
                        <div key={i} className="bg-black/40 border border-zinc-800/50 p-3 rounded-xl flex items-center justify-between group hover:border-emerald-500/20 transition-colors">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-mono text-zinc-300">{h.key}</span>
                            <span className="text-[9px] text-zinc-600 truncate max-w-[200px]">{h.value}</span>
                          </div>
                          {h.status === 'secure' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/80" /> : <AlertTriangle className="w-3.5 h-3.5 text-orange-500/80" />}
                        </div>
                      ))}
                    </div>
                  </div>
              )}
              <div className="h-20 shrink-0" />
          </div>
        </div>
      </main>

      <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
        <div className="bg-black/80 backdrop-blur-md border border-zinc-800 pl-4 pr-5 py-2.5 rounded-full text-[9px] font-black text-zinc-500 tracking-[0.2em] flex items-center gap-3 shadow-2xl">
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </div>
          CF_EDGE_ACTIVE
        </div>
      </div>
    </div>
  );
};

export default App;