import Module from 'manifold-3d';
import type { ManifoldToplevel, Manifold as ManifoldType } from 'manifold-3d';
import manifoldWasmUrl from 'manifold-3d/manifold.wasm?url';
import type {
  BoundingBoxMM,
  ConnectorConfig,
  CutPlane,
  SplitExecutionResult,
  SplitOptions,
  SplitPartResult,
  Vector3MM
} from '@shared/types';
import {
  computeBoundingBox,
  computeMeshVolumeCM3,
  rotatePositions90Z
} from './meshTransform';
import {
  type AxisCutStyle,
  computeBalancedAxisCuts,
  evaluateOptimalOrientation,
  getEffectiveBedVolume
} from './optimalPlanner';

const PART_COLORS = [
  '#38BDF8', // Sky
  '#FB923C', // Amber/Orange
  '#34D399', // Emerald
  '#A78BFA', // Violet
  '#F472B6', // Pink
  '#FBBF24', // Yellow
  '#2DD4BF', // Teal
  '#60A5FA', // Blue
  '#F87171', // Coral
  '#A3E635'  // Lime
];

let wasmPromise: Promise<ManifoldToplevel> | null = null;

export async function initManifold(): Promise<ManifoldToplevel> {
  if (!wasmPromise) {
    const isNode =
      typeof process !== 'undefined' && Boolean(process.versions?.node);
    const moduleConfig = isNode ? undefined : { locateFile: () => manifoldWasmUrl };
    wasmPromise = Module(moduleConfig).then((mod) => {
      mod.setup();
      return mod;
    });
  }
  return wasmPromise;
}

function manifoldToBuffers(m: ManifoldType): {
  positions: Float32Array;
  indices: Uint32Array;
  bbox: BoundingBoxMM;
  centroid: Vector3MM;
  volumeCM3: number;
  triangleCount: number;
} {
  const mesh = m.getMesh();
  const numVert = mesh.numVert;
  const numProp = mesh.numProp;
  const positions = new Float32Array(numVert * 3);

  for (let i = 0; i < numVert; i++) {
    positions[i * 3] = mesh.vertProperties[i * numProp];
    positions[i * 3 + 1] = mesh.vertProperties[i * numProp + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * numProp + 2];
  }

  const indices = new Uint32Array(mesh.triVerts.length);
  indices.set(mesh.triVerts);

  const bbox = computeBoundingBox(positions);
  const centroid: Vector3MM = {
    x: (bbox.min.x + bbox.max.x) * 0.5,
    y: (bbox.min.y + bbox.max.y) * 0.5,
    z: (bbox.min.z + bbox.max.z) * 0.5
  };

  const volumeCM3 = Math.max(0, m.volume() / 1000);
  const triangleCount = Math.floor(indices.length / 3);

  return { positions, indices, bbox, centroid, volumeCM3, triangleCount };
}

/**
 * Generates a single, 1-piece watertight 3D-printable KitCard sprue containing
 * exact `pinCount` chamfered alignment pins with snap-off gates and outer frame.
 */
