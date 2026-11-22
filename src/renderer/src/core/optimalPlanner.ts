import type { CutPlane, SplitOptions, Vector3MM } from '@shared/types';

export interface OrientationDecision {
  rotated90Z: boolean;
  effectiveModelSize: Vector3MM;
  estimatedGridParts0: number;
  estimatedGridParts90: number;
  estimatedGridParts: number;
}

/**
 * Computes effective usable build volume after applying safety margin.
 */
export function getEffectiveBedVolume(
  bedVolume: Vector3MM,
  safetyMarginMM: number
): Vector3MM {
  const m = Math.max(0, safetyMarginMM);
  return {
    x: Math.max(20, bedVolume.x - 2 * m),
    y: Math.max(20, bedVolume.y - 2 * m),
    z: Math.max(20, bedVolume.z - m)
  };
}

/**
 * Evaluates 0° vs 90° Z-axis rotation to minimize total grid pieces (and maximize clearance on ties).
 */
export function evaluateOptimalOrientation(
  modelSize: Vector3MM,
  effectiveBed: Vector3MM,
  allowRotate90Z: boolean
): OrientationDecision {
  const eps = 1e-4;
  const nx0 = Math.max(1, Math.ceil((modelSize.x - eps) / effectiveBed.x));
  const ny0 = Math.max(1, Math.ceil((modelSize.y - eps) / effectiveBed.y));
  const nz = Math.max(1, Math.ceil((modelSize.z - eps) / effectiveBed.z));
  const parts0 = nx0 * ny0 * nz;

  if (!allowRotate90Z) {
    return {
      rotated90Z: false,
      effectiveModelSize: { ...modelSize },
      estimatedGridParts0: parts0,
      estimatedGridParts90: parts0,
      estimatedGridParts: parts0
    };
  }

  const nx90 = Math.max(1, Math.ceil((modelSize.y - eps) / effectiveBed.x));
  const ny90 = Math.max(1, Math.ceil((modelSize.x - eps) / effectiveBed.y));
  const parts90 = nx90 * ny90 * nz;

  let use90 = parts90 < parts0;
  if (parts90 === parts0) {
    const minSlack0 = Math.min(effectiveBed.x - modelSize.x / nx0, effectiveBed.y - modelSize.y / ny0);
    const minSlack90 = Math.min(effectiveBed.x - modelSize.y / nx90, effectiveBed.y - modelSize.x / ny90);
    if (minSlack90 > minSlack0 + 0.5) {
      use90 = true;
    }
  }

  return {
    rotated90Z: use90,
    effectiveModelSize: use90
      ? { x: modelSize.y, y: modelSize.x, z: modelSize.z }
      : { ...modelSize },
    estimatedGridParts0: parts0,
    estimatedGridParts90: parts90,
    estimatedGridParts: use90 ? parts90 : parts0
  };
}

/**
 * Estimates the cross-section perimeter/area proxy at a given axis-aligned plane coordinate
 * by summing intersection segment lengths of all triangles crossing the plane.
 */
export function estimateCrossSectionScore(
  positions: Float32Array,
  indices: Uint32Array,
  axisIndex: 0 | 1 | 2,
  planeCoord: number
): number {
  const uAxis = axisIndex === 0 ? 1 : 0;
  const vAxis = axisIndex === 2 ? 1 : 2;
  let totalSegmentLength = 0;

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    const d0 = positions[i0 + axisIndex] - planeCoord;
    const d1 = positions[i1 + axisIndex] - planeCoord;
    const d2 = positions[i2 + axisIndex] - planeCoord;

    const s0 = d0 >= 0;
    const s1 = d1 >= 0;
    const s2 = d2 >= 0;

    // Triangle does not cross the plane
    if (s0 === s1 && s1 === s2) {
      continue;
    }

    const ptsU: number[] = [];
    const ptsV: number[] = [];

    const checkEdge = (aIdx: number, bIdx: number, da: number, db: number): void => {
      if ((da >= 0) !== (db >= 0)) {
        const denom = da - db;
        const t = Math.abs(denom) < 1e-9 ? 0.5 : da / denom;
        ptsU.push(positions[aIdx + uAxis] + t * (positions[bIdx + uAxis] - positions[aIdx + uAxis]));
        ptsV.push(positions[aIdx + vAxis] + t * (positions[bIdx + vAxis] - positions[aIdx + vAxis]));
      }
    };

    checkEdge(i0, i1, d0, d1);
    checkEdge(i1, i2, d1, d2);
    checkEdge(i2, i0, d2, d0);

    if (ptsU.length >= 2) {
      const du = ptsU[1] - ptsU[0];
      const dv = ptsV[1] - ptsV[0];
      totalSegmentLength += Math.hypot(du, dv);
    }
  }

  return totalSegmentLength;
}

export type AxisCutStyle = 'max-fit' | 'balanced';

