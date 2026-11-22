import { create } from 'zustand';
import printersData from '@shared/data/printers.json';
import type {
  PrinterProfile,
  RawMeshData,
  SplitExecutionResult,
  SplitOptions,
  Vector3MM
} from '@shared/types';
import { computeMeshVolumeCM3, scalePositions } from '../core/meshTransform';
import {
  evaluateOptimalOrientation,
  getEffectiveBedVolume
} from '../core/optimalPlanner';
import type { FilamentMaterial } from '../core/filamentEstimator';
import type { SplitWorkerRequest, SplitWorkerResponse } from '../workers/splitter.worker';

export const PRINTER_LIST = printersData as PrinterProfile[];
export const CUSTOM_PRINTER_ID = 'custom-printer';
export type WizardStep = 1 | 2 | 3 | 4;
export type UxiGLSeed = 'cupertino' | 'iris' | 'emerald' | 'coral';
export type ThemeMode = 'dark' | 'light';

interface AppState {
  currentStep: WizardStep;
  themeSeed: UxiGLSeed;
  themeMode: ThemeMode;

  rawMesh: RawMeshData | null;
  scaledPositions: Float32Array | null;
  targetSize: Vector3MM;
  scaleRatio: Vector3MM;
  lockAspectRatio: boolean;
  modelVolumeCM3: number;

  selectedPrinterId: string;
  customBuildVolume: Vector3MM;
  filamentMaterial: FilamentMaterial;
  infillPercent: number;

  splitOptions: SplitOptions;
  splitResult: SplitExecutionResult | null;
  isSplitting: boolean;
  splitProgress: { percent: number; message: string };
  splitError: string | null;

  explodeFactor: number;
  showCutPlanes: boolean;
  showBuildPlate: boolean;
  selectedPartId: string | null;

  setRawMesh: (mesh: RawMeshData) => void;
  clearModel: () => void;
  setTargetAxisMM: (axis: 'x' | 'y' | 'z', valueMM: number) => void;
  setUniformScalePercent: (percent: number) => void;
  applyScaleMultiplier: (factor: number) => void;
  resetScaleToOriginal: () => void;
  setLockAspectRatio: (locked: boolean) => void;

  setSelectedPrinterId: (id: string) => void;
  setCustomBuildVolume: (vol: Partial<Vector3MM>) => void;
  setFilamentMaterial: (material: FilamentMaterial) => void;
  setInfillPercent: (percent: number) => void;
  updateSplitOptions: (patch: Partial<SplitOptions>) => void;
  updateConnectorConfig: (patch: Partial<SplitOptions['connectors']>) => void;

  setExplodeFactor: (val: number) => void;
  setShowCutPlanes: (show: boolean) => void;
  setShowBuildPlate: (show: boolean) => void;
  setSelectedPartId: (id: string | null) => void;

  setCurrentStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  setThemeSeed: (seed: UxiGLSeed) => void;
  toggleThemeMode: () => void;

  getActivePrinter: () => PrinterProfile;
  getEstimatedPartCount: () => { parts: number; rotated90Z: boolean };
  runAutoSplit: () => void;
}

const DEFAULT_SPLIT_OPTIONS: SplitOptions = {
  safetyMarginMM: 5,
  minPieceThicknessMM: 20,
  optimizeXYRotation: true,
  adaptiveHierarchical: true,
  seamOptimizationWindowMM: 15,
  connectors: {
    enabled: true,
    mode: 'adaptive',
    diameterMM: 4.0,
    depthMM: 6.0,
    clearanceMM: 0.2,
    pinsPerFace: 1
  }
};