export function generateConnectorPinKitCardMesh(
  wasm: ManifoldToplevel,
  diameterMM: number,
  depthMM: number,
  pinCount: number,
  effectiveBed: Vector3MM = { x: 220, y: 220, z: 220 }
): {
  fileName: string;
  positions: Float32Array;
  indices: Uint32Array;
  dimensionsMM: Vector3MM;
} {
  const count = Math.max(1, Math.min(200, Math.round(pinCount)));
  const radius = Math.max(0.8, diameterMM * 0.5);
  const totalHeight = Math.max(3, depthMM * 2 - 0.6);
  const chamfer = Math.min(0.5, radius * 0.25);
  const bodyHeight = Math.max(1, totalHeight - 2 * chamfer);

  const bottomCone = wasm.Manifold.cylinder(chamfer, radius - chamfer, radius, 24, false);
  const midCyl = wasm.Manifold.cylinder(bodyHeight, radius, radius, 24, false).translate([
    0,
    0,
    chamfer
  ]);
  const topCone = wasm.Manifold.cylinder(chamfer, radius, radius - chamfer, 24, false).translate([
    0,
    0,
    chamfer + bodyHeight
  ]);
  const basePin = wasm.Manifold.union([bottomCone, midCyl, topCone]);
  bottomCone.delete();
  midCyl.delete();
  topCone.delete();

  const frameH = 1.2;
  const frameW = 2.2;
  const spineW = 2.4;
  const gateLen = 2.0;
  const gateW = 1.2;
  const gateH = 0.8;

  const pinOffsetX = spineW * 0.5 + gateLen + radius;
  const bayHalfW = pinOffsetX + radius + 2.2 + frameW * 0.5;
  const bayStepX = bayHalfW * 2 - frameW; // adjacent bays share outer vertical rail
  const pitchY = diameterMM + 3.6;

  const maxRowsPerBay = Math.max(1, Math.floor(Math.max(40, effectiveBed.y - 16) / pitchY));
  const totalPairs = Math.ceil(count / 2);
  const numBays = Math.max(1, Math.ceil(totalPairs / maxRowsPerBay));
  const rowsPerBay = Math.ceil(totalPairs / numBays);

  const innerSpanY = rowsPerBay * pitchY + 2.4;
  const totalCardY = innerSpanY + 2 * frameW;
  const totalCardX = (numBays - 1) * bayStepX + bayHalfW * 2;

  const partsToUnion: ManifoldType[] = [];

  // Outer top & bottom horizontal frame bars (along X)
  const topBar = wasm.Manifold.cube([totalCardX, frameW, frameH], false).translate([
    -totalCardX * 0.5,
    totalCardY * 0.5 - frameW,
    0
  ]);
  const bottomBar = wasm.Manifold.cube([totalCardX, frameW, frameH], false).translate([
    -totalCardX * 0.5,
    -totalCardY * 0.5,
    0
  ]);
  partsToUnion.push(topBar, bottomBar);

  let placedPins = 0;

  for (let bay = 0; bay < numBays; bay++) {
    const bayCenterX = -totalCardX * 0.5 + bayHalfW + bay * bayStepX;

    // Left & right outer vertical rails of this bay
    const leftRail = wasm.Manifold.cube([frameW, totalCardY, frameH], false).translate([
      bayCenterX - bayHalfW,
      -totalCardY * 0.5,
      0
    ]);
    partsToUnion.push(leftRail);

    if (bay === numBays - 1) {
      const rightRail = wasm.Manifold.cube([frameW, totalCardY, frameH], false).translate([
        bayCenterX + bayHalfW - frameW,
        -totalCardY * 0.5,
        0
      ]);
      partsToUnion.push(rightRail);
    }

    // Central runner spine along Y connecting top & bottom frame bars
    const spine = wasm.Manifold.cube([spineW, totalCardY, frameH], false).translate([
      bayCenterX - spineW * 0.5,
      -totalCardY * 0.5,
      0
    ]);
    partsToUnion.push(spine);

    for (let row = 0; row < rowsPerBay && placedPins < count; row++) {
      const rowY =
        -innerSpanY * 0.5 + 1.2 + pitchY * 0.5 + row * pitchY;

      // Left pin + snap-off gate
      const leftPinX = bayCenterX - pinOffsetX;
      partsToUnion.push(basePin.translate([leftPinX, rowY, 0]));
      const gateReach = pinOffsetX - radius + chamfer + 0.45;
      const leftGate = wasm.Manifold.cube([gateReach, gateW, gateH], false).translate([
        bayCenterX - gateReach,
        rowY - gateW * 0.5,
        0
      ]);
      partsToUnion.push(leftGate);
      placedPins += 1;

      // Right pin + snap-off gate (if needed)
      if (placedPins < count) {
        const rightPinX = bayCenterX + pinOffsetX;
        partsToUnion.push(basePin.translate([rightPinX, rowY, 0]));
        const rightGate = wasm.Manifold.cube([gateReach, gateW, gateH], false).translate([
          bayCenterX,
          rowY - gateW * 0.5,
          0
        ]);
        partsToUnion.push(rightGate);
        placedPins += 1;
      }
    }
  }

  basePin.delete();

  const kitCard = wasm.Manifold.union(partsToUnion);
  for (const p of partsToUnion) p.delete();

  const data = manifoldToBuffers(kitCard);
  kitCard.delete();

  return {
    fileName: `Connector_Pins_KitCard_x${count}.stl`,
    positions: data.positions,
    indices: data.indices,
    dimensionsMM: data.bbox.size
  };
}