/**
 * Computes anti-sliver, seam-minimized cut planes along a single axis.
 * Supports both 'max-fit' (bed-filling / center-symmetric) and 'balanced' (equal-span) strategies.
 */
export function computeBalancedAxisCuts(
  minCoord: number,
  maxCoord: number,
  maxAllowedSpan: number,
  positions: Float32Array,
  indices: Uint32Array,
  axis: 'x' | 'y' | 'z',
  options: SplitOptions,
  depthLevel = 0,
  cutStyle: AxisCutStyle = 'max-fit'
): CutPlane[] {
  const span = maxCoord - minCoord;
  if (span <= maxAllowedSpan + 1e-4) {
    return [];
  }

  const pieceCount = Math.ceil((span - 1e-4) / maxAllowedSpan);
  if (pieceCount <= 1) {
    return [];
  }

  const axisIndex: 0 | 1 | 2 = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const normal: [number, number, number] =
    axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];

  const minTailSpan = Math.max(options.minPieceThicknessMM, maxAllowedSpan * 0.35);
  const nominalCuts: number[] = [];

  if (cutStyle === 'balanced') {
    const stepSpan = span / pieceCount;
    for (let i = 1; i < pieceCount; i++) {
      nominalCuts.push(minCoord + i * stepSpan);
    }
  } else if (pieceCount === 3) {
    // Center-Symmetric Max-Fit: place the full maxAllowedSpan piece in the center
    // so outer caps on curved/cylindrical models stay large and avoid tiny corner fragments.
    const center = (minCoord + maxCoord) * 0.5;
    const halfCenterSpan = Math.min(maxAllowedSpan * 0.5, span * 0.5 - minTailSpan * 0.5);
    const leftCut = center - halfCenterSpan;
    const rightCut = center + halfCenterSpan;
    if (leftCut - minCoord <= maxAllowedSpan + 1e-4 && maxCoord - rightCut <= maxAllowedSpan + 1e-4) {
      nominalCuts.push(leftCut, rightCut);
    } else {
      const capSpan = (span - maxAllowedSpan) * 0.5;
      nominalCuts.push(minCoord + capSpan, maxCoord - capSpan);
    }
  } else {
    let cursor = minCoord;
    for (let i = 0; i < pieceCount - 1; i++) {
      const remainingPieces = pieceCount - 1 - i;
      const remainingSpan = maxCoord - cursor;

      if (remainingPieces === 1) {
        const tailIfMax = remainingSpan - maxAllowedSpan;
        if (tailIfMax < minTailSpan) {
          nominalCuts.push(cursor + remainingSpan * 0.5);
        } else {
          nominalCuts.push(cursor + maxAllowedSpan);
        }
      } else {
        const minCut = maxCoord - remainingPieces * maxAllowedSpan;
        const targetStep = Math.max(minCut, cursor + maxAllowedSpan * 0.96);
        const clampedStep = Math.min(cursor + maxAllowedSpan, targetStep);
        nominalCuts.push(clampedStep);
        cursor = clampedStep;
      }
    }
  }

  const cuts: CutPlane[] = [];
  let prevCut = minCoord;

  for (let i = 0; i < nominalCuts.length; i++) {
    const nominalCoord = nominalCuts[i];
    const nextEnd = i + 1 < nominalCuts.length ? nominalCuts[i + 1] : maxCoord;

    const minValid = Math.max(
      nominalCoord - options.seamOptimizationWindowMM,
      prevCut + Math.min(options.minPieceThicknessMM, (nextEnd - prevCut) * 0.4),
      nextEnd - maxAllowedSpan
    );
    const maxValid = Math.min(
      nominalCoord + options.seamOptimizationWindowMM,
      prevCut + maxAllowedSpan,
      nextEnd - Math.min(options.minPieceThicknessMM, (nextEnd - prevCut) * 0.4)
    );

    let bestCoord = nominalCoord;
    let bestCrossScore = estimateCrossSectionScore(positions, indices, axisIndex, nominalCoord);
    let bestObjective = bestCrossScore;

    if (maxValid > minValid + 1.0) {
      const step = 2.0;
      for (let c = minValid; c <= maxValid + 1e-6; c += step) {
        const clamped = Math.min(c, maxValid);
        const crossScore = estimateCrossSectionScore(positions, indices, axisIndex, clamped);
        const objective = crossScore + 0.05 * Math.abs(clamped - nominalCoord);
        if (objective < bestObjective) {
          bestObjective = objective;
          bestCrossScore = crossScore;
          bestCoord = clamped;
        }
      }
    }

    cuts.push({
      id: `${axis}-${depthLevel}-${i + 1}`,
      axis,
      position: bestCoord,
      normal,
      crossSectionAreaMM2: bestCrossScore,
      depthLevel
    });

    prevCut = bestCoord;
  }

  return cuts;
}
