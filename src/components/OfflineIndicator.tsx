import React from 'react';
import { WifiOff, ShieldCheck } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-16 sm:bottom-4 left-3 sm:left-4 z-40 flex items-center gap-2 rounded-xl bg-amber-500 text-amber-950 px-3.5 py-2 text-xs font-semibold shadow-xl border border-amber-300">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Tryb offline aktywny — Zapis lokalny (IndexedDB) chroni wszystkie dane meczowe!</span>
      <ShieldCheck className="w-4 h-4 text-emerald-900 shrink-0 ml-1" />
    </div>
  );
};