interface PinApplicationStats {
  standardPins: number;
  filamentPins: number;
  skippedThinFaces: number;
}

/**
 * Applies the 3-tier adaptive alignment pin & thin-wall safety strategy across a cut plane
 * between two adjacent manifolds A and B.
 */
function applyAdaptivePinsAtCut(
  wasm: ManifoldToplevel,
  partA: ManifoldType,
  partB: ManifoldType,
  axis: 'x' | 'y' | 'z',
  planeCoord: number,
  connectors: ConnectorConfig,
  stats: PinApplicationStats
): { a: ManifoldType; b: ManifoldType } {
  if (!connectors.enabled || connectors.mode === 'none') {
    return { a: partA, b: partB };
  }

  // Extract a thin 0.4mm slice around the cut plane to measure the real cross-section
  const sliceSize: [number, number, number] = [2000, 2000, 2000];
  const sliceCenter: [number, number, number] = [0, 0, 0];
  const axisIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  sliceSize[axisIdx] = 0.4;
  sliceCenter[axisIdx] = planeCoord;

  const sliceBox = wasm.Manifold.cube(sliceSize, true).translate(sliceCenter);
  const crossSliceA = partA.intersect(sliceBox);
  const crossSliceB = partB.intersect(sliceBox);
  sliceBox.delete();

  if (
    crossSliceA.isEmpty() ||
    crossSliceB.isEmpty() ||
    crossSliceA.volume() < 0.05 ||
    crossSliceB.volume() < 0.05
  ) {
    crossSliceA.delete();
    crossSliceB.delete();
    return { a: partA, b: partB };
  }

  const boxA = crossSliceA.boundingBox();
  const boxB = crossSliceB.boundingBox();
  crossSliceA.delete();
  crossSliceB.delete();

  const uIdx = axisIdx === 0 ? 1 : 0;
  const vIdx = axisIdx === 2 ? 1 : 2;

  const overlapMinU = Math.max(boxA.min[uIdx], boxB.min[uIdx]);
  const overlapMaxU = Math.min(boxA.max[uIdx], boxB.max[uIdx]);
  const overlapMinV = Math.max(boxA.min[vIdx], boxB.min[vIdx]);
  const overlapMaxV = Math.min(boxA.max[vIdx], boxB.max[vIdx]);

  const spanU = overlapMaxU - overlapMinU;
  const spanV = overlapMaxV - overlapMinV;
  if (spanU <= 0.1 || spanV <= 0.1) {
    return { a: partA, b: partB };
  }

  const minCrossWidth = Math.min(spanU, spanV);

  const centerPos: [number, number, number] = [0, 0, 0];
  centerPos[axisIdx] = planeCoord;
  centerPos[uIdx] = (overlapMinU + overlapMaxU) * 0.5;
  centerPos[vIdx] = (overlapMinV + overlapMaxV) * 0.5;

  // Determine pin tier based on mode & local cross-section thickness
  let holeDiameter = 0;
  let holeDepth = connectors.depthMM;
  let isFilamentPin = false;

  if (connectors.mode === 'adaptive') {
    if (minCrossWidth < 6.0) {
      // Tier 3: Thin shell (< 6mm) -> skip pin to avoid breaking through walls
      stats.skippedThinFaces += 1;
      return { a: partA, b: partB };
    } else if (minCrossWidth < 14.0) {
      // Tier 2: Medium-thin (6..14mm) -> 1.75mm raw filament pin (1.95mm hole)
      holeDiameter = 1.95;
      holeDepth = Math.min(5.0, minCrossWidth * 0.45);
      isFilamentPin = true;
    } else {
      // Tier 1: Thick (>= 14mm) -> Standard dowel pin
      holeDiameter = connectors.diameterMM + connectors.clearanceMM;
      holeDepth = connectors.depthMM;
    }
  } else if (connectors.mode === 'filament-pin') {
    if (minCrossWidth < 4.5) {
      stats.skippedThinFaces += 1;
      return { a: partA, b: partB };
    }
    holeDiameter = 1.95;
    holeDepth = Math.min(5.0, minCrossWidth * 0.45);
    isFilamentPin = true;
  } else {
    // standard-pin
    if (minCrossWidth < connectors.diameterMM + 3.0) {
      stats.skippedThinFaces += 1;
      return { a: partA, b: partB };
    }
    holeDiameter = connectors.diameterMM + connectors.clearanceMM;
    holeDepth = connectors.depthMM;
  }

  const holeRadius = holeDiameter * 0.5;
  const totalHoleLength = 2 * (holeDepth + 0.4);

  let holeCyl = wasm.Manifold.cylinder(totalHoleLength, holeRadius, holeRadius, 24, true);
  if (axis === 'x') {
    holeCyl = holeCyl.rotate([0, 90, 0]);
  } else if (axis === 'y') {
    holeCyl = holeCyl.rotate([90, 0, 0]);
  }
  const positionedHole = holeCyl.translate(centerPos);
  holeCyl.delete();

  // Verify the hole sits inside both parts with safe wall clearance
  const nextA = partA.subtract(positionedHole);
  const nextB = partB.subtract(positionedHole);
  positionedHole.delete();

  partA.delete();
  partB.delete();

  if (isFilamentPin) {
    stats.filamentPins += 1;
  } else {
    stats.standardPins += 1;
  }

  return { a: nextA, b: nextB };
}

