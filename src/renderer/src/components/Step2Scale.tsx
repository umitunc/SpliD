import { Lock, RotateCcw, Unlock } from 'lucide-react';
import { Slider } from '@/components/primitives';
import { estimateFilamentGrams, type FilamentMaterial } from '../core/filamentEstimator';
import { useAppStore } from '../store/useAppStore';

export function Step2Scale() {
  const {
    rawMesh,
    targetSize,
    scaleRatio,
    lockAspectRatio,
    modelVolumeCM3,
    filamentMaterial,
    infillPercent,
    setTargetAxisMM,
    setUniformScalePercent,
    applyScaleMultiplier,
    resetScaleToOriginal,
    setLockAspectRatio,
    setFilamentMaterial,
    setInfillPercent
  } = useAppStore();

  const scalePercent = Math.round(scaleRatio.x * 100);
  const sliderMax = Math.max(500, Math.ceil(scalePercent / 100) * 100);
  const sliderTicks = Array.from(
    { length: Math.floor((sliderMax - 100) / 100) + 1 },
    (_, i) => 100 + i * 100
  ).filter((_, idx, arr) => arr.length <= 6 || idx === 0 || idx === arr.length - 1 || idx % Math.ceil(arr.length / 5) === 0);
  const estimatedGrams = estimateFilamentGrams(modelVolumeCM3, filamentMaterial, infillPercent);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="uxigl-text-primary text-base font-semibold">2. Hedef Boyutu Ayarla</h2>
          <p className="uxigl-text-muted mt-0.5 text-xs">
            Modelin basılacağı gerçek milimetre (mm) boyutunu belirle.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setLockAspectRatio(!lockAspectRatio)}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
            lockAspectRatio ? 'uxigl-btn-tonal' : 'uxigl-btn-outlined'
          }`}
        >
          {lockAspectRatio ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
          <span>{lockAspectRatio ? 'Oran Kilitli' : 'Serbest'}</span>
        </button>
      </div>

      <div className="uxigl-card space-y-3 p-3.5">
        <div className="grid grid-cols-3 gap-2.5">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <label key={axis} className="block">
              <span className="uxigl-text-muted mb-1 block text-[11px] font-semibold uppercase">
                Hedef {axis} (mm)
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={rawMesh ? Number(targetSize[axis].toFixed(1)) : ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isNaN(v) && v > 0) setTargetAxisMM(axis, v);
                }}
                className="uxigl-input w-full px-2.5 py-2 font-mono text-sm font-semibold"
              />
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <label className="uxigl-input flex flex-1 items-center justify-between px-3 py-2">
            <span className="uxigl-text-muted text-xs">Ölçek %</span>
            <input
              type="number"
              min={1}
              step={5}
              value={rawMesh ? scalePercent : 100}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isNaN(v) && v > 0) setUniformScalePercent(v);
              }}
              className="uxigl-accent-text w-20 bg-transparent text-right font-mono text-sm font-bold outline-none"
            />
          </label>

          <button
            type="button"
            onClick={resetScaleToOriginal}
            className="uxigl-btn-outlined flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium"
            title="Orijinal boyuta sıfırla"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Sıfırla</span>
          </button>
        </div>

        <div className="space-y-1 pt-1">
          <Slider
            min={100}
            max={sliderMax}
            step={100}
            value={rawMesh ? Math.max(100, scalePercent) : 100}
            onChange={(v) => {
              if (v > 0) setUniformScalePercent(v);
            }}
          />
          <div className="uxigl-text-muted flex justify-between font-mono text-[10px]">
            {sliderTicks.map((tick) => (
              <button
                key={tick}
                type="button"
                onClick={() => setUniformScalePercent(tick)}
                className={`transition hover:text-[var(--uxigl-text-primary)] ${
                  scalePercent === tick ? 'uxigl-accent-text font-bold' : ''
                }`}
              >
                {tick}%
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="uxigl-card p-3.5">
        <p className="uxigl-text-muted mb-2 text-[11px] font-semibold uppercase tracking-wider">
          Hızlı Birim Kurtarma & Ölçekleme
        </p>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => applyScaleMultiplier(25.4)}
            className="uxigl-btn-outlined rounded-xl px-2.5 py-2 text-xs font-medium"
          >
            Inch → mm (×25.4)
          </button>
          <button
            type="button"
            onClick={() => applyScaleMultiplier(10)}
            className="uxigl-btn-outlined rounded-xl px-2.5 py-2 text-xs font-medium"
          >
            cm → mm (×10)
          </button>
          <button
            type="button"
            onClick={() => applyScaleMultiplier(2)}
            className="uxigl-btn-outlined rounded-xl px-2.5 py-2 text-xs font-medium"
          >
            2× Büyüt
          </button>
        </div>
      </div>

      {rawMesh && (
        <div className="uxigl-card space-y-2 p-3 text-xs">
          <div className="uxigl-text-secondary flex items-center justify-between">
            <span>Tahmini Filament Tüketimi</span>
            <span className="font-mono text-sm font-bold text-emerald-500">
              ~{estimatedGrams.toFixed(1)} gr
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filamentMaterial}
              onChange={(e) => setFilamentMaterial(e.target.value as FilamentMaterial)}
              className="uxigl-input px-2 py-1 text-[11px] font-medium"
            >
              <option value="PLA">PLA (1.24 g/cm³)</option>
              <option value="PETG">PETG (1.27 g/cm³)</option>
              <option value="ABS">ABS (1.04 g/cm³)</option>
              <option value="TPU">TPU (1.21 g/cm³)</option>
            </select>

            <label className="uxigl-input flex flex-1 items-center justify-between px-2 py-1 text-[11px]">
              <span className="uxigl-text-muted">Dolgu (Infill)</span>
              <select
                value={infillPercent}
                onChange={(e) => setInfillPercent(Number(e.target.value))}
                className="uxigl-accent-text bg-transparent font-mono font-semibold outline-none"
              >
                <option value={10}>%10</option>
                <option value={15}>%15</option>
                <option value={20}>%20</option>
                <option value={40}>%40</option>
                <option value={100}>%100</option>
              </select>
            </label>
          </div>

          <div className="uxigl-text-muted flex items-center justify-between text-[11px]">
            <span>
              Orijinal: {rawMesh.originalSize.x.toFixed(1)}×{rawMesh.originalSize.y.toFixed(1)}×
              {rawMesh.originalSize.z.toFixed(1)} mm
            </span>
            <span className="font-mono">{modelVolumeCM3.toFixed(1)} cm³</span>
          </div>
        </div>
      )}
    </div>
  );
}
