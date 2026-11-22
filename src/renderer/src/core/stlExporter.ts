import { zipSync } from 'fflate';
import type { PrinterProfile, SplitExecutionResult } from '@shared/types';

/**
 * Serializes an indexed triangle mesh into a standard Binary STL Uint8Array.
 * Output size is strictly 84 + 50 * triangleCount bytes.
 */
export function meshToBinarySTL(
  positions: Float32Array,
  indices: Uint32Array,
  headerText = 'SpliD Binary STL'
): Uint8Array {
  const triCount = Math.floor(indices.length / 3);
  const bufferLength = 84 + triCount * 50;
  const buffer = new ArrayBuffer(bufferLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // 80-byte ASCII header
  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(headerText.slice(0, 79));
  bytes.set(headerBytes, 0);

  // 4-byte uint32 triangle count
  view.setUint32(80, triCount, true);

  let offset = 84;
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

    // Face normal = normalize((v1 - v0) x (v2 - v0))
    const ux = x1 - x0;
    const uy = y1 - y0;
    const uz = z1 - z0;
    const vx = x2 - x0;
    const vy = y2 - y0;
    const vz = z2 - z0;

    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-12) {
      nx /= len;
      ny /= len;
      nz /= len;
    }

    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);

    view.setFloat32(offset + 12, x0, true);
    view.setFloat32(offset + 16, y0, true);
    view.setFloat32(offset + 20, z0, true);

    view.setFloat32(offset + 24, x1, true);
    view.setFloat32(offset + 28, y1, true);
    view.setFloat32(offset + 32, z1, true);

    view.setFloat32(offset + 36, x2, true);
    view.setFloat32(offset + 40, y2, true);
    view.setFloat32(offset + 44, z2, true);

    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }

  return bytes;
}

export interface ExportFileEntry {
  fileName: string;
  data: Uint8Array;
}

/**
 * Generates all STL files, optional connector pin STL, manifest.json, and assembly README.
 */
export function buildExportFileList(
  result: SplitExecutionResult,
  printer: PrinterProfile
): ExportFileEntry[] {
  const files: ExportFileEntry[] = [];
  const encoder = new TextEncoder();

  for (const part of result.parts) {
    files.push({
      fileName: `${part.label}.stl`,
      data: meshToBinarySTL(part.positions, part.indices, `SpliD ${part.label}`)
    });
  }

  if (result.connectorPinMesh && result.totalConnectorsCount > 0) {
    files.push({
      fileName: result.connectorPinMesh.fileName,
      data: meshToBinarySTL(
        result.connectorPinMesh.positions,
        result.connectorPinMesh.indices,
        `SpliD Pin KitCard x${result.totalConnectorsCount}`
      )
    });
  }

  const manifest = {
    generatedBy: 'SpliD',
    printer: `${printer.brand} ${printer.model}`,
    buildVolumeMM: printer.buildVolume,
    rotated90Z: result.rotated90Z,
    totalParts: result.summary.totalParts,
    standardPins: result.totalConnectorsCount,
    filament175Pins: result.filamentPinsCount,
    skippedThinFaces: result.skippedThinFacesCount,
    parts: result.parts.map((p) => ({
      label: p.label,
      sizeMM: {
        x: Number(p.bbox.size.x.toFixed(2)),
        y: Number(p.bbox.size.y.toFixed(2)),
        z: Number(p.bbox.size.z.toFixed(2))
      },
      volumeCM3: Number(p.volumeCM3.toFixed(2)),
      triangleCount: p.triangleCount
    }))
  };

  files.push({
    fileName: 'manifest.json',
    data: encoder.encode(JSON.stringify(manifest, null, 2))
  });

  const readmeLines = [
    'SpliD — Automatic 3D Model Split Package',
    `Printer: ${printer.brand} ${printer.model} (${printer.buildVolume.x}x${printer.buildVolume.y}x${printer.buildVolume.z} mm)`,
    `Total Parts: ${result.summary.totalParts}`,
    `Standard Alignment Pins (KitCard): ${result.totalConnectorsCount}${
      result.connectorPinMesh ? ` (${result.connectorPinMesh.fileName})` : ''
    }`,
    `1.75mm Filament Pin Sockets: ${result.filamentPinsCount}`,
    `Skipped Thin-Wall Faces (<6mm): ${result.skippedThinFacesCount}`,
    '',
    'Parts List:'
  ];

  for (const p of result.parts) {
    readmeLines.push(
      `- ${p.label}.stl : ${p.bbox.size.x.toFixed(1)} x ${p.bbox.size.y.toFixed(1)} x ${p.bbox.size.z.toFixed(1)} mm (${p.volumeCM3.toFixed(1)} cm3)`
    );
  }

  files.push({
    fileName: 'README_ASSEMBLY.txt',
    data: encoder.encode(readmeLines.join('\n'))
  });

  return files;
}

/**
 * Packages all split STL files and assembly metadata into a single compressed ZIP archive.
 */
export function createSplitPackageZip(
  result: SplitExecutionResult,
  printer: PrinterProfile
): Uint8Array {
  const entries = buildExportFileList(result, printer);
  const zipInput: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    zipInput[entry.fileName] = entry.data;
  }
  return zipSync(zipInput, { level: 6 });
}