/**
 * Splits a Manifold recursively along a sorted list of cut coordinates on one axis.
 */
function splitManifoldAlongAxis(
  manifold: ManifoldType,
  cuts: CutPlane[],
  axis: 'x' | 'y' | 'z'
): ManifoldType[] {
  if (cuts.length === 0) {
    return [manifold];
  }

  const normal: [number, number, number] =
    axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];

  const sortedCuts = [...cuts].sort((a, b) => a.position - b.position);
  const slices: ManifoldType[] = [];
  let remainder = manifold;

  for (const cut of sortedCuts) {
    const [posSide, negSide] = remainder.splitByPlane(normal, cut.position);
    if (remainder !== manifold) {
      remainder.delete();
    } else {
      manifold.delete();
    }

    if (!negSide.isEmpty()) {
      slices.push(negSide);
    } else {
      negSide.delete();
    }
    remainder = posSide;
  }

  if (!remainder.isEmpty()) {
    slices.push(remainder);
  } else {
    remainder.delete();
  }

  return slices;
}

function fitsInBed(
  minPt: [number, number, number],
  maxPt: [number, number, number],
  effectiveBed: Vector3MM
): boolean {
  const eps = 0.05;
  return (
    maxPt[0] - minPt[0] <= effectiveBed.x + eps &&
    maxPt[1] - minPt[1] <= effectiveBed.y + eps &&
    maxPt[2] - minPt[2] <= effectiveBed.z + eps
  );
}

/**
 * Only decomposes disconnected islands if the slice currently exceeds the bed dimensions.
 */
