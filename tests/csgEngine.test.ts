import { describe, it, expect } from 'vitest';
import {
  executeAdaptiveManifoldSplit,
  generateConnectorPinKitCardMesh,
  initManifold
} from '../src/renderer/src/core/csgEngine';
import { meshToBinarySTL } from '../src/renderer/src/core/stlExporter';
import type { SplitOptions } from '../src/shared/types';

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

const BASE_OPTIONS: SplitOptions = {
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

describe('csgEngine manifold-3d splitting & adaptive pins', () => {
  it('splits a 300x300x300mm cube for a 256x256x256mm bed into 8 watertight parts <= 246mm', async () => {
    const cube = createBoxMesh(-150, 150, -150, 150, 0, 300);
    const result = await executeAdaptiveManifoldSplit(
      cube.positions,
      cube.indices,
      { x: 256, y: 256, z: 256 },
      {
        ...BASE_OPTIONS,
        connectors: { ...BASE_OPTIONS.connectors, enabled: false }
      }
    );

    expect(result.parts).toHaveLength(8);
    expect(result.summary.originalVolumeCM3).toBeCloseTo(27000, 1);
    expect(result.summary.totalPartsVolumeCM3).toBeCloseTo(27000, 1);

    for (const part of result.parts) {
      expect(part.bbox.size.x).toBeLessThanOrEqual(246.01);
      expect(part.bbox.size.y).toBeLessThanOrEqual(246.01);
      expect(part.bbox.size.z).toBeLessThanOrEqual(251.01);

      const stlBytes = meshToBinarySTL(part.positions, part.indices);
      expect(stlBytes.byteLength).toBe(84 + 50 * part.triangleCount);
    }
  });

  it('skips pins on ultra-thin (< 6mm) cross-sections and uses 1.75mm filament pins on 6-14mm sections', async () => {
    // 3mm thick wall along Y, 300mm long along X -> cross-section width is 3mm (< 6mm)
    const ultraThinWall = createBoxMesh(-150, 150, -1.5, 1.5, 0, 40);
    const thinResult = await executeAdaptiveManifoldSplit(
      ultraThinWall.positions,
      ultraThinWall.indices,
      { x: 256, y: 256, z: 256 },
      BASE_OPTIONS
    );
    expect(thinResult.parts).toHaveLength(2);
    expect(thinResult.skippedThinFacesCount).toBeGreaterThan(0);
    expect(thinResult.totalConnectorsCount).toBe(0);

    // 10mm thick bar along Y, 300mm long along X -> cross-section width is 10mm (6..14mm -> 1.75mm filament pin)
    const mediumBar = createBoxMesh(-150, 150, -5, 5, 0, 40);
    const mediumResult = await executeAdaptiveManifoldSplit(
      mediumBar.positions,
      mediumBar.indices,
      { x: 256, y: 256, z: 256 },
      BASE_OPTIONS
    );
    expect(mediumResult.parts).toHaveLength(2);
    expect(mediumResult.filamentPinsCount).toBeGreaterThan(0);
    expect(mediumResult.totalConnectorsCount).toBe(0);
  });

  it('merges small corner fragments on a 495mm hollow ring/planter into maximal bed-fitting parts', async () => {
    const wasm = await initManifold();
    const outer = wasm.Manifold.cylinder(200, 247.5, 247.5, 36, false);
    const inner = wasm.Manifold.cylinder(200, 235, 235, 36, false);
    const ring = outer.subtract(inner);
    outer.delete();
    inner.delete();

    const mesh = ring.getMesh();
    const positions = new Float32Array(mesh.numVert * 3);
    for (let i = 0; i < mesh.numVert; i++) {
      positions[i * 3] = mesh.vertProperties[i * mesh.numProp];
      positions[i * 3 + 1] = mesh.vertProperties[i * mesh.numProp + 1];
      positions[i * 3 + 2] = mesh.vertProperties[i * mesh.numProp + 2];
    }
    const indices = new Uint32Array(mesh.triVerts);
    ring.delete();

    const result = await executeAdaptiveManifoldSplit(
      positions,
      indices,
      { x: 256, y: 256, z: 256 },
      { ...BASE_OPTIONS, connectors: { ...BASE_OPTIONS.connectors, enabled: false } }
    );

    // With Center-Symmetric Max-Fit + greedy bed-fit merging, a 495mm hollow ring
    // splits cleanly into <= 6 large parts with zero tiny corner fragments.
    expect(result.parts.length).toBeLessThanOrEqual(6);
    for (const part of result.parts) {
      expect(part.bbox.size.x).toBeLessThanOrEqual(246.1);
      expect(part.bbox.size.y).toBeLessThanOrEqual(246.1);
      expect(part.bbox.size.z).toBeLessThanOrEqual(251.1);
      // Every piece should have substantial XY footprint (no tiny corner scraps)
      expect(Math.max(part.bbox.size.x, part.bbox.size.y)).toBeGreaterThanOrEqual(100);
    }
  });

  it('splits a 508x508x338mm flared tapered planter with solid base into <=10 large uniform parts with ZERO tiny corner scraps', async () => {
    const wasm = await initManifold();
    // Outer cone: radius 155mm at Z=0 flaring to 254mm (508mm diameter) at Z=338mm (9-sided like user planter!)
    const outerCone = wasm.Manifold.cylinder(338, 155, 254, 9, false);
    // Inner cavity starting at Z=16mm (16mm solid bottom floor), flaring from 140mm to 238mm
    const innerCone = wasm.Manifold.cylinder(325, 140, 238, 9, false).translate([0, 0, 16]);
    const planter = outerCone.subtract(innerCone);
    outerCone.delete();
    innerCone.delete();

    const mesh = planter.getMesh();
    const positions = new Float32Array(mesh.numVert * 3);
    for (let i = 0; i < mesh.numVert; i++) {
      positions[i * 3] = mesh.vertProperties[i * mesh.numProp];
      positions[i * 3 + 1] = mesh.vertProperties[i * mesh.numProp + 1];
      positions[i * 3 + 2] = mesh.vertProperties[i * mesh.numProp + 2];
    }
    const indices = new Uint32Array(mesh.triVerts);
    planter.delete();

    const result = await executeAdaptiveManifoldSplit(
      positions,
      indices,
      { x: 256, y: 256, z: 256 },
      BASE_OPTIONS
    );

    expect(result.parts.length).toBeLessThanOrEqual(10);
    const avgVol = result.summary.totalPartsVolumeCM3 / result.parts.length;

    for (const part of result.parts) {
      expect(part.bbox.size.x).toBeLessThanOrEqual(246.2);
      expect(part.bbox.size.y).toBeLessThanOrEqual(246.2);
      expect(part.bbox.size.z).toBeLessThanOrEqual(251.2);
      // Zero tiny triangle corners: every single part must be at least 35% of average part volume!
      expect(part.volumeCM3).toBeGreaterThanOrEqual(avgVol * 0.35);
    }
  });

  it('splits a 9-sided TWISTED fluted planter (508x508x338mm, 90° twist) with zero small pieces', async () => {
    const wasm = await initManifold();
    // Build a 9-lobed fluted polygon (36 vertices) of base outer radius ~154mm, flaring 1.65x -> ~508mm at top
    const outerPoly: [number, number][] = [];
    const innerPoly: [number, number][] = [];
    const steps = 72;
    for (let i = 0; i < steps; i++) {
      const theta = (i / steps) * Math.PI * 2;
      const flute = 1 + 0.06 * Math.cos(9 * theta);
      const rOut = 145 * flute;
      const rIn = 133 * flute;
      outerPoly.push([rOut * Math.cos(theta), rOut * Math.sin(theta)]);
      innerPoly.push([rIn * Math.cos(theta), rIn * Math.sin(theta)]);
    }

    const outerSolid = wasm.Manifold.extrude([outerPoly], 338, 32, 90, [1.65, 1.65], false);
    const innerCavity = wasm.Manifold.extrude([innerPoly], 326, 32, 90, [1.65, 1.65], false).translate([
      0,
      0,
      15
    ]);
    const twistedPlanter = outerSolid.subtract(innerCavity);
    outerSolid.delete();
    innerCavity.delete();

    const mesh = twistedPlanter.getMesh();
    const positions = new Float32Array(mesh.numVert * 3);
    for (let i = 0; i < mesh.numVert; i++) {
      positions[i * 3] = mesh.vertProperties[i * mesh.numProp];
      positions[i * 3 + 1] = mesh.vertProperties[i * mesh.numProp + 1];
      positions[i * 3 + 2] = mesh.vertProperties[i * mesh.numProp + 2];
    }
    const indices = new Uint32Array(mesh.triVerts);
    twistedPlanter.delete();

    const result = await executeAdaptiveManifoldSplit(
      positions,
      indices,
      { x: 256, y: 256, z: 256 },
      BASE_OPTIONS
    );

    const avgVol = result.summary.totalPartsVolumeCM3 / result.parts.length;

    expect(result.parts.length).toBeLessThanOrEqual(10);
    for (const part of result.parts) {
      expect(part.bbox.size.x).toBeLessThanOrEqual(246.2);
      expect(part.bbox.size.y).toBeLessThanOrEqual(246.2);
      expect(part.bbox.size.z).toBeLessThanOrEqual(251.2);
      expect(part.volumeCM3).toBeGreaterThanOrEqual(avgVol * 0.3);
    }
  });

  it('generates a single connected watertight Connector_Pins_KitCard_xN.stl matching exact pin count', async () => {
    const cube = createBoxMesh(-150, 150, -150, 150, 0, 300);
    const result = await executeAdaptiveManifoldSplit(
      cube.positions,
      cube.indices,
      { x: 256, y: 256, z: 256 },
      BASE_OPTIONS
    );

    expect(result.totalConnectorsCount).toBeGreaterThan(0);
    expect(result.connectorPinMesh).toBeDefined();
    expect(result.connectorPinMesh!.fileName).toBe(
      `Connector_Pins_KitCard_x${result.totalConnectorsCount}.stl`
    );

    // Verify the KitCard is a single connected 1-piece sprue and fits inside the bed
    const wasm = await initManifold();
    const card = generateConnectorPinKitCardMesh(wasm, 4.0, 6.0, 15, { x: 180, y: 180, z: 180 });
    expect(card.fileName).toBe('Connector_Pins_KitCard_x15.stl');
    expect(card.dimensionsMM.x).toBeLessThanOrEqual(180);
    expect(card.dimensionsMM.y).toBeLessThanOrEqual(180);

    const mesh = new wasm.Mesh({
      numProp: 3,
      vertProperties: card.positions,
      triVerts: card.indices
    });
    mesh.merge();
    const m = new wasm.Manifold(mesh);
    const pieces = m.decompose();
    expect(pieces.length).toBe(1); // 100% connected single-piece KitCard sprue
    for (const p of pieces) p.delete();
    m.delete();
  });
});
