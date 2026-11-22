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
  position: number;        // mm (cut coordinate)
  normal: [number, number, number];
  crossSectionAreaMM2: number;
  depthLevel: number;      // Hierarchical KD-Split depth (0: X, 1: Y, 2: Z)
}

export type ConnectorMode = 'adaptive' | 'standard-pin' | 'filament-pin' | 'none';

export interface ConnectorConfig {
  enabled: boolean;
  mode: ConnectorMode;     // Default: 'adaptive' (4mm / 1.75mm filament / skip based on thickness)
  diameterMM: number;      // Standard pin diameter, default: 4.0 mm
  depthMM: number;         // Socket depth per part, default: 6.0 mm
  clearanceMM: number;     // Tolerance clearance, default: 0.2 mm
  pinsPerFace: 1 | 2;      // 1 or 2 pins depending on cross-section area
}

export interface SplitOptions {
  safetyMarginMM: number;           // Default: 5 mm (build plate edge margin)
  minPieceThicknessMM: number;      // Default: 20 mm (minimum anti-sliver thickness)
  optimizeXYRotation: boolean;      // Evaluate 0° vs 90° Z rotation to reduce part count
  adaptiveHierarchical: boolean;    // Split each sub-part against its own tight bounding box
  seamOptimizationWindowMM: number; // Default: 15 mm (search narrowest cross-section within ±15 mm)
  connectors: ConnectorConfig;
}

export interface SplitPartResult {
  id: string;
  label: string;                    // e.g. "Part_01_X1_Y1_Z1"
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
  filamentPinsCount: number;        // Thin-section faces fitted with 1.75 mm raw filament pin sockets
  skippedThinFacesCount: number;    // Faces (< 6 mm) where pins were skipped to protect walls
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
