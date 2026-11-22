import { useState } from 'react';
import {
  AlertTriangle,
  Archive,
  FolderOutput,
  Loader2,
  Pin,
  Sparkles
} from 'lucide-react';
import type { ConnectorMode } from '@shared/types';
import { estimateFilamentGrams } from '../core/filamentEstimator';
import { buildExportFileList, createSplitPackageZip } from '../core/stlExporter';
import { useAppStore } from '../store/useAppStore';

export function Step4Split() {
  const {
    rawMesh,
    splitOptions,
    splitResult,
    isSplitting,
    splitProgress,
    splitError,
    selectedPartId,
    filamentMaterial,
    infillPercent,
    setSelectedPartId,
    updateConnectorConfig,
    getActivePrinter,
    runAutoSplit
  } = useAppStore();

  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const disabled = !rawMesh || isSplitting;

  const baseName = rawMesh
    ? rawMesh.fileName.replace(/\.[^/.]+$/, '')
    : 'SpliD_Export';

  const handleDownloadZip = async () => {
    if (!splitResult) return;
    setExportMessage(null);
    const printer = getActivePrinter();
    const zipBytes = createSplitPackageZip(splitResult, printer);
    const zipName = `${baseName}_split_${splitResult.summary.totalParts}parts.zip`;

    if (window.splidAPI) {
      const savedPath = await window.splidAPI.saveZipDialog(zipName, zipBytes);
      if (savedPath) {
        setExportMessage(`ZIP kaydedildi: ${savedPath}`);
      }
      return;
    }

    const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = zipName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportFolder = async () => {
    if (!splitResult) return;
    setExportMessage(null);
    const printer = getActivePrinter();
    const files = buildExportFileList(splitResult, printer);

    if (window.splidAPI) {
      const folderPath = await window.splidAPI.saveFolderDialog(`${baseName}_SpliD`, files);
      if (folderPath) {
        setExportMessage(`Klasöre çıkarıldı: ${folderPath}`);
      }
    } else {
      await handleDownloadZip();
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="uxigl-text-primary text-base font-semibold">4. Best-Practice Böl & İndir</h2>
        <p className="uxigl-text-muted mt-0.5 text-xs">
          Minimum parça sayısı, adaptif pimler ve su geçirmez STL çıktısı.
        </p>
      </div>

      {/* Alignment Pin Controls */}
      <div className="uxigl-card p-3.5">
        <div className="flex items-center justify-between">
          <div className="uxigl-text-primary flex items-center gap-2 text-xs font-semibold">
            <Pin className="h-4 w-4 text-amber-500" />
            <span>Hizalama Pimleri (Dowel Pins)</span>
          </div>
          <input
            type="checkbox"
            checked={splitOptions.connectors.enabled}
            onChange={(e) => updateConnectorConfig({ enabled: e.target.checked })}
            className="h-4 w-4 accent-[var(--uxigl-accent)]"
          />
        </div>

        {splitOptions.connectors.enabled && (
          <div className="mt-3 space-y-2 border-t border-[var(--uxigl-border)] pt-2.5">
            <select
              value={splitOptions.connectors.mode}
              onChange={(e) =>
                updateConnectorConfig({ mode: e.target.value as ConnectorMode })
              }
              className="uxigl-input w-full px-2.5 py-2 text-[11px]"
            >
              <option value="adaptive">Adaptif (Önerilen: 4mm / 1.75mm Filament / İnce Atlama)</option>
              <option value="standard-pin">Standart Pim (4 mm)</option>
              <option value="filament-pin">1.75 mm Filament Pimi (1.95 mm yuva)</option>
            </select>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <label className="uxigl-input flex items-center justify-between px-2.5 py-1.5">
                <span className="uxigl-text-muted">Çap (mm)</span>
                <input
                  type="number"
                  min={2}
                  max={10}
                  step={0.5}
                  value={splitOptions.connectors.diameterMM}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v) && v >= 1.5) updateConnectorConfig({ diameterMM: v });
                  }}
                  className="uxigl-accent-text w-12 bg-transparent text-right font-mono font-bold outline-none"
                />
              </label>

              <label className="uxigl-input flex items-center justify-between px-2.5 py-1.5">
                <span className="uxigl-text-muted">Tolerans</span>
                <input
                  type="number"
                  min={0.05}
                  max={0.8}
                  step={0.05}
                  value={splitOptions.connectors.clearanceMM}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v) && v >= 0) updateConnectorConfig({ clearanceMM: v });
                  }}
                  className="uxigl-accent-text w-12 bg-transparent text-right font-mono font-bold outline-none"
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Auto Split Action Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={runAutoSplit}
        className="uxigl-btn-filled flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isSplitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Bölünüyor ({splitProgress.percent}%)...</span>
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            <span>Otomatik En İyi Şekilde Böl</span>
          </>
        )}
      </button>

      {isSplitting && (
        <div className="uxigl-card p-2.5">
          <div className="uxigl-sunken h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="h-full bg-[var(--uxigl-accent)] transition-all duration-200"
              style={{ width: `${splitProgress.percent}%` }}
            />
          </div>
          <p className="uxigl-text-muted mt-1.5 text-center text-[11px]">{splitProgress.message}</p>
        </div>
      )}

      {splitError && (
        <div className="uxigl-banner-danger flex items-start gap-2 rounded-xl p-2.5 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{splitError}</span>
        </div>
      )}

      {/* Results & Export */}
      {splitResult && (
        <div className="uxigl-card space-y-3 p-3.5">
          <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
            <div className="uxigl-sunken p-2">
              <div className="uxigl-text-muted text-[10px]">Parça</div>
              <div className="uxigl-accent-text font-mono text-sm font-bold">
                {splitResult.summary.totalParts}
              </div>
            </div>
            <div className="uxigl-sunken p-2">
              <div className="uxigl-text-muted text-[10px]">Filament</div>
              <div className="font-mono text-sm font-bold text-emerald-500">
                ~{estimateFilamentGrams(
                  splitResult.summary.totalPartsVolumeCM3,
                  filamentMaterial,
                  infillPercent
                ).toFixed(0)}g
              </div>
            </div>
            <div className="uxigl-sunken p-2">
              <div className="uxigl-text-muted text-[10px]">Pimler</div>
              <div className="font-mono text-sm font-bold text-amber-500">
                {splitResult.totalConnectorsCount + splitResult.filamentPinsCount}
              </div>
            </div>
            <div className="uxigl-sunken p-2">
              <div className="uxigl-text-muted text-[10px]">Süre</div>
              <div className="uxigl-text-primary font-mono text-sm font-bold">
                {(splitResult.summary.executionTimeMs / 1000).toFixed(2)}s
              </div>
            </div>
          </div>

          {splitResult.connectorPinMesh && splitResult.totalConnectorsCount > 0 && (
            <div className="uxigl-sunken flex items-center justify-between px-3 py-2 text-[11px]">
              <div className="flex items-center gap-1.5">
                <Pin className="h-3.5 w-3.5 text-amber-500" />
                <span className="uxigl-text-primary font-semibold">
                  Pim KitCard ({splitResult.totalConnectorsCount} adet)
                </span>
              </div>
              <span className="uxigl-text-muted font-mono text-[10px]">
                {splitResult.connectorPinMesh.dimensionsMM.x.toFixed(0)}×
                {splitResult.connectorPinMesh.dimensionsMM.y.toFixed(0)}×
                {splitResult.connectorPinMesh.dimensionsMM.z.toFixed(1)} mm
              </span>
            </div>
          )}

          {(splitResult.filamentPinsCount > 0 || splitResult.skippedThinFacesCount > 0) && (
            <div className="uxigl-banner-warning rounded-xl px-3 py-2 text-[11px]">
              {splitResult.filamentPinsCount > 0 && (
                <div>• {splitResult.filamentPinsCount} orta-ince kesitte 1.75 mm filament pimi yuvası açıldı.</div>
              )}
              {splitResult.skippedThinFacesCount > 0 && (
                <div>• {splitResult.skippedThinFacesCount} ince kabuk (&lt;6 mm) kesitinde duvar güvenliği için pim atlandı.</div>
              )}
            </div>
          )}

          <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
            {splitResult.parts.map((part) => {
              const isSelected = selectedPartId === part.id;
              return (
                <button
                  key={part.id}
                  type="button"
                  onClick={() => setSelectedPartId(isSelected ? null : part.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition ${
                    isSelected ? 'uxigl-btn-tonal' : 'uxigl-btn-outlined'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: part.colorHex }}
                    />
                    <span className="font-semibold">{part.label}</span>
                  </div>
                  <span className="uxigl-text-muted font-mono text-[10px]">
                    {part.bbox.size.x.toFixed(0)}×{part.bbox.size.y.toFixed(0)}×{part.bbox.size.z.toFixed(0)} mm · ~
                    {estimateFilamentGrams(part.volumeCM3, filamentMaterial, infillPercent).toFixed(0)}g
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleDownloadZip}
              className="uxigl-btn-filled flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold"
            >
              <Archive className="h-3.5 w-3.5" />
              <span>ZIP İndir</span>
            </button>
            <button
              type="button"
              onClick={handleExportFolder}
              className="uxigl-btn-tonal flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold"
            >
              <FolderOutput className="h-3.5 w-3.5" />
              <span>Klasöre STL</span>
            </button>
          </div>

          {exportMessage && (
            <div className="uxigl-banner-success break-all rounded-xl px-3 py-2 text-[11px]">
              {exportMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
