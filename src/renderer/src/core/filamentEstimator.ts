export type FilamentMaterial = 'PLA' | 'PETG' | 'ABS' | 'TPU';

export const FILAMENT_DENSITY_G_CM3: Record<FilamentMaterial, number> = {
  PLA: 1.24,
  PETG: 1.27,
  ABS: 1.04,
  TPU: 1.21
};

/**
 * Estimates filament consumption in grams from mesh volume (cm^3),
 * accounting for typical perimeter walls (~15% shell) plus infill percentage.
 */
export function estimateFilamentGrams(
  volumeCM3: number,
  material: FilamentMaterial = 'PLA',
  infillPercent = 15
): number {
  if (volumeCM3 <= 0 || !Number.isFinite(volumeCM3)) return 0;
  const density = FILAMENT_DENSITY_G_CM3[material];
  // Typical FDM print: ~15% outer walls/top-bottom + remaining volume * (infill / 100)
  const clampedInfill = Math.max(0, Math.min(100, infillPercent)) / 100;
  const effectiveFillRatio = Math.min(1, 0.15 + 0.85 * clampedInfill);
  return volumeCM3 * effectiveFillRatio * density;
}
