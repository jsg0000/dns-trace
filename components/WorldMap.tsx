import React, { useEffect, useState, useMemo } from 'react';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { RoutePoint, StepStatus } from '../types';

interface Props {
  routePoints: RoutePoint[];
  userLocation: [number, number];
}

const W = 800;
const H = 380;

const projection = geoEquirectangular()
  .scale(130)
  .translate([W / 2, H / 2 + 20]);

const pathGen = geoPath(projection);

const NODE_COLOR: Record<StepStatus, string> = {
  [StepStatus.IDLE]:      '#3f3f46',
  [StepStatus.ACTIVE]:    '#f97316',
  [StepStatus.COMPLETED]: '#10b981',
  [StepStatus.ERROR]:     '#ef4444',
};

function project(lat: number, lng: number): [number, number] {
  return projection([lng, lat]) as [number, number];
}

function arcD(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const lift = Math.min(dist * 0.28, 80);
  const len = dist || 1;
  const cpx = mx + (dy / len) * lift * -1;
  const cpy = my - (dx / len) * lift * 0.5 - lift;
  return `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`;
}

const WorldMap: React.FC<Props> = ({ routePoints, userLocation }) => {
  const [landPaths, setLandPaths] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(r => r.json())
      .then(topo => {
        if (cancelled) return;
        const countries = feature(topo, topo.objects.countries);
        const paths = (countries as any).features
          .map((f: any) => pathGen(f) ?? '')
          .filter(Boolean);
        setLandPaths(paths);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(
    () => routePoints.filter(p => p.status !== StepStatus.IDLE),
    [routePoints]
  );

  const viewBox = useMemo(() => {
    if (visible.length < 2) return `0 0 ${W} ${H}`;
    const projected = visible.map(p => project(p.lat, p.lng));
    const xs = projected.map(p => p[0]);
    const ys = projected.map(p => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 80;
    const vw = Math.max(maxX - minX + pad * 2, 200);
    const vh = Math.max(maxY - minY + pad * 2, 100);
    if (vw < W * 0.35 && vh < H * 0.35) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      return `${cx - W * 0.25} ${cy - H * 0.25} ${W * 0.5} ${H * 0.5}`;
    }
    return `${minX - pad} ${minY - pad} ${vw} ${vh}`;
  }, [visible]);

  const userSvg = project(userLocation[0], userLocation[1]);

  return (
    <div className="w-full h-full relative bg-[#050505]">
      <style>{`
        @keyframes dash-flow {
          from { stroke-dashoffset: 20; }
          to   { stroke-dashoffset: 0; }
        }
        .arc-active { animation: dash-flow 0.6s linear infinite; }
        @keyframes node-pulse {
          0%, 100% { r: 6; opacity: 0.15; }
          50%       { r: 16; opacity: 0; }
        }
        .pulse-ring { animation: node-pulse 1.4s ease-out infinite; }
        @keyframes arc-draw {
          from { stroke-dashoffset: 1000; opacity: 0; }
          to   { stroke-dashoffset: 0; opacity: 1; }
        }
        .arc-draw { animation: arc-draw 0.9s ease-out forwards; }
      `}</style>

      {/* Header label */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <div className="bg-black/80 backdrop-blur-md border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
          <span className="text-[9px] font-black uppercase text-emerald-500 tracking-widest">Live Route Trace</span>
          {visible.some(p => p.status === StepStatus.ACTIVE) && (
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-orange-500 animate-ping" />
          )}
        </div>
      </div>

      {/* Hop legend */}
      {visible.length > 0 && (
        <div className="absolute bottom-4 left-4 z-10 pointer-events-none flex flex-col gap-1">
          {visible.map((p, i) => (
            <div key={p.stepIndex} className="flex items-center gap-1.5">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: NODE_COLOR[p.status] }}
              />
              <span
                className="text-[8px] font-mono tracking-wide truncate max-w-[160px]"
                style={{ color: p.status === StepStatus.ACTIVE ? '#f97316' : '#10b981' }}
              >
                {i + 1}. {p.label}
              </span>
            </div>
          ))}
        </div>
      )}

      <svg
        viewBox={viewBox}
        className="w-full h-full"
        style={{ transition: 'viewBox 1.2s cubic-bezier(0.4,0,0.2,1)' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="glow-green" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-orange" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-subtle" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Ocean */}
        <rect x="0" y="0" width={W} height={H} fill="#06100d" />

        {/* Subtle lat/lng grid */}
        {[-60, -30, 0, 30, 60].map(lat => {
          const y = project(lat, 0)[1];
          return <line key={`lat-${lat}`} x1={project(lat, -180)[0]} y1={y} x2={project(lat, 180)[0]} y2={y} stroke="#ffffff05" strokeWidth="0.5" />;
        })}
        {[-120, -60, 0, 60, 120].map(lng => {
          const x = project(0, lng)[0];
          return <line key={`lng-${lng}`} x1={x} y1={project(85, lng)[1]} x2={x} y2={project(-85, lng)[1]} stroke="#ffffff05" strokeWidth="0.5" />;
        })}

        {/* Land */}
        {isLoading ? (
          <text x={W / 2} y={H / 2} textAnchor="middle" fill="#1f2b24" fontSize="10" fontFamily="monospace">
            Loading geography…
          </text>
        ) : (
          landPaths.map((d, i) => (
            <path key={i} d={d} fill="#0f1f17" stroke="#1a3326" strokeWidth="0.6" />
          ))
        )}

        {/* User origin marker (indigo) */}
        <g>
          <circle cx={userSvg[0]} cy={userSvg[1]} r={5} fill="none" stroke="#818cf8" strokeWidth="0.8" strokeOpacity="0.5" />
          <circle cx={userSvg[0]} cy={userSvg[1]} r={2.5} fill="#818cf8" filter="url(#glow-subtle)" />
        </g>

        {/* Arcs between hops */}
        {visible.slice(0, -1).map((from, i) => {
          const to = visible[i + 1];
          const [x1, y1] = project(from.lat, from.lng);
          const [x2, y2] = project(to.lat, to.lng);
          const isActive = to.status === StepStatus.ACTIVE;
          const color = isActive ? '#f97316' : '#10b981';
          return (
            <path
              key={`arc-${from.stepIndex}-${to.stepIndex}`}
              d={arcD(x1, y1, x2, y2)}
              fill="none"
              stroke={color}
              strokeWidth={isActive ? 1.6 : 1.3}
              strokeOpacity={isActive ? 0.9 : 0.55}
              strokeDasharray={isActive ? '7 4' : '1000'}
              className={isActive ? 'arc-active' : 'arc-draw'}
              filter={isActive ? 'url(#glow-orange)' : 'url(#glow-green)'}
            />
          );
        })}

        {/* Node markers */}
        {visible.map(point => {
          const [cx, cy] = project(point.lat, point.lng);
          const isActive = point.status === StepStatus.ACTIVE;
          const color = NODE_COLOR[point.status];
          const glowId = isActive ? 'glow-orange' : 'glow-green';
          return (
            <g key={`node-${point.stepIndex}`}>
              {isActive && (
                <circle
                  cx={cx} cy={cy} r={6}
                  fill={color} fillOpacity="0.1"
                  stroke={color} strokeWidth="0.8" strokeOpacity="0.5"
                  className="pulse-ring"
                />
              )}
              <circle cx={cx} cy={cy} r={isActive ? 9 : 7} fill="none" stroke={color} strokeWidth={isActive ? 1.5 : 1} strokeOpacity={isActive ? 0.6 : 0.35} />
              <circle cx={cx} cy={cy} r={isActive ? 4.5 : 3} fill={color} filter={`url(#${glowId})`} />
              <text
                x={cx} y={cy - 14}
                textAnchor="middle"
                fontSize="6.5"
                fontFamily="monospace"
                fontWeight="700"
                fill={color}
                fillOpacity="0.95"
                style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
              >
                {point.label.length > 22 ? point.label.slice(0, 20) + '…' : point.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none rounded-3xl"
        style={{ boxShadow: 'inset 0 0 70px rgba(0,0,0,0.75)' }}
      />
    </div>
  );
};

export default WorldMap;
