import { useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, Minus, Moon, RotateCcw, Square, Sun, X } from 'lucide-react';
import splidLogo from '../assets/splid-logo.png';
import { estimateFilamentGrams } from '../core/filamentEstimator';
import { useAppStore } from '../store/useAppStore';

export function TopBar() {
  const {
    rawMesh,
    targetSize,
    modelVolumeCM3,
    filamentMaterial,
    infillPercent,
    showBuildPlate,
    themeMode,
    setShowBuildPlate,
    toggleThemeMode,
    clearModel,
    getActivePrinter
  } = useAppStore();

  const printer = getActivePrinter();
  const estimatedGrams = estimateFilamentGrams(modelVolumeCM3, filamentMaterial, infillPercent);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const api = window.splidAPI;
    if (!api) return;
    void api.windowIsMaximized().then(setIsMaximized);
    return api.onWindowStateChange(({ isMaximized: next }) => setIsMaximized(next));
  }, []);

  return (
    <header className="uxigl-glass-regular uxigl-drag flex h-20 shrink-0 items-center justify-between border-b px-4 py-2">
      <div className="flex items-center gap-3.5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-lg">
          <img
            src={splidLogo}
            alt="SpliD Logo"
            className="h-16 w-16 object-contain"
            draggable={false}
          />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="uxigl-text-primary text-lg font-bold leading-none tracking-tight">
              SpliD
            </span>
          </div>
          <span className="uxigl-text-muted text-[11px] leading-none">
            Automatic 3D Model Splitter
          </span>
        </div>
      </div>

      <div className="uxigl-no-drag flex items-center gap-2 text-xs">
        {rawMesh ? (
          <div className="uxigl-sunken hidden items-center gap-3 rounded-full px-3.5 py-1 md:flex">
            <span className="uxigl-text-primary max-w-[160px] truncate font-medium">
              {rawMesh.fileName}
            </span>
            <span className="uxigl-text-muted">•</span>
            <span className="uxigl-accent-text font-mono font-semibold">
              {targetSize.x.toFixed(1)} × {targetSize.y.toFixed(1)} × {targetSize.z.toFixed(1)} mm
            </span>
            <span className="uxigl-text-muted">•</span>
            <span className="uxigl-text-secondary font-mono">{modelVolumeCM3.toFixed(1)} cm³</span>
            <span className="uxigl-text-muted">•</span>
            <span className="font-mono font-semibold text-emerald-500">
              ~{estimatedGrams.toFixed(0)} gr {filamentMaterial}
            </span>
          </div>
        ) : (
          <span className="uxigl-text-muted hidden md:inline">
            Tabla:{' '}
            <strong className="uxigl-text-primary">
              {printer.brand} {printer.model}
            </strong>{' '}
            ({printer.buildVolume.x}×{printer.buildVolume.y}×{printer.buildVolume.z} mm)
          </span>
        )}

        <button
          type="button"
          onClick={toggleThemeMode}
          className="uxigl-btn-outlined flex items-center justify-center rounded-full p-1.5"
          title={themeMode === 'dark' ? 'Açık Tema (Light Mode)' : 'Koyu Tema (Dark Mode)'}
        >
          {themeMode === 'dark' ? (
            <Sun className="h-3.5 w-3.5 text-amber-400" />
          ) : (
            <Moon className="h-3.5 w-3.5 text-slate-700" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowBuildPlate(!showBuildPlate)}
          className="uxigl-btn-outlined flex items-center gap-1.5 rounded-full px-3 py-1.5"
          title="Tabla sınırlarını göster/gizle"
        >
          {showBuildPlate ? (
            <Eye className="uxigl-accent-text h-3.5 w-3.5" />
          ) : (
            <EyeOff className="uxigl-text-muted h-3.5 w-3.5" />
          )}
          <span>Tabla</span>
        </button>

        {rawMesh && (
          <button
            type="button"
            onClick={clearModel}
            className="uxigl-btn-outlined flex items-center gap-1.5 rounded-full px-3 py-1.5 hover:border-rose-500/40 hover:text-rose-500"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Sıfırla</span>
          </button>
        )}

        {window.splidAPI && (
          <div className="ml-2 flex items-center gap-1 border-l border-[var(--uxigl-border)] pl-2.5">
            <button
              type="button"
              onClick={() => void window.splidAPI?.windowMinimize()}
              className="uxigl-btn-outlined flex h-7 w-7 items-center justify-center rounded-lg"
              title="Küçült"
              aria-label="Pencereyi küçült"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void window.splidAPI?.windowToggleMaximize().then(setIsMaximized)}
              className="uxigl-btn-outlined flex h-7 w-7 items-center justify-center rounded-lg"
              title={isMaximized ? 'Önceki Boyut' : 'Ekranı Kapla'}
              aria-label={isMaximized ? 'Pencereyi önceki boyutuna getir' : 'Pencereyi büyüt'}
            >
              {isMaximized ? (
                <Copy className="h-3 w-3" />
              ) : (
                <Square className="h-3 w-3" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void window.splidAPI?.windowClose()}
              className="uxigl-btn-outlined flex h-7 w-7 items-center justify-center rounded-lg hover:border-rose-500/50 hover:bg-rose-500 hover:text-white"
              title="Kapat"
              aria-label="Uygulamayı kapat"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
