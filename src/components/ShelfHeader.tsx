import React from 'react';
import {
  Grid,
  Box as BoxIcon,
  Settings,
} from 'lucide-react';

interface ShelfHeaderProps {
  unplacedCount: number;
  totalGamesCount: number;
  onOpenAddManual?: () => void;
  onOpenBggModal?: () => void;
  onOpenBgStatsModal: () => void;
  onOpenConfigModal: () => void;
  onToggleLibrary: () => void;
}

export const ShelfHeader: React.FC<ShelfHeaderProps> = ({
  unplacedCount,
  totalGamesCount,
  onOpenAddManual,
  onOpenBggModal,
  onOpenBgStatsModal,
  onOpenConfigModal,
  onToggleLibrary,
}) => {
  return (
    <>
      {/* Top Bar following Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-4 sm:px-6 py-3.5 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
        
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-black shadow-md shadow-amber-500/10">
            <BoxIcon className="w-5 h-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">
            Kallax<span className="text-amber-400">Box</span>
          </span>
        </div>

        {/* Zone 2: Concise single-line nav links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-300">
          <button
            onClick={onToggleLibrary}
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <span>Libreria</span>
            {unplacedCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px]">
                {unplacedCount}
              </span>
            )}
          </button>
          <button
            onClick={onOpenBgStatsModal}
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Importa BG Stats
          </button>
          <button
            onClick={onOpenConfigModal}
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Configura Mobile
          </button>
        </nav>
      </header>

      {/* Mobile Fixed Bottom Tab Bar (under 15% viewport height, thumb navigation) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-slate-950/95 backdrop-blur-md border-t border-slate-800 grid grid-cols-3 items-center h-14 px-2">
        <button
          onClick={() => {
            // Scroll to top / shelf
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex flex-col items-center justify-center gap-0.5 text-amber-400 min-h-[44px]"
        >
          <Grid className="w-4 h-4" />
          <span className="text-[10px] font-medium tracking-tight">Scaffale</span>
        </button>

        <button
          onClick={onToggleLibrary}
          className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-white min-h-[44px]"
        >
          <div className="relative flex items-center justify-center">
            <BoxIcon className="w-4 h-4" />
            {unplacedCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 min-w-[15px] h-[15px] px-1 rounded-full bg-amber-500 text-slate-950 text-[9px] font-black flex items-center justify-center shadow-sm pointer-events-none ring-2 ring-slate-950">
                {unplacedCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium tracking-tight">Libreria</span>
        </button>

        <button
          onClick={onOpenConfigModal}
          className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-white min-h-[44px]"
        >
          <Settings className="w-4 h-4" />
          <span className="text-[10px] font-medium tracking-tight">Kallax</span>
        </button>
      </div>
    </>
  );
};
