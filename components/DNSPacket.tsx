
import React from 'react';

interface DNSPacketProps {
  isVisible: boolean;
  top: number;
}

const DNSPacket: React.FC<DNSPacketProps> = ({ isVisible, top }) => {
  if (!isVisible) return null;

  return (
    <div 
      className="absolute left-1/2 -translate-x-1/2 z-20 w-4 h-4 transition-all duration-700 ease-in-out"
      style={{ top: `${top}px` }}
    >
      <div className="w-full h-full bg-orange-500 rounded-full shadow-[0_0_10px_#f97316] animate-pulse"></div>
      <div className="absolute -top-1 -left-1 w-6 h-6 border border-orange-500/50 rounded-full animate-ping"></div>
    </div>
  );
};

export default DNSPacket;
