import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RawMeshData } from '@shared/types';
import { centerAndGroundPositions, computeBoundingBox } from './meshTransform';

function extractMergedGeometryFromObject(root: THREE.Object3D): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];
  root.updateMatrixWorld(true);

  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) {
        const cloned = mesh.geometry.clone();
        cloned.applyMatrix4(mesh.matrixWorld);
        // Normalize attributes to position-only before merging
        const posOnly = new THREE.BufferGeometry();
        const posAttr = cloned.getAttribute('position');
        if (posAttr) {
          posOnly.setAttribute('position', posAttr.clone());
          if (cloned.index) {
            posOnly.setIndex(cloned.index.clone());
          }
          const nonIndexed = posOnly.index ? posOnly.toNonIndexed() : posOnly;
          geometries.push(nonIndexed);
        }
      }
    }
  });

  if (geometries.length === 0) {
    throw new Error('Model dosyasında geçerli bir 3D mesh geometrisi bulunamadı.');
  }

  const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
  if (!merged) {
    throw new Error('Mesh geometrileri birleştirilemedi.');
  }
  return merged;
}

/**
 * Parses an STL, OBJ, or 3MF ArrayBuffer into indexed, centered, Z-grounded RawMeshData (mm).
 */
export function parseModelBuffer(fileName: string, buffer: ArrayBuffer): RawMeshData {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  let geometry: THREE.BufferGeometry;

  if (ext === 'stl') {
    const loader = new STLLoader();
    geometry = loader.parse(buffer);
  } else if (ext === 'obj') {
    const loader = new OBJLoader();
    const text = new TextDecoder().decode(buffer);
    const group = loader.parse(text);
    geometry = extractMergedGeometryFromObject(group);
  } else if (ext === '3mf') {
    const loader = new ThreeMFLoader();
    const group = loader.parse(buffer);
    geometry = extractMergedGeometryFromObject(group);
  } else {
    throw new Error(`Desteklenmeyen dosya formatı: .${ext} (STL, OBJ veya 3MF kullanın)`);
  }

  // Strip non-position attributes and weld duplicate vertices for watertight Manifold conversion
  const cleanGeo = new THREE.BufferGeometry();
  const posAttr = geometry.getAttribute('position');
  if (!posAttr || posAttr.count < 3) {
    throw new Error('Geçersiz veya boş 3D geometri.');
  }
  cleanGeo.setAttribute('position', posAttr);
  if (geometry.index) {
    cleanGeo.setIndex(geometry.index);
  }

  const indexedGeo = cleanGeo.index ? cleanGeo : mergeVertices(cleanGeo, 1e-4);
  const finalPosAttr = indexedGeo.getAttribute('position') as THREE.BufferAttribute;
  const finalIndex = indexedGeo.getIndex();

  if (!finalIndex || finalIndex.count < 3) {
    throw new Error('İndeksli üçgen yapısı oluşturulamadı.');
  }

  const rawPositions = new Float32Array(finalPosAttr.array.length);
  rawPositions.set(finalPosAttr.array as Float32Array);

  const positions = centerAndGroundPositions(rawPositions);
  const indices = new Uint32Array(finalIndex.array.length);
  indices.set(finalIndex.array);

  const bbox = computeBoundingBox(positions);

  return {
    fileName,
    positions,
    indices,
    originalSize: bbox.size,
    triangleCount: Math.floor(indices.length / 3)
  };
}
