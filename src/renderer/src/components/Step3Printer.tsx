import { useMemo, useState } from 'react';
import { CheckCircle2, Printer, Scissors, Search } from 'lucide-react';
import {
  CUSTOM_PRINTER_ID,
  PRINTER_LIST,
  useAppStore
} from '../store/useAppStore';

export function Step3Printer() {
  const {
    rawMesh,
    selectedPrinterId,
    customBuildVolume,
    splitOptions,
    setSelectedPrinterId,
    setCustomBuildVolume,
    updateSplitOptions,
    getActivePrinter,
    getEstimatedPartCount
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState<string>('ALL');

  const brands = useMemo(() => {
    const set = new Set(PRINTER_LIST.map((p) => p.brand));
    return ['ALL', ...Array.from(set)];
  }, []);

  const filteredPrinters = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PRINTER_LIST.filter((p) => {
      if (brandFilter !== 'ALL' && p.brand !== brandFilter) return false;
      if (!q) return true;
      return (
        p.brand.toLowerCase().includes(q) ||
        p.model.toLowerCase().includes(q) ||
        `${p.buildVolume.x}x${p.buildVolume.y}`.includes(q)
      );
    });
  }, [search, brandFilter]);

  const activePrinter = getActivePrinter();
  const estimate = getEstimatedPartCount();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="uxigl-text-primary text-base font-semibold">3. Yazıcı Tablası Seç</h2>
          <p className="uxigl-text-muted mt-0.5 text-xs">
            Modelin sığdırılacağı 3D yazıcının baskı hacmini seç.
          </p>
        </div>
        <span className="uxigl-sunken uxigl-text-secondary rounded-full px-2.5 py-0.5 font-mono text-[10px]">
          {PRINTER_LIST.length} Profil
        </span>
      </div>

      <div className="uxigl-card space-y-2.5 p-3.5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="uxigl-text-muted pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5" />
            <input
              type="text"
              placeholder="Yazıcı ara (Bambu, Ender, Prusa...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="uxigl-input w-full py-2 pl-8 pr-2.5 text-xs"
            />
          </div>
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="uxigl-input max-w-[120px] px-2.5 py-2 text-xs"
          >
            {brands.map((b) => (
              <option key={b} value={b}>
                {b === 'ALL' ? 'Tüm Markalar' : b}
              </option>
            ))}
          </select>
        </div>

        <select
          value={selectedPrinterId}
          onChange={(e) => setSelectedPrinterId(e.target.value)}
          className="uxigl-input w-full px-3 py-2.5 text-xs font-semibold"
        >
          <option value={CUSTOM_PRINTER_ID}>★ Özel Tabla Boyutu (Custom mm)</option>
          {filteredPrinters.map((p) => (
            <option key={p.id} value={p.id}>
              {p.brand} — {p.model} ({p.buildVolume.x}×{p.buildVolume.y}×{p.buildVolume.z} mm) [{p.technology}]
            </option>
          ))}
        </select>

        {selectedPrinterId === CUSTOM_PRINTER_ID && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <label key={axis} className="block">
                <span className="uxigl-text-muted mb-1 block text-[10px] uppercase">
                  Tabla {axis} (mm)
                </span>
                <input
                  type="number"
                  min={30}
                  max={1000}
                  value={customBuildVolume[axis]}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v) && v >= 30) {
                      setCustomBuildVolume({ [axis]: v });
                    }
                  }}
                  className="uxigl-input w-full px-2.5 py-1.5 font-mono text-xs"
                />
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="uxigl-card flex items-center justify-between p-3.5 text-xs">
        <div className="flex items-center gap-2">
          <Printer className="uxigl-accent-text h-4 w-4" />
          <div>
            <div className="uxigl-text-primary font-semibold">
              {activePrinter.brand} {activePrinter.model}
            </div>
            <div className="uxigl-text-muted font-mono text-[11px]">
              {activePrinter.buildVolume.x} × {activePrinter.buildVolume.y} × {activePrinter.buildVolume.z} mm
            </div>
          </div>
        </div>

        <label className="uxigl-input flex items-center gap-1.5 px-2.5 py-1.5 text-[11px]">
          <span className="uxigl-text-muted">Güvenlik Payı:</span>
          <input
            type="number"
            min={0}
            max={30}
            step={1}
            value={splitOptions.safetyMarginMM}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isNaN(v) && v >= 0) {
                updateSplitOptions({ safetyMarginMM: v });
              }
            }}
            className="uxigl-accent-text w-10 bg-transparent text-center font-mono font-bold outline-none"
          />
          <span className="uxigl-text-muted">mm</span>
        </label>
      </div>

      {rawMesh && (
        <div
          className={`flex items-center justify-between rounded-2xl px-3.5 py-2.5 text-xs font-medium ${
            estimate.parts <= 1 ? 'uxigl-banner-success' : 'uxigl-banner-warning'
          }`}
        >
          <div className="flex items-center gap-2">
            {estimate.parts <= 1 ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Tek Parça Sığıyor (Bölme Gerekmiyor)</span>
              </>
            ) : (
              <>
                <Scissors className="h-4 w-4" />
                <span>Otomatik Bölme Tahmini: ~{estimate.parts} parça</span>
              </>
            )}
          </div>
          {estimate.rotated90Z && (
            <span className="uxigl-accent-badge rounded-full px-2 py-0.5 text-[10px] font-semibold">
              90° Z Oto-Dönüş
            </span>
          )}
        </div>
      )}
    </div>
  );
}
