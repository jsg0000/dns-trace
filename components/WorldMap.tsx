import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { RoutePoint, StepStatus } from '../types';

interface Props {
  routePoints: RoutePoint[];
  userLocation: [number, number];
}

const STATUS_COLOR: Record<StepStatus, string> = {
  [StepStatus.IDLE]: '#3f3f46',
  [StepStatus.ACTIVE]: '#f97316',
  [StepStatus.COMPLETED]: '#10b981',
  [StepStatus.ERROR]: '#ef4444',
};

/** Draw a geodesic-style arc between two lat/lng points as a series of intermediate steps */
function arcPoints(from: [number, number], to: [number, number], steps = 50): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = from[0] + (to[0] - from[0]) * t;
    // Slight great-circle arc effect: lift the midpoint latitude
    const arc = Math.sin(Math.PI * t) * Math.abs(to[0] - from[0]) * 0.3;
    const lng = from[1] + (to[1] - from[1]) * t;
    pts.push([lat + arc, lng]);
  }
  return pts;
}

const WorldMap: React.FC<Props> = ({ routePoints, userLocation }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const pulseRef = useRef<L.Marker[]>([]);
  const linesRef = useRef<L.Polyline[]>([]);

  // Initialise map once
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    mapInstance.current = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
    }).setView(userLocation, 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(mapInstance.current);

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render route whenever points change
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear previous layer objects
    markersRef.current.forEach(m => m.remove());
    linesRef.current.forEach(l => l.remove());
    pulseRef.current.forEach(p => p.remove());
    markersRef.current = [];
    linesRef.current = [];
    pulseRef.current = [];

    const visible = routePoints.filter(p => p.status !== StepStatus.IDLE);
    if (visible.length === 0) return;

    // Draw arced lines between sequential completed/active hops
    for (let i = 0; i < visible.length - 1; i++) {
      const a = visible[i];
      const b = visible[i + 1];
      const color = b.status === StepStatus.ACTIVE ? '#f97316' : '#10b981';
      const arc = arcPoints([a.lat, a.lng], [b.lat, b.lng]);
      const line = L.polyline(arc, {
        color,
        weight: b.status === StepStatus.ACTIVE ? 1.5 : 1.5,
        opacity: b.status === StepStatus.ACTIVE ? 0.9 : 0.55,
        dashArray: b.status === StepStatus.ACTIVE ? '6 4' : undefined,
        smoothFactor: 1,
      }).addTo(map);
      linesRef.current.push(line);
    }

    // Draw node markers
    visible.forEach(point => {
      const color = STATUS_COLOR[point.status];
      const isActive = point.status === StepStatus.ACTIVE;

      // Outer glow ring for active node
      if (isActive) {
        const pulse = L.marker([point.lat, point.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="
              width:28px; height:28px;
              border-radius:50%;
              background: rgba(249,115,22,0.15);
              border: 1.5px solid rgba(249,115,22,0.6);
              animation: dns-ping 1.2s ease-out infinite;
              margin-left:-6px; margin-top:-6px;
            "></div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
          zIndexOffset: 500,
          interactive: false,
        }).addTo(map);
        pulseRef.current.push(pulse);
      }

      const marker = L.circleMarker([point.lat, point.lng], {
        radius: isActive ? 7 : 5,
        fillColor: color,
        fillOpacity: 1,
        color: isActive ? '#fff' : 'rgba(255,255,255,0.4)',
        weight: 1.5,
        bubblingMouseEvents: false,
      }).addTo(map);

      marker.bindTooltip(`
        <span style="font-family:monospace;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">
          ${point.label}
        </span>`, {
        permanent: false,
        direction: 'top',
        offset: [0, -8],
        opacity: 0.95,
      });

      markersRef.current.push(marker);
    });

    // Fit view to all visible points
    if (visible.length === 1) {
      map.setView([visible[0].lat, visible[0].lng], 4, { animate: true, duration: 1.2 });
    } else {
      const bounds = L.latLngBounds(visible.map(p => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 7, animate: true, duration: 1.2 });
    }
  }, [routePoints]);

  return (
    <div className="w-full h-full relative">
      {/* Inject pulse keyframe once */}
      <style>{`
        @keyframes dns-ping {
          0%   { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .leaflet-tooltip {
          background: #09090b !important;
          border: 1px solid #27272a !important;
          color: #10b981 !important;
          box-shadow: 0 0 12px rgba(16,185,129,0.2) !important;
          border-radius: 6px !important;
          padding: 4px 8px !important;
        }
        .leaflet-tooltip-top::before {
          border-top-color: #27272a !important;
        }
      `}</style>
      <div ref={mapRef} className="w-full h-full" />
      <div className="absolute top-4 left-4 z-[1000] pointer-events-none">
        <div className="bg-black/80 backdrop-blur-md border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
          <span className="text-[9px] font-black uppercase text-emerald-500 tracking-widest">Live Route Trace</span>
          {routePoints.some(p => p.status === StepStatus.ACTIVE) && (
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-orange-500 animate-ping" />
          )}
        </div>
      </div>
      <div className="absolute inset-0 pointer-events-none border border-emerald-500/10 rounded-3xl shadow-[inset_0_0_50px_rgba(0,0,0,0.8)]" />
    </div>
  );
};

export default WorldMap;
