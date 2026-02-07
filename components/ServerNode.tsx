
import React from 'react';
import { LucideIcon, Globe, Server, Monitor, HardDrive, ShieldCheck, Link, Lock, FileCode } from 'lucide-react';
import { StepStatus, ServerType } from '../types';

interface ServerNodeProps {
  type: ServerType;
  title: string;
  status: StepStatus;
  details?: string;
  isActive: boolean;
}

const iconMap: Record<ServerType, LucideIcon> = {
  client: Monitor,
  resolver: HardDrive,
  root: Globe,
  tld: Server,
  authoritative: ShieldCheck,
  tcp: Link,
  tls: Lock,
  http: FileCode,
};

const ServerNode: React.FC<ServerNodeProps> = ({ type, title, status, details, isActive }) => {
  const Icon = iconMap[type] || Server;
  
  const getBorderColor = () => {
    switch (status) {
      case StepStatus.ACTIVE: return 'border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.5)]';
      case StepStatus.COMPLETED: return 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]';
      case StepStatus.ERROR: return 'border-red-500';
      default: return 'border-zinc-800';
    }
  };

  const getIconColor = () => {
    switch (status) {
      case StepStatus.ACTIVE: return 'text-orange-500';
      case StepStatus.COMPLETED: return 'text-emerald-500';
      case StepStatus.ERROR: return 'text-red-500';
      default: return 'text-zinc-500';
    }
  };

  return (
    <div className={`relative flex flex-col items-center w-full max-w-sm transition-all duration-500 transform ${isActive ? 'scale-110 z-20' : 'scale-100'}`}>
      <div className={`z-10 flex items-center justify-center w-16 h-16 rounded-2xl border-2 bg-zinc-900 mb-3 ${getBorderColor()} transition-colors duration-500`}>
        <Icon className={`w-8 h-8 ${getIconColor()} ${status === StepStatus.ACTIVE ? 'animate-pulse' : ''}`} />
      </div>
      
      <div className="text-center">
        <h3 className={`font-bold text-[10px] tracking-widest uppercase truncate w-24 ${status === StepStatus.COMPLETED ? 'text-emerald-400' : status === StepStatus.ACTIVE ? 'text-orange-400' : 'text-zinc-600'}`}>
          {title}
        </h3>
      </div>

      {status === StepStatus.ACTIVE && (
        <div className="absolute -inset-4 bg-orange-500/10 blur-2xl rounded-full animate-pulse-slow"></div>
      )}
    </div>
  );
};

export default ServerNode;