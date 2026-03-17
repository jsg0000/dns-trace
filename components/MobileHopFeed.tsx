import React from "react";
import {
  Globe,
  Server,
  Monitor,
  HardDrive,
  ShieldCheck,
  Link,
  Lock,
  FileCode,
  LucideIcon,
} from "lucide-react";
import { StepStatus, TraceStep, ServerType } from "../types";

interface Props {
  steps: TraceStep[];
  activeStepIndex: number;
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

const MobileHopFeed: React.FC<Props> = ({ steps, activeStepIndex }) => {
  const visible = steps.filter((_, i) => i <= activeStepIndex);
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map((step, idx) => {
        const Icon = iconMap[step.serverType] ?? Server;
        const isActive = step.status === StepStatus.ACTIVE;
        const isCompleted = step.status === StepStatus.COMPLETED;
        const isError = step.status === StepStatus.ERROR;

        const borderColor = isActive
          ? "border-orange-500/60"
          : isCompleted
            ? "border-emerald-500/30"
            : isError
              ? "border-red-500/40"
              : "border-zinc-800/60";

        const iconBg = isActive
          ? "bg-orange-500/15 text-orange-400"
          : isCompleted
            ? "bg-emerald-500/15 text-emerald-400"
            : "bg-zinc-800 text-zinc-500";

        const titleColor = isActive
          ? "text-orange-300"
          : isCompleted
            ? "text-emerald-300"
            : "text-zinc-400";

        return (
          <div
            key={step.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl border bg-black/60 backdrop-blur-sm transition-all duration-500 ${borderColor}`}
            style={{ animation: "hop-slide-in 0.35s ease-out both" }}
          >
            {/* Icon */}
            <div
              className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "animate-pulse" : ""}`} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className={`text-[11px] font-black uppercase tracking-widest ${titleColor}`}
                >
                  {step.title}
                </span>
                {isActive && (
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-orange-500 animate-ping flex-shrink-0" />
                )}
              </div>
              <p className="text-[10px] text-zinc-500 truncate">
                {step.description}
              </p>
              {step.liveResult && step.liveResult.length > 0 && (
                <div className="flex gap-1 flex-wrap mt-1.5">
                  {step.liveResult.map((r, i) => (
                    <span
                      key={i}
                      className="text-[9px] font-mono bg-zinc-900 px-2 py-0.5 rounded-lg text-emerald-400 border border-zinc-800"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Latency badge */}
            {step.latency !== undefined && isCompleted && (
              <span className="flex-shrink-0 text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded-lg font-mono">
                {step.latency}ms
              </span>
            )}
          </div>
        );
      })}

      <style>{`
        @keyframes hop-slide-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default MobileHopFeed;
