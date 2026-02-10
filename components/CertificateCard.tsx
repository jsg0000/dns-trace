import React, { useState } from 'react';
import { Shield, Lock, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { CertificateInfo } from '../types';

interface Props {
  cert: CertificateInfo;
  isVisible: boolean;
}

const CertificateCard: React.FC<Props> = ({ cert, isVisible }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="bg-zinc-900/80 border border-emerald-500/30 rounded-3xl p-6 backdrop-blur-xl animate-in zoom-in duration-500 relative overflow-hidden group shrink-0 transition-all">
      <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
        <Shield className="w-16 h-16 text-emerald-500" />
      </div>
      
      <div 
        className="flex items-center justify-between mb-4 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/20 p-2 rounded-lg text-emerald-500">
            <Lock className="w-4 h-4" />
          </div>
          <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-400">X.509 Certificate Chain</h4>
        </div>
        <button className="text-zinc-500 hover:text-white transition-colors">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      <div className={`space-y-4 font-mono text-[10px] transition-all duration-500 overflow-hidden ${isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div>
          <span className="text-zinc-600 block mb-1">SUBJECT (CN)</span>
          <span className="text-zinc-200 break-all">{cert.subject}</span>
        </div>
        <div>
          <span className="text-zinc-600 block mb-1">ISSUER (CA)</span>
          <span className="text-zinc-200 break-all">{cert.issuer}</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-zinc-600 block mb-1">PROTOCOL</span>
            <span className="text-blue-400 font-bold">{cert.protocol}</span>
          </div>
          <div>
            <span className="text-zinc-600 block mb-1">CIPHER</span>
            <span className="text-orange-400 font-bold break-all">{cert.cipher}</span>
          </div>
        </div>
        <div className="pt-4 border-t border-zinc-800 flex justify-between items-center text-[9px]">
          <div className="flex items-center gap-2 text-zinc-500">
            <Calendar className="w-3 h-3" />
            <span>Valid through {cert.validTo}</span>
          </div>
          <div className="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
            TRUSTED_CHAIN
          </div>
        </div>
      </div>
    </div>
  );
};

export default CertificateCard;