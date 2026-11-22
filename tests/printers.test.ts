import { describe, it, expect } from 'vitest';
import printers from '../src/shared/data/printers.json';
import type { PrinterProfile } from '../src/shared/types';

describe('printers.json database validation', () => {
  const list = printers as PrinterProfile[];

  it('contains at least 60 real 3D printer profiles across 10+ brands', () => {
    expect(list.length).toBeGreaterThanOrEqual(60);
    const brands = new Set(list.map((p) => p.brand));
    expect(brands.size).toBeGreaterThanOrEqual(10);
  });

  it('has unique IDs for every printer profile', () => {
    const ids = list.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('has valid positive buildVolume dimensions (50mm < dim <= 1000mm) and technology', () => {
    for (const printer of list) {
      expect(printer.id.trim().length).toBeGreaterThan(0);
      expect(printer.brand.trim().length).toBeGreaterThan(0);
      expect(printer.model.trim().length).toBeGreaterThan(0);
      expect(['FDM', 'SLA']).toContain(printer.technology);

      const { x, y, z } = printer.buildVolume;
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      expect(Number.isFinite(z)).toBe(true);
      expect(x).toBeGreaterThan(50);
      expect(y).toBeGreaterThan(50);
      expect(z).toBeGreaterThan(50);
      expect(x).toBeLessThanOrEqual(1000);
      expect(y).toBeLessThanOrEqual(1000);
      expect(z).toBeLessThanOrEqual(1000);
    }
  });
});
