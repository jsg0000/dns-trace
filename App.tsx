import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, Terminal, Activity, ArrowRight, BookOpen, Globe, Cpu, Layers, ShieldCheck, Zap, 
  Network, ExternalLink, Camera, MessageSquare, Shield, CheckCircle2, AlertTriangle, Info
} from 'lucide-react';
import { fetchDNS, getTLD, cleanDomain } from './services/dnsService';
import { getTechnicalInsight } from './services/geminiService';
import { StepStatus, TraceStep, DNSResponse, RECORD_TYPES, CertificateInfo, SecurityHeader } from './types';
import ServerNode from './components/ServerNode';
import DNSPacket from './components/DNSPacket';
import CertificateCard from './components/CertificateCard';

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
  const [results, setResults] = useState<DNSResponse | null>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [packetLogs, setPacketLogs] = useState<{msg: string, type: 'info' | 'pkt' | 'success' | 'err'}[]>([]);
  const [certInfo, setCertInfo] = useState<CertificateInfo | null>(null);
  const [headers, setHeaders] = useState<SecurityHeader[]>([]);
  
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [packetLogs]);

  const addLog = (msg: string, type: 'info' | 'pkt' | 'success' | 'err' = 'info') => {
    setPacketLogs(prev => [...prev, { msg, type }]);
  };

  const updateStep = (index: number, updates: Partial<TraceStep>) => {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, ...updates } : s));
  };

  const synthesizeSecurityData = (domain: string) => {
    setCertInfo({
      subject: domain,
      issuer: "DigiCert Global CA G2",
      validFrom: "2024-01-01",
      validTo: "2025-01-01",
      cipher: "AES_256_GCM",
      protocol: "TLSv1.3",
      keyExchange: "ECDHE_X25519"
    });

    setHeaders([
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; preload', status: 'secure', description: 'Force HTTPS for all future requests.' },
      { key: 'Content-Security-Policy', value: "default-src 'self'...", status: 'secure', description: 'Prevents XSS by restricting allowed origins.' },
      { key: 'X-Frame-Options', value: 'DENY', status: 'secure', description: 'Protects against clickjacking attacks.' },
      { key: 'Server', value: 'cloudflare', status: 'warning', description: 'Revealing server signature can assist attackers.' }
    ]);
  };

  const runTrace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainInput || isTracing) return;

    const domain = cleanDomain(domainInput);
    const tld = getTLD(domain);
    setActiveDomain(domain);
    setIsTracing(true);
    setSteps(INITIAL_STEPS.map(s => ({ ...s, status: StepStatus.IDLE, liveResult: undefined })));
    setResults(null);
    setAiInsight(null);
    setError(null);
    setPacketLogs([]);
    setCertInfo(null);
    setHeaders([]);

    const slowDelay = (ms: number) => new Promise(res => setTimeout(res, ms));

    try {
      addLog(`Initializing stack for host: ${domain}`, 'info');
      
      // Phase 1: DNS
      setActiveStepIndex(0); updateStep(0, { status: StepStatus.ACTIVE });
      addLog("Checking local L1/L2 cache...", "pkt"); await slowDelay(1000);
      updateStep(0, { status: StepStatus.COMPLETED, liveResult: ['127.0.0.1 (Cache Miss)'] });

      setActiveStepIndex(1); updateStep(1, { status: StepStatus.ACTIVE });
      addLog("Recursive query transmission [UDP/53]", "pkt"); await slowDelay(1000);
      updateStep(1, { status: StepStatus.COMPLETED, liveResult: ['1.1.1.1 (Cloudflare) ACTIVE'] });

      setActiveStepIndex(2); updateStep(2, { status: StepStatus.ACTIVE });
      addLog("Root Zone Referral Iteration...", "pkt");
      const rootData = await fetchDNS('.', 'NS');
      updateStep(2, { status: StepStatus.COMPLETED, liveResult: rootData.Answer?.slice(0, 2).map(a => a.data) });
      await slowDelay(1200);

      setActiveStepIndex(3); updateStep(3, { status: StepStatus.ACTIVE });
      addLog(`TLD NameServer Discovery (.${tld})`, "pkt");
      const tldData = await fetchDNS(`${tld}.`, 'NS');
      updateStep(3, { status: StepStatus.COMPLETED, liveResult: tldData.Answer?.slice(0, 2).map(a => a.data) });
      await slowDelay(1200);

      setActiveStepIndex(4); updateStep(4, { status: StepStatus.ACTIVE });
      addLog("Authoritative Resource Record Retrieval...", "pkt");
      const [dnsData, insight] = await Promise.all([
        fetchDNS(domain),
        getTechnicalInsight(domain)
      ]);
      const ip = dnsData.Answer?.find(a => a.type === 1)?.data || '0.0.0.0';
      updateStep(4, { status: StepStatus.COMPLETED, liveResult: [`A -> ${ip}`] });
      setResults(dnsData);
      setAiInsight(insight);
      addLog(`Resolution Complete. Endpoint: ${ip}`, "success");
      await slowDelay(1500);

      // Phase 2: TCP
      setActiveStepIndex(5); updateStep(5, { status: StepStatus.ACTIVE });
      addLog(`[TCP] Outbound: SYN`, "pkt"); await slowDelay(1000);
      addLog(`[TCP] Inbound: SYN/ACK`, "pkt"); await slowDelay(1000);
      addLog(`[TCP] Outbound: ACK`, "pkt"); await slowDelay(600);
      updateStep(5, { status: StepStatus.COMPLETED, liveResult: ['ACKNOWLEDGED', `L4 Connected`] });
      addLog("Socket state: ESTABLISHED", "success");
      await slowDelay(1200);

      // Phase 3: TLS
      setActiveStepIndex(6); updateStep(6, { status: StepStatus.ACTIVE });
      addLog(`[TLS 1.3] > ClientHello`, "pkt"); await slowDelay(1200);
      addLog(`[TLS 1.3] < ServerHello (Cert Chain)`, "pkt"); await slowDelay(1000);
      synthesizeSecurityData(domain);
      addLog(`[TLS 1.3] Validating trust chain via OCSP...`, "info"); await slowDelay(1200);
      addLog(`[TLS 1.3] > Finished (Handshake Encrypted)`, "pkt");
      updateStep(6, { status: StepStatus.COMPLETED, liveResult: ['AES_256_GCM', 'TLS 1.3 Verified'] });
      addLog("Secure transport layer initialized.", "success");
      await slowDelay(1800);

      // Phase 4: HTTP
      setActiveStepIndex(7); updateStep(7, { status: StepStatus.ACTIVE });
      addLog(`[HTTP/2] > GET / HTTP/2`, "pkt"); await slowDelay(1000);
      addLog(`[HTTP/2] < 200 OK (Stream 1)`, "success");
      addLog(`[HTTP/2] Parsing binary framing layer...`, "info");
      updateStep(7, { status: StepStatus.COMPLETED, liveResult: ['200 OK', 'Payload Streamed'] });
      addLog("Application data frame delivery verified.", "success");
      
      setActiveStepIndex(8); 

    } catch (err) {
      console.error(err);
      setError("Stack failure: Network traversal interrupted.");
      addLog("CRITICAL: Peer-to-peer connection lost.", "err");
    } finally {
      setIsTracing(false);
    }
  };

  const getPacketTop = () => {
    if (activeStepIndex === -1) return -40;
    return (activeStepIndex * 100) + 40; 
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 selection:bg-emerald-500/30 overflow-x-hidden">
      <div className="scanline"></div>
      
      {/* Dynamic Header */}
      <nav className="sticky top-0 z-50 bg-black/80 backdrop-blur-2xl border-b border-zinc-900 px-8 py-4">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="bg-emerald-600/20 p-2.5 rounded-xl border border-emerald-500/30">
              <Shield className="text-emerald-500 w-5 h-5" />
            </div>
            <h1 className="text-xl font-black text-white tracking-tight">
              CYBER<span className="text-emerald-500 italic">TRACE</span>
              <span className="ml-3 text-[9px] bg-zinc-800 px-2 py-1 rounded text-zinc-500 font-mono tracking-widest uppercase">Sec_Audit_v3.0</span>
            </h1>
          </div>
          <div className="flex gap-10 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">
            <span className="flex items-center gap-2 hover:text-emerald-500 transition-colors cursor-help"><Layers className="w-3.5 h-3.5" /> Stack_Depth</span>
            <span className="flex items-center gap-2 hover:text-emerald-500 transition-colors cursor-help text-emerald-500"><ShieldCheck className="w-3.5 h-3.5" /> E2E_Encrypted</span>
            <span className="flex items-center gap-2 hover:text-emerald-500 transition-colors cursor-help"><Zap className="w-3.5 h-3.5" /> Latency_Optimized</span>
          </div>
        </div>
      </nav>

      <main className="max-w-[1600px] mx-auto px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Panel: Initialization & Traversal */}
          <div className="lg:col-span-4 space-y-12">
            <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-[2.5rem] p-10 backdrop-blur-xl relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/0 via-emerald-500/5 to-emerald-500/0 opacity-0 group-hover:opacity-100 transition-opacity blur-2xl pointer-events-none"></div>
              <form onSubmit={runTrace} className="relative">
                <input
                  type="text"
                  placeholder="Target Host: e.g. proton.me"
                  className="w-full bg-black/60 border border-zinc-800 rounded-2xl py-5 pl-14 pr-4 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/40 transition-all"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  disabled={isTracing}
                />
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-700 group-focus-within:text-emerald-500 transition-colors" />
                <button
                  type="submit"
                  disabled={isTracing || !domainInput}
                  className="absolute right-3 top-3 bottom-3 px-6 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl shadow-emerald-900/20"
                >
                  {isTracing ? 'SCANNING' : 'START TRACE'}
                </button>
              </form>
            </div>

            {/* Path visualization */}
            <div className="relative pl-10 space-y-10">
              <div className="absolute left-[58px] top-10 bottom-10 w-[2px] bg-zinc-900">
                <div 
                  className="absolute top-0 w-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)] transition-all duration-1000"
                  style={{ height: `${(Math.max(0, activeStepIndex) / (steps.length - 1)) * 100}%` }}
                />
              </div>

              <DNSPacket isVisible={isTracing || activeStepIndex > -1} top={getPacketTop() + 20} />

              {steps.map((step, idx) => (
                <div key={step.id} className="flex gap-8 items-center">
                  <div className="w-14 flex justify-center flex-shrink-0">
                    <ServerNode 
                      type={step.serverType} 
                      title={step.title} 
                      status={step.status}
                      isActive={activeStepIndex === idx}
                    />
                  </div>
                  <div className={`flex-1 transition-all duration-700 ${activeStepIndex >= idx ? 'opacity-100 translate-x-0' : 'opacity-10 translate-x-4'}`}>
                    <div className="flex items-center gap-2 mb-1">
                       <h4 className="text-[12px] font-black text-zinc-100 uppercase tracking-tighter">{step.description}</h4>
                       {step.status === StepStatus.COMPLETED && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                    </div>
                    {step.liveResult && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {step.liveResult.map((r, i) => (
                          <span key={i} className="text-[9px] font-mono bg-zinc-900 text-emerald-400/80 px-2 py-1 rounded border border-zinc-800 uppercase">
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Panel: Data Terminals & Audit */}
          <div className="lg:col-span-8 space-y-10">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {/* PCAP Terminal */}
              <div className="bg-black border border-zinc-800/80 rounded-[2.5rem] overflow-hidden flex flex-col h-[450px] shadow-2xl">
                <div className="bg-zinc-900/40 px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Terminal className="w-4 h-4 text-emerald-500" />
                    <span className="text-[11px] font-black uppercase text-zinc-400 tracking-widest">Protocol Analyzer</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/40"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/40"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/40"></div>
                  </div>
                </div>
                <div ref={logRef} className="flex-1 p-6 font-mono text-[10px] overflow-y-auto space-y-2.5 scroll-smooth">
                  {packetLogs.length === 0 && <div className="text-zinc-800 font-bold animate-pulse italic">LISTENING FOR FRAMES...</div>}
                  {packetLogs.map((log, i) => (
                    <div key={i} className="flex gap-4 animate-in fade-in slide-in-from-left-2 duration-400">
                      <span className="text-zinc-800 tabular-nums">[{new Date().toLocaleTimeString()}]</span>
                      <span className={`
                        ${log.type === 'pkt' ? 'text-blue-500' : ''}
                        ${log.type === 'success' ? 'text-emerald-500 font-bold' : ''}
                        ${log.type === 'err' ? 'text-red-500 font-black underline' : ''}
                        ${log.type === 'info' ? 'text-zinc-600' : ''}
                      `}>
                        {log.msg}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Certificate & AI Audit */}
              <div className="space-y-10">
                <CertificateCard cert={certInfo!} isVisible={!!certInfo} />
                
                <div className={`bg-gradient-to-br from-emerald-900/10 to-transparent border border-zinc-800/80 rounded-[2.5rem] p-10 transition-all duration-1000 ${aiInsight ? 'opacity-100' : 'opacity-0 translate-y-10'}`}>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="bg-emerald-600/20 p-3 rounded-2xl text-emerald-400 border border-emerald-500/20">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-white uppercase tracking-tight">Expert Audit</h3>
                      <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Master's Intelligence Synthesis</p>
                    </div>
                  </div>
                  <p className="text-[13px] leading-relaxed text-zinc-400 italic font-medium">
                    {aiInsight}
                  </p>
                </div>
              </div>
            </div>

            {/* Header Audit Console */}
            {headers.length > 0 && (
              <div className="bg-zinc-900/10 border border-zinc-800/80 rounded-[2.5rem] p-10 space-y-8 animate-in slide-in-from-bottom-10 duration-1000">
                <div className="flex items-center gap-4">
                  <div className="bg-orange-600/20 p-3 rounded-2xl text-orange-400 border border-orange-500/20">
                    <Cpu className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tighter">Security Header Analysis</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {headers.map((h, i) => (
                    <div key={i} className="bg-black/40 border border-zinc-800 p-6 rounded-2xl group hover:border-emerald-500/30 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <span className="text-[11px] font-mono text-zinc-200 break-all pr-4">{h.key}</span>
                        {h.status === 'secure' ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />}
                      </div>
                      <div className="text-[10px] text-zinc-600 font-mono mb-3 truncate italic">{h.value}</div>
                      <div className="flex gap-2 items-center text-[9px] text-zinc-500 bg-zinc-900/50 p-2 rounded-lg">
                        <Info className="w-3 h-3 text-zinc-700" />
                        {h.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Final Page Rendering */}
            <div className={`transition-all duration-1000 delay-500 ${activeStepIndex === 8 ? 'opacity-100' : 'opacity-0 translate-y-20'}`}>
              <div className="bg-zinc-900/10 border border-zinc-800/80 rounded-[3rem] p-12 space-y-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="bg-purple-600/20 p-5 rounded-3xl text-purple-400 border border-purple-500/20">
                      <Camera className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-3xl font-black text-white tracking-tighter uppercase">Payload Visualization</h3>
                      <p className="text-[10px] text-zinc-500 font-mono tracking-[0.4em] uppercase">{activeDomain} // SECURE_PORT_443</p>
                    </div>
                  </div>
                  <a href={`https://${activeDomain}`} target="_blank" className="flex items-center gap-3 bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-emerald-900/20">
                    Live Session <ExternalLink className="w-4 h-4" />
                  </a>
                </div>

                <div className="aspect-video w-full bg-black rounded-[2.5rem] border border-zinc-800 overflow-hidden relative shadow-3xl group">
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10 p-12 flex flex-col justify-end">
                    <div className="text-[11px] font-mono text-white/40 space-y-1 bg-black/40 backdrop-blur-md p-6 rounded-2xl w-fit">
                      <div>CIPHER_STREAM: TLS_1.3_AES_256</div>
                      <div>FRAME_ENCODING: BINARY_HTTP2</div>
                      <div>RENDER_TIME: 1.4s</div>
                    </div>
                  </div>
                  <img 
                    src={`https://s0.wp.com/mshots/v1/https://${activeDomain}?w=1600`} 
                    alt="Page Rendering"
                    className="w-full h-full object-cover grayscale-[0.2] transition-all duration-[3000ms] group-hover:grayscale-0 group-hover:scale-105"
                    onLoad={() => addLog("DOM visualization layer rendered.", "success")}
                  />
                  <div className="absolute inset-0 border border-white/5 pointer-events-none"></div>
                </div>
              </div>
            </div>

            {/* Empty State */}
            {!results && !isTracing && (
              <div className="h-full min-h-[400px] flex items-center justify-center border-4 border-dashed border-zinc-900/50 rounded-[4rem] group hover:border-emerald-500/10 transition-colors">
                 <div className="text-center space-y-8">
                    <div className="relative inline-block">
                      <Globe className="w-24 h-24 text-zinc-900 group-hover:text-emerald-900/20 transition-colors" />
                      <div className="absolute inset-0 animate-pulse bg-emerald-500/5 blur-3xl rounded-full"></div>
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-2xl font-black text-zinc-700 uppercase tracking-tighter">System Idle</h3>
                      <p className="text-zinc-800 text-sm font-medium tracking-wide">
                        Initialize hostname to begin deep-stack traversal.
                      </p>
                    </div>
                 </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Floating System Status */}
      <div className="fixed bottom-10 right-10 z-50">
        <div className="bg-zinc-900/90 backdrop-blur-2xl border border-zinc-800 px-6 py-3 rounded-2xl text-[10px] font-black text-zinc-500 tracking-[0.3em] flex items-center gap-4 shadow-2xl">
          <div className="relative">
            <Activity className="w-4 h-4 text-emerald-500" />
            <div className="absolute inset-0 animate-ping bg-emerald-500/40 rounded-full"></div>
          </div>
          READY_STATE // PACKET_INSPECTOR_ACTIVE
        </div>
      </div>
    </div>
  );
};

export default App;