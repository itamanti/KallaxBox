import React from 'react';
import { GameBox, PlacedBox } from '../types/kallax';
import { getEffectiveDimensions } from '../utils/kallaxMath';
import { Layers, MoveHorizontal, MoveVertical, AlertTriangle } from 'lucide-react';

interface CubeOccupancyBarProps {
  cubeWidth: number;
  cubeHeight: number;
  cubeDepth: number;
  placedBoxes: PlacedBox[];
  gamesMap: Record<string, GameBox>;
  highlightedBoxId?: string | null;
  onSelectBox?: (boxId: string | null) => void;
}

export const CubeOccupancyBar: React.FC<CubeOccupancyBarProps> = ({
  cubeWidth,
  cubeHeight,
  cubeDepth,
  placedBoxes,
  gamesMap,
  highlightedBoxId,
  onSelectBox,
}) => {
  const cubeVolumeCm3 = cubeWidth * cubeHeight * cubeDepth;
  const cubeVolumeLiters = cubeVolumeCm3 / 1000;

  // Calculate real-time sum of volumes and linear footprints
  let totalBoxesVolumeCm3 = 0;
  let totalAdjacentWidth = 0;
  let totalStackedHeight = 0;
  let maxDepth = 0;

  let verticalCount = 0;
  let horizontalCount = 0;

  const segments = placedBoxes
    .map((placed) => {
      const game = gamesMap[placed.gameId];
      if (!game) return null;

      const boxVolumeCm3 = game.width * game.height * game.depth;
      const boxVolumeLiters = boxVolumeCm3 / 1000;
      const volumePercent = (boxVolumeCm3 / cubeVolumeCm3) * 100;

      const eff = getEffectiveDimensions(game, placed.orientation, placed.rotation90);

      totalBoxesVolumeCm3 += boxVolumeCm3;
      maxDepth = Math.max(maxDepth, eff.shelfDepth);

      if (placed.orientation === 'vertical') {
        verticalCount++;
        totalAdjacentWidth += eff.displayWidth;
      } else if (placed.orientation === 'horizontal') {
        horizontalCount++;
        totalStackedHeight += eff.displayHeight;
      } else {
        totalAdjacentWidth += eff.displayWidth;
      }

      return {
        placedId: placed.id,
        gameId: game.id,
        name: game.name,
        color: game.color || '#3B82F6',
        boxVolumeCm3,
        boxVolumeLiters: Math.round(boxVolumeLiters * 10) / 10,
        volumePercent: Math.round(volumePercent * 10) / 10,
        orientation: placed.orientation,
        effectiveWidth: eff.displayWidth,
        effectiveHeight: eff.displayHeight,
        effectiveDepth: eff.shelfDepth,
      };
    })
    .filter(Boolean) as NonNullable<ReturnType<typeof Object>>[];

  const actualVolumePercent = Math.min(
    100,
    Math.round((totalBoxesVolumeCm3 / cubeVolumeCm3) * 1000) / 10
  );
  const totalVolumeLitersUsed = Math.round((totalBoxesVolumeCm3 / 1000) * 10) / 10;
  const remainingVolumeLiters = Math.max(
    0,
    Math.round(((cubeVolumeCm3 - totalBoxesVolumeCm3) / 1000) * 10) / 10
  );

  const isAdjacentDominant = verticalCount >= horizontalCount;
  const linearSum = isAdjacentDominant ? totalAdjacentWidth : totalStackedHeight;
  const linearLimit = isAdjacentDominant ? cubeWidth : cubeHeight;
  const linearPercent = Math.min(100, Math.round((linearSum / linearLimit) * 100));
  const isLinearOverflow = linearSum > linearLimit + 0.1;

  return (
    <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3 font-sans">
      
      {/* Title & Key Percentages */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-200">
            Occupazione Geometrica Vano
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            ({cubeWidth} × {cubeHeight} × {cubeDepth} cm)
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono">
          <span className="text-slate-400 text-[11px]">
            Volume scatole:
          </span>
          <span className="text-amber-400 font-bold text-sm">
            {actualVolumePercent}%
          </span>
          <span className="text-slate-500 text-[11px]">
            ({totalVolumeLitersUsed} L / {Math.round(cubeVolumeLiters * 10) / 10} L)
          </span>
        </div>
      </div>

      {/* Multi-segmented Real-time Volume Occupancy Bar */}
      <div className="space-y-1">
        <div className="w-full h-4 bg-slate-900 rounded-lg overflow-hidden flex border border-slate-800 p-0.5">
          {segments.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-600 font-mono">
              Vano vuoto (100% libero)
            </div>
          ) : (
            segments.map((seg) => {
              const isSelected = highlightedBoxId === seg.placedId;
              return (
                <div
                  key={seg.placedId}
                  onClick={() => onSelectBox?.(isSelected ? null : seg.placedId)}
                  title={`${seg.name}: ${seg.boxVolumeLiters} L (${seg.volumePercent}% del volume vano)`}
                  className={`h-full transition-all duration-200 cursor-pointer rounded-sm relative group/seg first:rounded-l last:rounded-r ${
                    isSelected ? 'ring-2 ring-white scale-y-110 z-10 brightness-125' : 'hover:brightness-110'
                  }`}
                  style={{
                    backgroundColor: seg.color,
                    width: `${seg.volumePercent}%`,
                    minWidth: '6px',
                  }}
                />
              );
            })
          )}
        </div>

        {/* Legend of Games with Individual Volume % */}
        {segments.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[10px] font-mono">
            {segments.map((seg) => (
              <button
                key={seg.placedId}
                type="button"
                onClick={() => onSelectBox?.(highlightedBoxId === seg.placedId ? null : seg.placedId)}
                className={`flex items-center gap-1.5 transition-opacity ${
                  highlightedBoxId && highlightedBoxId !== seg.placedId
                    ? 'opacity-40 hover:opacity-100'
                    : 'opacity-90 hover:opacity-100'
                }`}
              >
                <div
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-slate-300 font-semibold truncate max-w-[130px]">
                  {seg.name}:
                </span>
                <span className="text-amber-400">
                  {seg.volumePercent}%
                </span>
                <span className="text-slate-500">
                  ({seg.boxVolumeLiters}L)
                </span>
              </button>
            ))}
            <div className="text-slate-500 ml-auto">
              Libero: <span className="text-slate-400 font-bold">{remainingVolumeLiters} L</span> ({Math.max(0, Math.round((100 - actualVolumePercent) * 10) / 10)}%)
            </div>
          </div>
        )}
      </div>

      {/* Real-time Sum of Stacked or Adjacent Games Linear Bar */}
      <div className="pt-2 border-t border-slate-900 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 text-slate-300 font-medium">
            {isAdjacentDominant ? (
              <>
                <MoveHorizontal className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>Somma giochi affiancati (in costa):</span>
              </>
            ) : (
              <>
                <MoveVertical className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Somma giochi impilati (in pila):</span>
              </>
            )}
            <span className="text-slate-400 font-mono text-[10px]">
              {Math.round(linearSum * 10) / 10} cm su {linearLimit} cm
            </span>
          </div>

          <span
            className={`font-mono font-bold text-xs ${
              isLinearOverflow ? 'text-red-400' : linearPercent > 80 ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {linearPercent}% occupato
          </span>
        </div>

        {/* Linear progress bar */}
        <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isLinearOverflow
                ? 'bg-red-500'
                : linearPercent > 80
                ? 'bg-amber-500'
                : 'bg-blue-500'
            }`}
            style={{ width: `${Math.min(100, linearPercent)}%` }}
          />
        </div>

        {isLinearOverflow && (
          <div className="flex items-center gap-1.5 text-[10px] text-red-300 bg-red-950/60 border border-red-500/30 rounded px-2 py-1">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>
              Attenzione: la somma delle scatole ({Math.round(linearSum * 10) / 10} cm) supera la misura interna del vano ({linearLimit} cm)!
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
