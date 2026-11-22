import { describe, it, expect } from 'vitest';
import { unzipSync } from 'fflate';
import { estimateFilamentGrams } from '../src/renderer/src/core/filamentEstimator';
import {
  centerAndGroundPositions,
  computeBoundingBox,
  computeMeshVolumeCM3,
  rotatePositions90Z,
  scalePositions
} from '../src/renderer/src/core/meshTransform';
import { createSplitPackageZip } from '../src/renderer/src/core/stlExporter';
import type { PrinterProfile, SplitExecutionResult } from '../src/shared/types';

function createBox(w: number, d: number, h: number) {
  const positions = new Float32Array([
    0, 0, 0,
    w, 0, 0,
    w, d, 0,
    0, d, 0,
    0, 0, h,
    w, 0, h,
    w, d, h,
    0, d, h
  ]);
  const indices = new Uint32Array([
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7
  ]);
  return { positions, indices };
}

describe('meshTransform, filamentEstimator & stlExporter', () => {
  it('centers XY at 0, grounds Z at 0, scales, rotates 90° Z, and computes volume', () => {
    const box = createBox(100, 50, 20);
    const centered = centerAndGroundPositions(box.positions);
    const bbox = computeBoundingBox(centered);
    expect(bbox.min.x).toBeCloseTo(-50, 4);
    expect(bbox.max.x).toBeCloseTo(50, 4);
    expect(bbox.min.y).toBeCloseTo(-25, 4);
    expect(bbox.max.y).toBeCloseTo(25, 4);
    expect(bbox.min.z).toBeCloseTo(0, 4);
    expect(bbox.max.z).toBeCloseTo(20, 4);

    const vol = computeMeshVolumeCM3(centered, box.indices);
    expect(vol).toBeCloseTo(100, 3); // 100*50*20 mm^3 = 100 cm^3

    const scaled = scalePositions(centered, { x: 2, y: 2, z: 2 });
    const scaledBox = computeBoundingBox(scaled);
    expect(scaledBox.size.x).toBeCloseTo(200, 3);
    expect(scaledBox.size.y).toBeCloseTo(100, 3);
    expect(scaledBox.size.z).toBeCloseTo(40, 3);

    const rotated = rotatePositions90Z(centered);
    const rotBox = computeBoundingBox(rotated);
    expect(rotBox.size.x).toBeCloseTo(50, 3);
    expect(rotBox.size.y).toBeCloseTo(100, 3);
  });

  it('estimates filament consumption in grams accurately', () => {
    // 100 cm^3, PLA (1.24 g/cm^3), 100% infill -> 124g
    expect(estimateFilamentGrams(100, 'PLA', 100)).toBeCloseTo(124, 1);
    // 100 cm^3, PLA, 15% infill -> effective fill = 0.15 + 0.85*0.15 = 0.2775 -> ~34.41g
    expect(estimateFilamentGrams(100, 'PLA', 15)).toBeCloseTo(34.41, 1);
    expect(estimateFilamentGrams(0, 'PETG', 15)).toBe(0);
  });

  it('creates a valid ZIP archive containing STL, manifest.json, and README_ASSEMBLY.txt', () => {
    const box = createBox(40, 40, 40);
    const fakeResult: SplitExecutionResult = {
      parts: [
        {
          id: 'part-01',
          label: 'Part_01',
          gridIndex: [1, 1, 1],
          positions: box.positions,
          indices: box.indices,
          bbox: computeBoundingBox(box.positions),
          centroid: { x: 20, y: 20, z: 20 },
          volumeCM3: 64,
          triangleCount: 12,
          colorHex: '#38BDF8'
        }
      ],
      cutPlanes: [],
      rotated90Z: false,
      totalConnectorsCount: 0,
      filamentPinsCount: 0,
      skippedThinFacesCount: 0,
      summary: {
        totalParts: 1,
        originalVolumeCM3: 64,
        totalPartsVolumeCM3: 64,
        executionTimeMs: 10
      }
    };
    const printer: PrinterProfile = {
      id: 'bambu-x1c',
      brand: 'Bambu Lab',
      model: 'X1C',
      technology: 'FDM',
      buildVolume: { x: 256, y: 256, z: 256 }
    };

    const zipBytes = createSplitPackageZip(fakeResult, printer);
    const unzipped = unzipSync(zipBytes);
    expect(Object.keys(unzipped)).toContain('Part_01.stl');
    expect(Object.keys(unzipped)).toContain('manifest.json');
    expect(Object.keys(unzipped)).toContain('README_ASSEMBLY.txt');
    expect(unzipped['Part_01.stl'].byteLength).toBe(84 + 50 * 12);
  });
});
