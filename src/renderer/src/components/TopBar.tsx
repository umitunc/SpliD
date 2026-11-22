import { useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, Minus, Moon, RotateCcw, Square, Sun, X } from 'lucide-react';
import splidLogo from '../assets/splid-logo.png';
import { useAppStore } from '../store/useAppStore';

export function TopBar() {
  const {
    rawMesh,
    showBuildPlate,
    themeMode,
    setShowBuildPlate,
    toggleThemeMode,
    clearModel
  } = useAppStore();

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
        <button
          type="button"
          onClick={toggleThemeMode}
          className="uxigl-btn-outlined flex items-center justify-center rounded-full p-1.5"
          title={themeMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
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
          title="Toggle build plate visibility"
        >
          {showBuildPlate ? (
            <Eye className="uxigl-accent-text h-3.5 w-3.5" />
          ) : (
            <EyeOff className="uxigl-text-muted h-3.5 w-3.5" />
          )}
          <span>Build Plate</span>
        </button>

        {rawMesh && (
          <button
            type="button"
            onClick={clearModel}
            className="uxigl-btn-outlined flex items-center gap-1.5 rounded-full px-3 py-1.5 hover:border-rose-500/40 hover:text-rose-500"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
        )}

        {window.splidAPI && (
          <div className="ml-2 flex items-center gap-1 border-l border-[var(--uxigl-border)] pl-2.5">
            <button
              type="button"
              onClick={() => void window.splidAPI?.windowMinimize()}
              className="uxigl-btn-outlined flex h-7 w-7 items-center justify-center rounded-lg"
              title="Minimize"
              aria-label="Minimize window"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void window.splidAPI?.windowToggleMaximize().then(setIsMaximized)}
              className="uxigl-btn-outlined flex h-7 w-7 items-center justify-center rounded-lg"
              title={isMaximized ? 'Restore Down' : 'Maximize'}
              aria-label={isMaximized ? 'Restore window size' : 'Maximize window'}
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
              title="Close"
              aria-label="Close application"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