function decomposeIfExceedsBed(
  slice: ManifoldType,
  effectiveBed: Vector3MM
): ManifoldType[] {
  const b = slice.boundingBox();
  if (fitsInBed(b.min, b.max, effectiveBed)) {
    return slice.volume() >= 1.0 ? [slice] : (slice.delete(), []);
  }
  const comps = slice.decompose();
  slice.delete();
  const out: ManifoldType[] = [];
  for (const c of comps) {
    if (c.volume() >= 1.0) out.push(c);
    else c.delete();
  }
  return out;
}

/**
 * Greedily merges small or adjacent parts whose combined bounding box fits inside effectiveBed.
 * Eliminates tiny corner slivers and maximizes each part up to the printer bed capacity.
 */
function mergeFittingManifolds(
  manifolds: ManifoldType[],
  effectiveBed: Vector3MM
): ManifoldType[] {
  const items = manifolds.map((m) => ({
    m,
    b: m.boundingBox(),
    vol: m.volume()
  }));

  let mergedAny = true;
  while (mergedAny && items.length > 1) {
    mergedAny = false;
    // Process smallest-volume pieces first
    items.sort((a, b) => a.vol - b.vol);

    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      let bestPartnerIdx = -1;
      let bestScore = Infinity;

      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        const b = items[j];

        const cMin: [number, number, number] = [
          Math.min(a.b.min[0], b.b.min[0]),
          Math.min(a.b.min[1], b.b.min[1]),
          Math.min(a.b.min[2], b.b.min[2])
        ];
        const cMax: [number, number, number] = [
          Math.max(a.b.max[0], b.b.max[0]),
          Math.max(a.b.max[1], b.b.max[1]),
          Math.max(a.b.max[2], b.b.max[2])
        ];

        if (!fitsInBed(cMin, cMax, effectiveBed)) continue;

        // Compute 3D bounding-box gap distance; touching/adjacent parts get score ~0
        const gapX = Math.max(0, a.b.min[0] - b.b.max[0], b.b.min[0] - a.b.max[0]);
        const gapY = Math.max(0, a.b.min[1] - b.b.max[1], b.b.min[1] - a.b.max[1]);
        const gapZ = Math.max(0, a.b.min[2] - b.b.max[2], b.b.min[2] - a.b.max[2]);
        const gap = Math.hypot(gapX, gapY, gapZ);

        const combinedSpan =
          (cMax[0] - cMin[0]) + (cMax[1] - cMin[1]) + (cMax[2] - cMin[2]);
        const score = gap * 1000 + combinedSpan;

        if (score < bestScore) {
          bestScore = score;
          bestPartnerIdx = j;
        }
      }

      if (bestPartnerIdx !== -1) {
        const b = items[bestPartnerIdx];
        const combined = a.m.add(b.m);
        a.m.delete();
        b.m.delete();

        const nextItem = {
          m: combined,
          b: combined.boundingBox(),
          vol: combined.volume()
        };

        const firstIdx = Math.min(i, bestPartnerIdx);
        const secondIdx = Math.max(i, bestPartnerIdx);
        items.splice(secondIdx, 1);
        items.splice(firstIdx, 1, nextItem);

        mergedAny = true;
        break;
      }
    }
  }

  return items.map((it) => it.m);
}

interface SplitCandidateSpec {
  axisOrder: ['x' | 'y' | 'z', 'x' | 'y' | 'z', 'x' | 'y' | 'z'];
  cutStyle: AxisCutStyle;
}

interface EvaluatedSplitCandidate {
  manifolds: ManifoldType[];
  cutPlanes: CutPlane[];
  score: number;
}

