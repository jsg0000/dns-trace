import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { IPIntelligence } from '../types';

interface Props {
  intel: IPIntelligence | null;
}

const WorldMap: React.FC<Props> = ({ intel }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (mapRef.current && !mapInstance.current) {
      mapInstance.current = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([20, 0], 2);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(mapInstance.current);
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (mapInstance.current && intel?.latitude && intel?.longitude) {
      const latLng: L.LatLngExpression = [intel.latitude, intel.longitude];
      
      if (markerRef.current) {
        markerRef.current.remove();
      }

      markerRef.current = L.marker(latLng, {
        icon: L.divIcon({
          className: 'custom-marker',
          iconSize: [12, 12],
        })
      }).addTo(mapInstance.current);

      mapInstance.current.flyTo(latLng, 6, {
        duration: 2.5,
        easeLinearity: 0.25
      });
    }
  }, [intel]);

  return (
    <div className="w-full h-full relative group">
      <div ref={mapRef} className="w-full h-full" />
      <div className="absolute top-4 left-4 z-[1000] pointer-events-none">
        <div className="bg-black/80 backdrop-blur-md border border-emerald-500/20 px-3 py-1.5 rounded-lg">
          <span className="text-[9px] font-black uppercase text-emerald-500 tracking-widest">Global Node Tracker</span>
        </div>
      </div>
      <div className="absolute inset-0 pointer-events-none border border-emerald-500/10 rounded-3xl shadow-[inset_0_0_50px_rgba(0,0,0,0.8)]"></div>
    </div>
  );
};

export default WorldMap;