let activeWorker: Worker | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  currentStep: 1,
  themeSeed: 'cupertino',
  themeMode: 'dark',

  rawMesh: null,
  scaledPositions: null,
  targetSize: { x: 0, y: 0, z: 0 },
  scaleRatio: { x: 1, y: 1, z: 1 },
  lockAspectRatio: true,
  modelVolumeCM3: 0,

  selectedPrinterId: 'bambu-x1c',
  customBuildVolume: { x: 250, y: 250, z: 250 },
  filamentMaterial: 'PLA',
  infillPercent: 15,

  splitOptions: DEFAULT_SPLIT_OPTIONS,
  splitResult: null,
  isSplitting: false,
  splitProgress: { percent: 0, message: '' },
  splitError: null,

  explodeFactor: 0.35,
  showCutPlanes: true,
  showBuildPlate: true,
  selectedPartId: null,

  setRawMesh: (mesh) => {
    const volumeCM3 = computeMeshVolumeCM3(mesh.positions, mesh.indices);
    set({
      rawMesh: mesh,
      scaledPositions: new Float32Array(mesh.positions),
      targetSize: { ...mesh.originalSize },
      scaleRatio: { x: 1, y: 1, z: 1 },
      modelVolumeCM3: volumeCM3,
      splitResult: null,
      splitError: null,
      selectedPartId: null
    });
  },

  clearModel: () => {
    if (activeWorker) {
      activeWorker.terminate();
      activeWorker = null;
    }
    set({
      currentStep: 1,
      rawMesh: null,
      scaledPositions: null,
      targetSize: { x: 0, y: 0, z: 0 },
      scaleRatio: { x: 1, y: 1, z: 1 },
      modelVolumeCM3: 0,
      splitResult: null,
      isSplitting: false,
      splitError: null,
      selectedPartId: null
    });
  },

  setTargetAxisMM: (axis, valueMM) => {
    const { rawMesh, scaleRatio, lockAspectRatio } = get();
    if (!rawMesh || valueMM <= 0 || !Number.isFinite(valueMM)) return;

    const origAxis = Math.max(0.001, rawMesh.originalSize[axis]);
    const newRatio = valueMM / origAxis;

    const nextRatio: Vector3MM = lockAspectRatio
      ? { x: newRatio, y: newRatio, z: newRatio }
      : { ...scaleRatio, [axis]: newRatio };

    const nextTarget: Vector3MM = {
      x: rawMesh.originalSize.x * nextRatio.x,
      y: rawMesh.originalSize.y * nextRatio.y,
      z: rawMesh.originalSize.z * nextRatio.z
    };

    const nextPositions = scalePositions(rawMesh.positions, nextRatio);
    const nextVolume = computeMeshVolumeCM3(nextPositions, rawMesh.indices);

    set({
      scaleRatio: nextRatio,
      targetSize: nextTarget,
      scaledPositions: nextPositions,
      modelVolumeCM3: nextVolume,
      splitResult: null,
      splitError: null
    });
  },

  setUniformScalePercent: (percent) => {
    const { rawMesh } = get();
    if (!rawMesh || percent <= 0 || !Number.isFinite(percent)) return;
    const factor = percent / 100;
    const nextRatio = { x: factor, y: factor, z: factor };
    const nextTarget = {
      x: rawMesh.originalSize.x * factor,
      y: rawMesh.originalSize.y * factor,
      z: rawMesh.originalSize.z * factor
    };
    const nextPositions = scalePositions(rawMesh.positions, nextRatio);
    const nextVolume = computeMeshVolumeCM3(nextPositions, rawMesh.indices);

    set({
      scaleRatio: nextRatio,
      targetSize: nextTarget,
      scaledPositions: nextPositions,
      modelVolumeCM3: nextVolume,
      splitResult: null,
      splitError: null
    });
  },

  applyScaleMultiplier: (factor) => {
    const { rawMesh, scaleRatio } = get();
    if (!rawMesh || factor <= 0) return;
    const nextRatio: Vector3MM = {
      x: scaleRatio.x * factor,
      y: scaleRatio.y * factor,
      z: scaleRatio.z * factor
    };
    const nextTarget: Vector3MM = {
      x: rawMesh.originalSize.x * nextRatio.x,
      y: rawMesh.originalSize.y * nextRatio.y,
      z: rawMesh.originalSize.z * nextRatio.z
    };
    const nextPositions = scalePositions(rawMesh.positions, nextRatio);
    const nextVolume = computeMeshVolumeCM3(nextPositions, rawMesh.indices);

    set({
      scaleRatio: nextRatio,
      targetSize: nextTarget,
      scaledPositions: nextPositions,
      modelVolumeCM3: nextVolume,
      splitResult: null,
      splitError: null
    });
  },

  resetScaleToOriginal: () => {
    const { rawMesh } = get();
    if (!rawMesh) return;
    const nextPositions = new Float32Array(rawMesh.positions);
    const nextVolume = computeMeshVolumeCM3(nextPositions, rawMesh.indices);
    set({
      scaleRatio: { x: 1, y: 1, z: 1 },
      targetSize: { ...rawMesh.originalSize },
      scaledPositions: nextPositions,
      modelVolumeCM3: nextVolume,
      splitResult: null,
      splitError: null
    });
  },

  setLockAspectRatio: (locked) => set({ lockAspectRatio: locked }),

  setSelectedPrinterId: (id) =>
    set({ selectedPrinterId: id, splitResult: null, splitError: null }),

  setCustomBuildVolume: (vol) =>
    set((state) => ({
      customBuildVolume: { ...state.customBuildVolume, ...vol },
      splitResult: null,
      splitError: null
    })),

  setFilamentMaterial: (material) => set({ filamentMaterial: material }),
  setInfillPercent: (percent) => set({ infillPercent: Math.max(0, Math.min(100, percent)) }),

  updateSplitOptions: (patch) =>
    set((state) => ({
      splitOptions: { ...state.splitOptions, ...patch },
      splitResult: null
    })),

  updateConnectorConfig: (patch) =>
    set((state) => ({
      splitOptions: {
        ...state.splitOptions,
        connectors: { ...state.splitOptions.connectors, ...patch }
      },
      splitResult: null
    })),

  setExplodeFactor: (val) => set({ explodeFactor: val }),
  setShowCutPlanes: (show) => set({ showCutPlanes: show }),
  setShowBuildPlate: (show) => set({ showBuildPlate: show }),
  setSelectedPartId: (id) => set({ selectedPartId: id }),

  setCurrentStep: (step) => {
    const { rawMesh } = get();
    if (step > 1 && !rawMesh) return;
    set({ currentStep: step });
  },
  nextStep: () => {
    const { currentStep, rawMesh } = get();
    if (!rawMesh || currentStep >= 4) return;
    set({ currentStep: (currentStep + 1) as WizardStep });
  },
  prevStep: () => {
    const { currentStep } = get();
    if (currentStep <= 1) return;
    set({ currentStep: (currentStep - 1) as WizardStep });
  },
  setThemeSeed: (seed) => {
    document.documentElement.setAttribute('data-seed', seed);
    set({ themeSeed: seed });
  },
  toggleThemeMode: () => {
    const next: ThemeMode = get().themeMode === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    set({ themeMode: next });
  },

  getActivePrinter: () => {
    const { selectedPrinterId, customBuildVolume } = get();
    if (selectedPrinterId === CUSTOM_PRINTER_ID) {
      return {
        id: CUSTOM_PRINTER_ID,
        brand: 'Custom',
        model: 'Özel Tabla Boyutu',
        technology: 'FDM',
        buildVolume: customBuildVolume
      };
    }
    return (
      PRINTER_LIST.find((p) => p.id === selectedPrinterId) ?? PRINTER_LIST[0]
    );
  },

  getEstimatedPartCount: () => {
    const { rawMesh, targetSize, splitOptions } = get();
    if (!rawMesh) return { parts: 0, rotated90Z: false };
    const printer = get().getActivePrinter();
    const effective = getEffectiveBedVolume(
      printer.buildVolume,
      splitOptions.safetyMarginMM
    );
    const orientation = evaluateOptimalOrientation(
      targetSize,
      effective,
      splitOptions.optimizeXYRotation
    );
    return {
      parts: orientation.estimatedGridParts,
      rotated90Z: orientation.rotated90Z
    };
  },

  runAutoSplit: () => {
    const { rawMesh, scaledPositions, splitOptions, isSplitting } = get();
    if (!rawMesh || !scaledPositions || isSplitting) return;

    const printer = get().getActivePrinter();

    if (activeWorker) {
      activeWorker.terminate();
    }

    set({
      isSplitting: true,
      splitResult: null,
      splitError: null,
      splitProgress: { percent: 2, message: 'İşlem başlatılıyor...' }
    });

    const worker = new Worker(
      new URL('../workers/splitter.worker.ts', import.meta.url),
      { type: 'module' }
    );
    activeWorker = worker;

    const positionsCopy = new Float32Array(scaledPositions);
    const indicesCopy = new Uint32Array(rawMesh.indices);

    worker.onmessage = (e: MessageEvent<SplitWorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        set({ splitProgress: { percent: msg.percent, message: msg.message } });
      } else if (msg.type === 'done') {
        set({
          splitResult: msg.result,
          isSplitting: false,
          splitProgress: { percent: 100, message: 'Tamamlandı' },
          selectedPartId: null
        });
        worker.terminate();
        if (activeWorker === worker) activeWorker = null;
      } else if (msg.type === 'error') {
        set({
          isSplitting: false,
          splitError: msg.error
        });
        worker.terminate();
        if (activeWorker === worker) activeWorker = null;
      }
    };

    worker.onerror = (err) => {
      set({
        isSplitting: false,
        splitError: err.message || 'Worker beklenmeyen bir hatayla karşılaştı.'
      });
      worker.terminate();
      if (activeWorker === worker) activeWorker = null;
    };

    const payload: SplitWorkerRequest = {
      positions: positionsCopy,
      indices: indicesCopy,
      bedVolume: printer.buildVolume,
      options: splitOptions
    };

    worker.postMessage(payload, [positionsCopy.buffer, indicesCopy.buffer]);
  }
}));
