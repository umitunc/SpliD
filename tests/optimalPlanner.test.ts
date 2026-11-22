import { describe, it, expect } from 'vitest';
import {
  computeBalancedAxisCuts,
  evaluateOptimalOrientation,
  getEffectiveBedVolume
} from '../src/renderer/src/core/optimalPlanner';
import type { SplitOptions } from '../src/shared/types';

const DEFAULT_OPTIONS: SplitOptions = {
  safetyMarginMM: 5,
  minPieceThicknessMM: 20,
  optimizeXYRotation: true,
  adaptiveHierarchical: true,
  seamOptimizationWindowMM: 15,
  connectors: {
    enabled: true,
    mode: 'adaptive',
    diameterMM: 4,
    depthMM: 6,
    clearanceMM: 0.2,
    pinsPerFace: 1
  }
};

function createBoxMesh(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number
): { positions: Float32Array; indices: Uint32Array } {
  const positions = new Float32Array([
    minX, minY, minZ,
    maxX, minY, minZ,
    maxX, maxY, minZ,
    minX, maxY, minZ,
    minX, minY, maxZ,
    maxX, minY, maxZ,
    maxX, maxY, maxZ,
    minX, maxY, maxZ
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

function mergeTwoBoxes(
  a: { positions: Float32Array; indices: Uint32Array },
  b: { positions: Float32Array; indices: Uint32Array }
): { positions: Float32Array; indices: Uint32Array } {
  const positions = new Float32Array(a.positions.length + b.positions.length);
  positions.set(a.positions, 0);
  positions.set(b.positions, a.positions.length);

  const offset = a.positions.length / 3;
  const indices = new Uint32Array(a.indices.length + b.indices.length);
  indices.set(a.indices, 0);
  for (let i = 0; i < b.indices.length; i++) {
    indices[a.indices.length + i] = b.indices[i] + offset;
  }
  return { positions, indices };
}

describe('optimalPlanner best-practice cut planning', () => {
  it('Test 1: fits 200x200x200mm model inside Bambu X1C (256x256x256mm) with 0 cuts', () => {
    const effective = getEffectiveBedVolume({ x: 256, y: 256, z: 256 }, 5);
    expect(effective).toEqual({ x: 246, y: 246, z: 251 });

    const orientation = evaluateOptimalOrientation({ x: 200, y: 200, z: 200 }, effective, true);
    expect(orientation.estimatedGridParts).toBe(1);

    const box = createBoxMesh(-100, 100, -100, 100, 0, 200);
    const cutsX = computeBalancedAxisCuts(-100, 100, effective.x, box.positions, box.indices, 'x', DEFAULT_OPTIONS);
    expect(cutsX).toHaveLength(0);
  });

  it('Test 2: prevents slivers on 260x100x100mm model (splits ~130+130 instead of 246+14)', () => {
    const box = createBoxMesh(-130, 130, -50, 50, 0, 100);
    const cuts = computeBalancedAxisCuts(-130, 130, 246, box.positions, box.indices, 'x', DEFAULT_OPTIONS);
    expect(cuts).toHaveLength(1);
    const leftSpan = cuts[0].position - -130;
    const rightSpan = 130 - cuts[0].position;
    expect(leftSpan).toBeGreaterThanOrEqual(110);
    expect(rightSpan).toBeGreaterThanOrEqual(110);
    expect(leftSpan).toBeLessThanOrEqual(246);
    expect(rightSpan).toBeLessThanOrEqual(246);
  });

  it('Test 3: detects 90° Z rotation to reduce 2 pieces down to 1 piece', () => {
    const decision = evaluateOptimalOrientation(
      { x: 240, y: 170, z: 100 },
      { x: 180, y: 250, z: 200 },
      true
    );
    expect(decision.rotated90Z).toBe(true);
    expect(decision.estimatedGridParts0).toBe(2);
    expect(decision.estimatedGridParts90).toBe(1);
    expect(decision.estimatedGridParts).toBe(1);
  });

  it('Test 4: shifts cut plane toward narrower cross-section (dumbbell bottleneck)', () => {
    // Wide left block (-135 to -10) + thin neck (-10 to +135) -> bottleneck is on the positive side of 0
    // Specifically: left wide block [-135, 10] (width 100 in Y/Z) and right thin block [10, 135] (width 10 in Y/Z)
    const wideLeft = createBoxMesh(-135, 10, -50, 50, 0, 100);
    const thinRight = createBoxMesh(10, 135, -5, 5, 45, 55);
    const dumbbell = mergeTwoBoxes(wideLeft, thinRight);

    const cuts = computeBalancedAxisCuts(-135, 135, 246, dumbbell.positions, dumbbell.indices, 'x', DEFAULT_OPTIONS);
    expect(cuts).toHaveLength(1);
    // Nominal center is 0, but x > 10 has 10x smaller cross-section, so cut must shift > 10
    expect(cuts[0].position).toBeGreaterThan(10);
  });
});
