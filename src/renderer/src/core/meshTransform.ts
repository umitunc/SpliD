import type { BoundingBoxMM, Vector3MM } from '@shared/types';

/**
 * Computes the axis-aligned bounding box of a flat Float32Array vertex buffer.
 */
export function computeBoundingBox(positions: Float32Array): BoundingBoxMM {
  if (positions.length < 3) {
    const zero = { x: 0, y: 0, z: 0 };
    return { min: { ...zero }, max: { ...zero }, size: { ...zero } };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    size: {
      x: maxX - minX,
      y: maxY - minY,
      z: maxZ - minZ
    }
  };
}

/**
 * Centers the mesh on X and Y around 0 and grounds the bottom at Z = 0.
 */
export function centerAndGroundPositions(positions: Float32Array): Float32Array {
  const bbox = computeBoundingBox(positions);
  const cx = (bbox.min.x + bbox.max.x) * 0.5;
  const cy = (bbox.min.y + bbox.max.y) * 0.5;
  const minZ = bbox.min.z;

  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = positions[i] - cx;
    out[i + 1] = positions[i + 1] - cy;
    out[i + 2] = positions[i + 2] - minZ;
  }
  return out;
}

/**
 * Scales vertex positions by (scale.x, scale.y, scale.z) while keeping X/Y centered at 0 and Z >= 0.
 */
export function scalePositions(positions: Float32Array, scale: Vector3MM): Float32Array {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = positions[i] * scale.x;
    out[i + 1] = positions[i + 1] * scale.y;
    out[i + 2] = positions[i + 2] * scale.z;
  }
  return centerAndGroundPositions(out);
}

/**
 * Rotates vertex positions +90 degrees around the Z axis (x' = -y, y' = x, z' = z).
 * Rigid rotation preserves triangle winding order.
 */
export function rotatePositions90Z(positions: Float32Array): Float32Array {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    out[i] = -y;
    out[i + 1] = x;
    out[i + 2] = z;
  }
  return centerAndGroundPositions(out);
}

/**
 * Computes closed-mesh volume in cubic centimeters (cm^3) using signed tetrahedron sums.
 */
export function computeMeshVolumeCM3(positions: Float32Array, indices: Uint32Array): number {
  let volumeMM3 = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    const x0 = positions[i0];
    const y0 = positions[i0 + 1];
    const z0 = positions[i0 + 2];

    const x1 = positions[i1];
    const y1 = positions[i1 + 1];
    const z1 = positions[i1 + 2];

    const x2 = positions[i2];
    const y2 = positions[i2 + 1];
    const z2 = positions[i2 + 2];

    const crossX = y1 * z2 - z1 * y2;
    const crossY = z1 * x2 - x1 * z2;
    const crossZ = x1 * y2 - y1 * x2;

    volumeMM3 += x0 * crossX + y0 * crossY + z0 * crossZ;
  }

  return Math.abs(volumeMM3 / 6) / 1000;
}
