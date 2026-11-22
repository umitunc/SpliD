export type PrinterTechnology = 'FDM' | 'SLA';

export interface PrinterProfile {
  id: string;
  brand: string;
  model: string;
  technology: PrinterTechnology;
  buildVolume: {
    x: number; // mm
    y: number; // mm
    z: number; // mm
  };
  popular?: boolean;
}

export interface Vector3MM {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBoxMM {
  min: Vector3MM;
  max: Vector3MM;
  size: Vector3MM;
}

export interface RawMeshData {
  fileName: string;
  positions: Float32Array; // [x0, y0, z0, x1, y1, z1, ...]
  indices: Uint32Array;    // [i0, i1, i2, ...]
  originalSize: Vector3MM;
  triangleCount: number;
}

export interface CutPlane {
  id: string;
  axis: 'x' | 'y' | 'z';
  position: number;        // mm (kesim koordinatı)
  normal: [number, number, number];
  crossSectionAreaMM2: number;
  depthLevel: number;      // Hiyerarşik KD-Split derinliği (0: X, 1: Y, 2: Z)
}

export type ConnectorMode = 'adaptive' | 'standard-pin' | 'filament-pin' | 'none';

export interface ConnectorConfig {
  enabled: boolean;
  mode: ConnectorMode;     // Varsayılan: 'adaptive' (kalınlığa göre 4mm / 1.75mm filament / atla)
  diameterMM: number;      // Standart pim çapı, varsayılan: 4.0 mm
  depthMM: number;         // Her bir parçadaki yuva derinliği, varsayılan: 6.0 mm
  clearanceMM: number;     // Tolerans boşluğu, varsayılan: 0.2 mm
  pinsPerFace: 1 | 2;      // Kesit alanına göre 1 veya 2 pim
}

export interface SplitOptions {
  safetyMarginMM: number;           // Varsayılan: 5 mm (tabla kenar boşluğu)
  minPieceThicknessMM: number;      // Varsayılan: 20 mm (sliver önleme alt sınırı)
  optimizeXYRotation: boolean;      // 0° vs 90° Z dönüşü ile parça sayısını azalt
  adaptiveHierarchical: boolean;    // Her alt parçayı kendi sıkı (tight) kutusuna göre böl
  seamOptimizationWindowMM: number; // Varsayılan: 15 mm (±15 mm içinde en dar kesiti ara)
  connectors: ConnectorConfig;
}

export interface SplitPartResult {
  id: string;
  label: string;                    // Örn: "Part_01_X1_Y1_Z1"
  gridIndex: [number, number, number];
  positions: Float32Array;
  indices: Uint32Array;
  bbox: BoundingBoxMM;
  centroid: Vector3MM;
  volumeCM3: number;
  triangleCount: number;
  colorHex: string;
}

export interface SplitExecutionResult {
  parts: SplitPartResult[];
  cutPlanes: CutPlane[];
  rotated90Z: boolean;
  totalConnectorsCount: number;
  filamentPinsCount: number;        // 1.75 mm ham filament pimi yuvası açılan ince kesit sayısı
  skippedThinFacesCount: number;    // < 6 mm olduğu için duvarı delmemek adına pim atlanan yüzey sayısı
  connectorPinMesh?: {
    fileName: string;
    positions: Float32Array;
    indices: Uint32Array;
    dimensionsMM: Vector3MM;
  };
  summary: {
    totalParts: number;
    originalVolumeCM3: number;
    totalPartsVolumeCM3: number;
    executionTimeMs: number;
  };
}
