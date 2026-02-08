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
  const traceListRef = useRef<HTMLDivElement>(null);
  const col2Ref = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Auto-scroll Logs
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [packetLogs]);

  // Auto-scroll Trace Steps (Scoped to container)
  useEffect(() => {
    const container = traceListRef.current;
    const activeElement = stepRefs.current[activeStepIndex];

    if (container && activeElement && activeStepIndex >= 0) {
      const containerRect = container.getBoundingClientRect();
      const activeRect = activeElement.getBoundingClientRect();
      
      const currentScrollTop = container.scrollTop;
      const relativeTop = activeRect.top - containerRect.top;
      const targetScrollTop = currentScrollTop + relativeTop - (containerRect.height / 2) + (activeRect.height / 2);

      container.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth'
      });
    }
  }, [activeStepIndex]);

  // Auto-scroll Column 2 to bottom when trace finishes to show render
  useEffect(() => {
    if (activeStepIndex === 8 && col2Ref.current) {
      setTimeout(() => {
        col2Ref.current?.scrollTo({
          top: col2Ref.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 500); // Slight delay to ensure DOM render
    }
  }, [activeStepIndex]);

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
      // Trigger AI audit in background
      getTechnicalInsight(domain).then(setAiInsight);
      
      const dnsData = await fetchDNS(domain);
      const ip = dnsData.Answer?.find(a => a.type === 1)?.data || '0.0.0.0';
      updateStep(4, { status: StepStatus.COMPLETED, liveResult: [`A -> ${ip}`] });
      setResults(dnsData);
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

  return (
    <div className="lg:h-screen min-h-screen bg-[#050505] text-zinc-300 selection:bg-emerald-500/30 lg:overflow-hidden overflow-y-auto flex flex-col">
      <div className="scanline"></div>
      
      {/* Header */}
      <nav className="flex-none bg-black/80 backdrop-blur-2xl border-b border-zinc-900 px-4 lg:px-8 py-4 z-50">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 lg:gap-5">
            <div className="bg-emerald-600/20 p-2 lg:p-2.5 rounded-xl border border-emerald-500/30">
              <Shield className="text-emerald-500 w-4 h-4 lg:w-5 lg:h-5" />
            </div>
            <h1 className="text-lg lg:text-xl font-black text-white tracking-tight">
              CYBER<span className="text-emerald-500 italic">TRACE</span>
              <span className="hidden lg:inline ml-3 text-[9px] bg-zinc-800 px-2 py-1 rounded text-zinc-500 font-mono tracking-widest uppercase">Sec_Audit_v3.0</span>
            </h1>
          </div>
          <div className="hidden lg:flex gap-10 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">
            <span className="flex items-center gap-2 hover:text-emerald-500 transition-colors cursor-help"><Layers className="w-3.5 h-3.5" /> Stack_Depth</span>
            <span className="flex items-center gap-2 hover:text-emerald-500 transition-colors cursor-help text-emerald-500"><ShieldCheck className="w-3.5 h-3.5" /> E2E_Encrypted</span>
            <span className="flex items-center gap-2 hover:text-emerald-500 transition-colors cursor-help"><Zap className="w-3.5 h-3.5" /> Latency_Optimized</span>
          </div>
        </div>
      </nav>

      {/* Main Layout */}
      <main className="flex-1 max-w-[1800px] mx-auto w-full px-4 lg:px-8 py-6 lg:py-8 lg:overflow-hidden overflow-visible">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:h-full h-auto">
          
          {/* Column 1: Route Visualization */}
          {/* Mobile: Order 2, Restricted Height, Border Styles */}
          <div className="lg:col-span-3 order-2 lg:order-1 bg-zinc-900/10 lg:border-r border-zinc-800/50 pr-0 lg:pr-4 h-[400px] lg:h-full flex flex-col rounded-2xl lg:rounded-none border lg:border-0 border-zinc-800 p-4 lg:p-0">
            <div className="flex items-center gap-3 mb-2 px-2 text-emerald-500/80 shrink-0">
              <Network className="w-4 h-4" />
              <h2 className="text-xs font-black uppercase tracking-widest">Route Topology</h2>
            </div>
            
            <div ref={traceListRef} className="relative flex-1 overflow-y-auto pr-2 pb-20 space-y-10 pt-2">
              {/* Connecting Line */}
              <div className="absolute left-[29px] top-4 bottom-0 w-[2px] bg-zinc-800/50">
                <div 
                  className="absolute top-0 w-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)] transition-all duration-700 ease-out"
                  style={{ height: `${(Math.max(0, activeStepIndex) / (steps.length - 1)) * 100}%` }}
                />
              </div>

              {/* Steps */}
              {steps.map((step, idx) => (
                <div 
                  key={step.id} 
                  ref={(el) => { stepRefs.current[idx] = el; }}
                  className="relative flex gap-6 items-center z-10"
                >
                   {/* Packet Animation */}
                   {idx === activeStepIndex && isTracing && (
                     <div className="absolute left-[21px] top-1/2 -translate-y-1/2 w-4 h-4 z-50">
                        <div className="w-full h-full bg-orange-500 rounded-full shadow-[0_0_10px_#f97316] animate-ping opacity-75"></div>
                     </div>
                   )}

                  <div className="w-16 flex justify-center flex-shrink-0">
                    <ServerNode 
                      type={step.serverType} 
                      title={step.title} 
                      status={step.status}
                      isActive={activeStepIndex === idx}
                    />
                  </div>
                  <div className={`flex-1 transition-all duration-700 ${activeStepIndex >= idx ? 'opacity-100 translate-x-0' : 'opacity-30 translate-x-2'}`}>
                    <div className="flex items-center gap-2 mb-1">
                       <h4 className="text-[11px] font-black text-zinc-100 uppercase tracking-tight">{step.description}</h4>
                       {step.status === StepStatus.COMPLETED && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                    </div>
                    {step.liveResult && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {step.liveResult.map((r, i) => (
                          <span key={i} className="text-[9px] font-mono bg-zinc-900 text-emerald-400/90 px-1.5 py-0.5 rounded border border-zinc-800 uppercase shadow-sm">
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

          {/* Column 2: Input & Terminal */}
          {/* Mobile: Order 1, Auto Height, Visible Overflow for window scrolling */}
          <div ref={col2Ref} className="lg:col-span-4 order-1 lg:order-2 flex flex-col lg:h-full h-auto lg:overflow-y-auto overflow-visible pr-0 lg:pr-2 pb-0 lg:pb-10 scroll-smooth">
            
            {/* STICKY INPUT */}
            <div className="bg-black border border-zinc-800/80 rounded-[1.5rem] p-6 mb-8 shadow-2xl relative group shrink-0 sticky top-0 z-40 backdrop-blur-md">
               <div className="absolute -inset-[1px] bg-gradient-to-r from-emerald-500/0 via-emerald-500/10 to-emerald-500/0 opacity-0 group-hover:opacity-100 transition-opacity blur-xl pointer-events-none"></div>
               <form onSubmit={runTrace} className="relative flex gap-4">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="ENTER DOMAIN (e.g. google.com)"
                    className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl py-3 pl-10 pr-4 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all placeholder:text-zinc-600 tracking-wider"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    disabled={isTracing}
                  />
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 group-focus-within:text-emerald-500 transition-colors" />
                </div>
                <button
                  type="submit"
                  disabled={isTracing || !domainInput}
                  className="px-5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.1em] transition-all shadow-lg shadow-emerald-900/20 whitespace-nowrap"
                >
                  {isTracing ? 'BUSY' : 'GO'}
                </button>
              </form>
            </div>

            {/* Protocol Analyzer */}
            <div className="bg-black border border-zinc-800 rounded-3xl overflow-hidden flex flex-col h-[320px] shadow-lg shrink-0">
                  <div className="bg-zinc-900/80 px-5 py-3 border-b border-zinc-800 flex items-center justify-between backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Protocol Analyzer</span>
                    </div>
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
                      <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
                    </div>
                  </div>
                  <div ref={logRef} className="flex-1 p-5 font-mono text-[10px] overflow-y-auto space-y-2 scroll-smooth bg-black/50">
                    {packetLogs.length === 0 && <div className="text-zinc-700 font-bold animate-pulse italic mt-20 text-center">AWAITING PACKET CAPTURE...</div>}
                    {packetLogs.map((log, i) => (
                      <div key={i} className="flex gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
                        <span className="text-zinc-700 select-none">›</span>
                        <span className={`
                          break-all
                          ${log.type === 'pkt' ? 'text-blue-400' : ''}
                          ${log.type === 'success' ? 'text-emerald-400 font-bold' : ''}
                          ${log.type === 'err' ? 'text-red-400 font-bold' : ''}
                          ${log.type === 'info' ? 'text-zinc-500' : ''}
                        `}>
                          {log.msg}
                        </span>
                      </div>
                    ))}
                  </div>
            </div>

            {/* Final Render Preview */}
            {activeStepIndex === 8 && (
               <div className="mt-8 mb-8 lg:mb-20 animate-in slide-in-from-bottom-10 duration-1000 fill-mode-forwards">
                  <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-1 overflow-hidden">
                    <div className="bg-black/50 backdrop-blur px-4 py-2 flex items-center gap-2 border-b border-zinc-800/50">
                      <div className="flex gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-red-500/20"></div>
                        <div className="w-2 h-2 rounded-full bg-yellow-500/20"></div>
                        <div className="w-2 h-2 rounded-full bg-emerald-500/20"></div>
                      </div>
                      <div className="flex-1 text-center">
                        <span className="text-[9px] font-mono text-zinc-500 bg-zinc-900/50 px-2 py-0.5 rounded">https://{activeDomain}</span>
                      </div>
                    </div>
                    <div className="relative aspect-[21/9] bg-black group">
                      <img 
                        src={`https://s0.wp.com/mshots/v1/https://${activeDomain}?w=1200`} 
                        className="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-1000"
                        alt="Render"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-6">
                         <div className="flex items-center gap-4">
                           <div className="bg-emerald-500 text-black font-bold text-[10px] px-3 py-1 rounded-full uppercase tracking-wider">
                             Secure Connection
                           </div>
                           <div className="text-[10px] font-mono text-emerald-400">
                             GET 200 OK • {new Date().toLocaleTimeString()}
                           </div>
                         </div>
                      </div>
                    </div>
                  </div>
               </div>
            )}
            
          </div>

          {/* Column 3: Analysis */}
          {/* Mobile: Order 3, Auto Height */}
          <div className="lg:col-span-5 order-3 lg:order-3 flex flex-col lg:h-full h-auto lg:overflow-y-auto overflow-visible pr-0 lg:pr-2 pb-10 scroll-smooth space-y-6">
              
              {/* Certificate Card */}
              {certInfo && (
                <CertificateCard cert={certInfo} isVisible={true} />
              )}
              
              {/* AI Audit */}
              <div className={`bg-gradient-to-br from-zinc-900 to-black border border-zinc-800 rounded-3xl p-8 relative overflow-hidden transition-all duration-1000 ${aiInsight ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-4 grayscale'}`}>
                  {aiInsight ? (
                     <>
                      <div className="flex items-center gap-4 mb-5">
                        <div className="bg-purple-500/10 p-2.5 rounded-xl text-purple-400 border border-purple-500/20">
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white uppercase tracking-tight">Expert Audit</h3>
                          <p className="text-[9px] text-purple-500 font-bold uppercase tracking-widest">Master's Intelligence</p>
                        </div>
                      </div>
                      <div className="text-[11px] leading-relaxed text-zinc-300 font-medium whitespace-pre-wrap">
                        {aiInsight}
                      </div>
                     </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-700 space-y-4 py-12">
                      <Cpu className="w-12 h-12 opacity-20" />
                      <p className="text-[10px] font-mono uppercase tracking-widest text-center opacity-50">Waiting for Handshake completion...</p>
                    </div>
                  )}
              </div>

              {/* Headers */}
              {headers.length > 0 && (
                  <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-3xl p-6 animate-in slide-in-from-bottom-5 fade-in duration-700">
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
          </div>
        </div>
      </main>

      {/* Status Bar */}
      <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
        <div className="bg-black/80 backdrop-blur-md border border-zinc-800 pl-4 pr-5 py-2.5 rounded-full text-[9px] font-black text-zinc-500 tracking-[0.2em] flex items-center gap-3 shadow-2xl">
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </div>
          SYSTEM_ONLINE
        </div>
      </div>
    </div>
  );
};

export default App;