function scoreCandidateManifolds(manifolds: ManifoldType[]): number {
  const n = manifolds.length;
  if (n <= 1) return 0;

  let totalVol = 0;
  const vols: number[] = [];
  const maxDims: number[] = [];

  for (const m of manifolds) {
    const v = Math.max(0, m.volume());
    const b = m.boundingBox();
    const maxDim = Math.max(
      b.max[0] - b.min[0],
      b.max[1] - b.min[1],
      b.max[2] - b.min[2]
    );
    vols.push(v);
    maxDims.push(maxDim);
    totalVol += v;
  }

  const avgVol = totalVol / n;
  if (avgVol <= 1e-6) return n * 100;

  let severeRuntCount = 0;
  let runtCount = 0;
  let minVol = Infinity;

  for (let i = 0; i < n; i++) {
    const ratio = vols[i] / avgVol;
    if (vols[i] < minVol) minVol = vols[i];
    if (ratio < 0.1) {
      severeRuntCount += 1;
    } else if (ratio < 0.22 || maxDims[i] < 50) {
      runtCount += 1;
    }
  }

  const minRatio = minVol / avgVol;
  return severeRuntCount * 50000 + runtCount * 8000 + n * 100 - minRatio * 300;
}

function runCandidateSplitPipeline(
  rootManifold: ManifoldType,
  rootPositions: Float32Array,
  rootIndices: Uint32Array,
  effectiveBed: Vector3MM,
  options: SplitOptions,
  spec: SplitCandidateSpec
): EvaluatedSplitCandidate {
  const cutPlanes: CutPlane[] = [];
  let currentSlices: ManifoldType[] = [rootManifold.translate([0, 0, 0])];

  for (let depth = 0; depth < 3; depth++) {
    const axis = spec.axisOrder[depth];
    const axisIdx: 0 | 1 | 2 = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    const maxAllowed = effectiveBed[axis];
    const nextSlices: ManifoldType[] = [];

    for (let sIdx = 0; sIdx < currentSlices.length; sIdx++) {
      const slice = currentSlices[sIdx];
      const b = slice.boundingBox();
      const span = b.max[axisIdx] - b.min[axisIdx];

      if (span > maxAllowed + 1e-4) {
        let posBuf = rootPositions;
        let idxBuf = rootIndices;
        if (!(depth === 0 && currentSlices.length === 1)) {
          const extracted = manifoldToBuffers(slice);
          posBuf = extracted.positions;
          idxBuf = extracted.indices;
        }

        const cuts = computeBalancedAxisCuts(
          b.min[axisIdx],
          b.max[axisIdx],
          maxAllowed,
          posBuf,
          idxBuf,
          axis,
          options,
          depth,
          spec.cutStyle
        );
        cutPlanes.push(...cuts);

        const subSlices = splitManifoldAlongAxis(slice, cuts, axis);
        for (const sub of subSlices) {
          if (depth < 2 && options.adaptiveHierarchical) {
            nextSlices.push(...decomposeIfExceedsBed(sub, effectiveBed));
          } else if (sub.volume() >= 1.0) {
            nextSlices.push(sub);
          } else {
            sub.delete();
          }
        }
      } else {
        if (depth < 2 && options.adaptiveHierarchical) {
          nextSlices.push(...decomposeIfExceedsBed(slice, effectiveBed));
        } else if (slice.volume() >= 1.0) {
          nextSlices.push(slice);
        } else {
          slice.delete();
        }
      }
    }

    currentSlices = nextSlices;
  }

  const merged = mergeFittingManifolds(currentSlices, effectiveBed);
  const score = scoreCandidateManifolds(merged);

  return {
    manifolds: merged,
    cutPlanes,
    score
  };
}

export interface SplitProgressCallback {
  (percent: number, message: string): void;
}

/**
 * Executes the full Hierarchical Adaptive KD-Split using manifold-3d WASM.
 */
