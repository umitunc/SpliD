import { useState } from 'react';
import { FileUp, Layers, UploadCloud } from 'lucide-react';
import { parseModelBuffer } from '../core/meshLoader';
import { useAppStore } from '../store/useAppStore';

export function Step1FileLoad() {
  const { rawMesh, modelVolumeCM3, setRawMesh } = useAppStore();
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const loadFromBuffer = (fileName: string, buffer: ArrayBuffer) => {
    try {
      setError(null);
      const parsed = parseModelBuffer(fileName, buffer);
      setRawMesh(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Model yüklenirken hata oluştu.');
    }
  };

  const handleBrowse = async () => {
    if (window.splidAPI) {
      const opened = await window.splidAPI.openFileDialog();
      if (opened) {
        const ab = opened.buffer.buffer.slice(
          opened.buffer.byteOffset,
          opened.buffer.byteOffset + opened.buffer.byteLength
        ) as ArrayBuffer;
        loadFromBuffer(opened.fileName, ab);
      }
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.stl,.obj,.3mf';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const ab = await file.arrayBuffer();
      loadFromBuffer(file.name, ab);
    };
    input.click();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const ab = await file.arrayBuffer();
    loadFromBuffer(file.name, ab);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="uxigl-text-primary text-base font-semibold">1. 3D Modelini Yükle</h2>
        <p className="uxigl-text-muted mt-0.5 text-xs">
          STL, OBJ veya 3MF dosyanı seç; mevcut boyutları anında ölçülsün.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={handleBrowse}
        className={`uxigl-card flex cursor-pointer flex-col items-center justify-center border-dashed px-4 py-8 text-center transition ${
          isDragging ? 'ring-2 ring-[var(--uxigl-accent)]' : ''
        }`}
      >
        <div className="uxigl-accent-badge mb-3 flex h-12 w-12 items-center justify-center rounded-2xl">
          <UploadCloud className="h-6 w-6" />
        </div>
        <p className="uxigl-text-primary text-sm font-semibold">
          {rawMesh ? 'Farklı Bir Model Seç' : 'Modeli Sürükle veya Gözat (Browse)'}
        </p>
        <p className="uxigl-text-muted mt-1 text-xs">
          Desteklenen formatlar:{' '}
          <span className="uxigl-text-secondary font-medium">.STL · .OBJ · .3MF</span>
        </p>
      </div>

      {error && (
        <div className="uxigl-banner-danger rounded-xl px-3 py-2 text-xs">
          {error}
        </div>
      )}

      {rawMesh && (
        <div className="uxigl-card p-3.5">
          <div className="flex items-center justify-between text-xs">
            <div className="uxigl-text-primary flex items-center gap-2 truncate font-semibold">
              <FileUp className="uxigl-accent-text h-4 w-4 shrink-0" />
              <span className="truncate">{rawMesh.fileName}</span>
            </div>
            <span className="uxigl-sunken uxigl-text-muted flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px]">
              <Layers className="h-3 w-3" />
              {rawMesh.triangleCount.toLocaleString()} tri
            </span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="uxigl-sunken px-2 py-2">
              <div className="uxigl-text-muted text-[10px]">Mevcut X</div>
              <div className="uxigl-accent-text font-mono text-sm font-bold">
                {rawMesh.originalSize.x.toFixed(1)} mm
              </div>
            </div>
            <div className="uxigl-sunken px-2 py-2">
              <div className="uxigl-text-muted text-[10px]">Mevcut Y</div>
              <div className="uxigl-accent-text font-mono text-sm font-bold">
                {rawMesh.originalSize.y.toFixed(1)} mm
              </div>
            </div>
            <div className="uxigl-sunken px-2 py-2">
              <div className="uxigl-text-muted text-[10px]">Mevcut Z</div>
              <div className="uxigl-accent-text font-mono text-sm font-bold">
                {rawMesh.originalSize.z.toFixed(1)} mm
              </div>
            </div>
          </div>

          <div className="uxigl-sunken uxigl-text-secondary mt-2.5 flex items-center justify-between px-3 py-1.5 text-xs">
            <span>Hesaplanan Hacim</span>
            <span className="uxigl-text-primary font-mono font-semibold">
              {modelVolumeCM3.toFixed(1)} cm³
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