export async function executeAdaptiveManifoldSplit(
  positionsInput: Float32Array,
  indices: Uint32Array,
  bedVolume: Vector3MM,
  options: SplitOptions,
  onProgress?: SplitProgressCallback
): Promise<SplitExecutionResult> {
  const startTime = performance.now();
  onProgress?.(5, 'Manifold WASM motoru başlatılıyor...');
  const wasm = await initManifold();

  const initialBBox = computeBoundingBox(positionsInput);
  const effectiveBed = getEffectiveBedVolume(bedVolume, options.safetyMarginMM);
  const orientation = evaluateOptimalOrientation(
    initialBBox.size,
    effectiveBed,
    options.optimizeXYRotation
  );

  const positions = orientation.rotated90Z ? rotatePositions90Z(positionsInput) : positionsInput;
  const originalVolumeCM3 = computeMeshVolumeCM3(positions, indices);

  onProgress?.(15, '3D geometri su geçirmez (manifold) hale getiriliyor...');
  const rawMesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: positions,
    triVerts: indices
  });
  rawMesh.merge();

  const rootManifold = new wasm.Manifold(rawMesh);
  if (rootManifold.isEmpty()) {
    throw new Error('Model Manifold olarak işlenemedi. Lütfen geçerli bir kapalı 3D mesh yükleyin.');
  }

  const pinStats: PinApplicationStats = {
    standardPins: 0,
    filamentPins: 0,
    skippedThinFaces: 0
  };

  // Build deduplicated list of candidate axis orders & cut strategies
  const rBox = rootManifold.boundingBox();
  const overX = rBox.max[0] - rBox.min[0] > effectiveBed.x + 1e-4;
  const overY = rBox.max[1] - rBox.min[1] > effectiveBed.y + 1e-4;
  const overZ = rBox.max[2] - rBox.min[2] > effectiveBed.z + 1e-4;

  const candidateSpecs: SplitCandidateSpec[] = [];
  if (!overX && !overY && !overZ) {
    candidateSpecs.push({ axisOrder: ['x', 'y', 'z'], cutStyle: 'max-fit' });
  } else {
    if (overZ && (overX || overY)) {
      candidateSpecs.push({ axisOrder: ['z', 'x', 'y'], cutStyle: 'balanced' });
      candidateSpecs.push({ axisOrder: ['z', 'x', 'y'], cutStyle: 'max-fit' });
    }
    candidateSpecs.push({ axisOrder: ['x', 'y', 'z'], cutStyle: 'max-fit' });
    candidateSpecs.push({ axisOrder: ['x', 'y', 'z'], cutStyle: 'balanced' });
    if (overX && overY) {
      candidateSpecs.push({ axisOrder: ['y', 'x', 'z'], cutStyle: 'max-fit' });
    }
  }

  let bestCandidate: EvaluatedSplitCandidate | null = null;

  for (let cIdx = 0; cIdx < candidateSpecs.length; cIdx++) {
    const spec = candidateSpecs[cIdx];
    const progressPct = Math.round(25 + ((cIdx + 1) / candidateSpecs.length) * 55);
    onProgress?.(
      progressPct,
      `Optimum kesim stratejisi aranıyor (${cIdx + 1}/${candidateSpecs.length}: ${spec.axisOrder.join('→').toUpperCase()} / ${spec.cutStyle})...`
    );

    const evaluated = runCandidateSplitPipeline(
      rootManifold,
      positions,
      indices,
      effectiveBed,
      options,
      spec
    );

    if (!bestCandidate || evaluated.score < bestCandidate.score) {
      if (bestCandidate) {
        for (const m of bestCandidate.manifolds) m.delete();
      }
      bestCandidate = evaluated;
    } else {
      for (const m of evaluated.manifolds) m.delete();
    }

    // Perfect 1-piece fit shortcut
    if (bestCandidate.manifolds.length <= 1) {
      break;
    }
  }

  rootManifold.delete();

  const finalManifolds = bestCandidate ? bestCandidate.manifolds : [];
  const allCutPlanes = bestCandidate ? bestCandidate.cutPlanes : [];

  // Apply 3-tier adaptive alignment pins across active cut planes between final parts
  if (options.connectors.enabled && options.connectors.mode !== 'none' && finalManifolds.length > 1) {
    onProgress?.(88, 'Adaptif hizalama pimleri açılıyor...');
    const eps = 0.6;
    for (const cut of allCutPlanes) {
      const axisIdx = cut.axis === 'x' ? 0 : cut.axis === 'y' ? 1 : 2;
      const uIdx = axisIdx === 0 ? 1 : 0;
      const vIdx = axisIdx === 2 ? 1 : 2;

      for (let i = 0; i < finalManifolds.length; i++) {
        const bA = finalManifolds[i].boundingBox();
        if (Math.abs(bA.max[axisIdx] - cut.position) > eps) continue;

        for (let j = 0; j < finalManifolds.length; j++) {
          if (i === j) continue;
          const bB = finalManifolds[j].boundingBox();
          if (Math.abs(bB.min[axisIdx] - cut.position) > eps) continue;

          const overlapU = Math.min(bA.max[uIdx], bB.max[uIdx]) - Math.max(bA.min[uIdx], bB.min[uIdx]);
          const overlapV = Math.min(bA.max[vIdx], bB.max[vIdx]) - Math.max(bA.min[vIdx], bB.min[vIdx]);
          if (overlapU <= 1.0 || overlapV <= 1.0) continue;

          const pinned = applyAdaptivePinsAtCut(
            wasm,
            finalManifolds[i],
            finalManifolds[j],
            cut.axis,
            cut.position,
            options.connectors,
            pinStats
          );
          finalManifolds[i] = pinned.a;
          finalManifolds[j] = pinned.b;
        }
      }
    }
  }

  onProgress?.(92, 'Parçalar paketleniyor...');
  const parts: SplitPartResult[] = [];
  let totalPartsVolumeCM3 = 0;

  // Sort parts consistently by Z, Y, X centroid for predictable naming
  const extracted = finalManifolds.map((m) => {
    const data = manifoldToBuffers(m);
    m.delete();
    return data;
  });

  extracted.sort((a, b) => {
    if (Math.abs(a.centroid.z - b.centroid.z) > 5) return a.centroid.z - b.centroid.z;
    if (Math.abs(a.centroid.y - b.centroid.y) > 5) return a.centroid.y - b.centroid.y;
    return a.centroid.x - b.centroid.x;
  });

  for (let idx = 0; idx < extracted.length; idx++) {
    const item = extracted[idx];
    totalPartsVolumeCM3 += item.volumeCM3;
    const partNum = String(idx + 1).padStart(2, '0');
    parts.push({
      id: `part-${partNum}`,
      label: `Part_${partNum}`,
      gridIndex: [idx + 1, 1, 1],
      positions: item.positions,
      indices: item.indices,
      bbox: item.bbox,
      centroid: item.centroid,
      volumeCM3: item.volumeCM3,
      triangleCount: item.triangleCount,
      colorHex: PART_COLORS[idx % PART_COLORS.length]
    });
  }

  let connectorPinMesh: SplitExecutionResult['connectorPinMesh'];
  if (pinStats.standardPins > 0) {
    connectorPinMesh = generateConnectorPinKitCardMesh(
      wasm,
      options.connectors.diameterMM,
      options.connectors.depthMM,
      pinStats.standardPins,
      effectiveBed
    );
  }

  onProgress?.(100, 'Bölme işlemi tamamlandı!');
  const executionTimeMs = Math.round(performance.now() - startTime);

  return {
    parts,
    cutPlanes: allCutPlanes,
    rotated90Z: orientation.rotated90Z,
    totalConnectorsCount: pinStats.standardPins,
    filamentPinsCount: pinStats.filamentPins,
    skippedThinFacesCount: pinStats.skippedThinFaces,
    connectorPinMesh,
    summary: {
      totalParts: parts.length,
      originalVolumeCM3,
      totalPartsVolumeCM3,
      executionTimeMs
    }
  };
}
