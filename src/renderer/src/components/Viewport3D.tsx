import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, Grid, Html, OrbitControls } from '@react-three/drei';
import { Box, Layers } from 'lucide-react';
import { Slider } from '@/components/primitives';
import { estimateFilamentGrams } from '../core/filamentEstimator';
import { useAppStore } from '../store/useAppStore';

function buildThreeGeometry(positions: Float32Array, indices: Uint32Array): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

function RawModelMesh() {
  const { rawMesh, scaledPositions } = useAppStore();

  const geometry = useMemo(() => {
    if (!rawMesh || !scaledPositions) return null;
    return buildThreeGeometry(scaledPositions, rawMesh.indices);
  }, [rawMesh, scaledPositions]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#94A3B8" roughness={0.42} metalness={0.22} />
    </mesh>
  );
}

function SplitPartsGroup() {
  const { splitResult, explodeFactor, selectedPartId } = useAppStore();

  const partGeometries = useMemo(() => {
    if (!splitResult) return [];
    const modelCenter = new THREE.Vector3(0, 0, 0);
    if (splitResult.parts.length > 0) {
      for (const p of splitResult.parts) {
        modelCenter.x += p.centroid.x;
        modelCenter.y += p.centroid.y;
        modelCenter.z += p.centroid.z;
      }
      modelCenter.divideScalar(splitResult.parts.length);
    }

    return splitResult.parts.map((part) => {
      const geo = buildThreeGeometry(part.positions, part.indices);
      const offset = new THREE.Vector3(
        (part.centroid.x - modelCenter.x) * explodeFactor,
        (part.centroid.y - modelCenter.y) * explodeFactor,
        (part.centroid.z - modelCenter.z) * explodeFactor
      );
      return { part, geo, offset };
    });
  }, [splitResult, explodeFactor]);

  useEffect(() => {
    return () => {
      for (const item of partGeometries) {
        item.geo.dispose();
      }
    };
  }, [partGeometries]);

  return (
    <group>
      {partGeometries.map(({ part, geo, offset }) => {
        const isSelected = selectedPartId === part.id;
        const dimmed = selectedPartId !== null && !isSelected;
        return (
          <mesh
            key={part.id}
            geometry={geo}
            position={[offset.x, offset.y, offset.z]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              color={part.colorHex}
              roughness={0.38}
              metalness={0.18}
              transparent={dimmed}
              opacity={dimmed ? 0.25 : 1}
              emissive={isSelected ? part.colorHex : '#000000'}
              emissiveIntensity={isSelected ? 0.22 : 0}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function BuildVolumeBox() {
  const { showBuildPlate, themeMode, getActivePrinter } = useAppStore();
  const printer = getActivePrinter();
  const { x, y, z } = printer.buildVolume;
  const isDark = themeMode === 'dark';

  const edgesGeo = useMemo(() => {
    const box = new THREE.BoxGeometry(x, y, z);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [x, y, z]);

  useEffect(() => {
    return () => {
      edgesGeo.dispose();
    };
  }, [edgesGeo]);

  if (!showBuildPlate) return null;

  const badgeClass = `pointer-events-none select-none whitespace-nowrap rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold backdrop-blur-sm ${
    isDark
      ? 'border-sky-400/35 bg-slate-950/75 text-sky-300'
      : 'border-sky-600/30 bg-white/80 text-sky-700'
  }`;

  return (
    <group position={[0, 0, z * 0.5]}>
      <lineSegments geometry={edgesGeo}>
        <lineBasicMaterial color="#38BDF8" transparent opacity={0.45} />
      </lineSegments>
      <mesh position={[0, 0, -z * 0.5 + 0.1]}>
        <planeGeometry args={[x, y]} />
        <meshBasicMaterial color="#0EA5E9" transparent opacity={0.06} side={THREE.DoubleSide} />
      </mesh>

      {/* Width (X) - front edge of build plate */}
      <Html position={[0, -y * 0.5 - 12, -z * 0.5 + 1]} center>
        <div className={badgeClass}>W (X): {x} mm</div>
      </Html>

      {/* Depth (Y) - right edge of build plate */}
      <Html position={[x * 0.5 + 14, 0, -z * 0.5 + 1]} center>
        <div className={badgeClass}>D (Y): {y} mm</div>
      </Html>

      {/* Height (Z) - front-right vertical edge */}
      <Html position={[x * 0.5 + 14, -y * 0.5, 0]} center>
        <div className={badgeClass}>H (Z): {z} mm</div>
      </Html>
    </group>
  );
}

export function Viewport3D() {
  const {
    rawMesh,
    targetSize,
    modelVolumeCM3,
    filamentMaterial,
    infillPercent,
    splitResult,
    explodeFactor,
    themeMode,
    setExplodeFactor,
    getActivePrinter
  } = useAppStore();
  const isDark = themeMode === 'dark';
  const printer = getActivePrinter();
  const estimatedGrams = estimateFilamentGrams(modelVolumeCM3, filamentMaterial, infillPercent);

  return (
    <div className="relative flex-1">
      <Canvas
        shadows
        camera={{ position: [280, 260, 320], fov: 42, near: 1, far: 10000 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={[isDark ? '#0B0F17' : '#E8EEF5']} />
        <ambientLight intensity={isDark ? 0.65 : 0.9} />
        <directionalLight position={[300, 500, 300]} intensity={1.15} castShadow />
        <directionalLight position={[-300, 200, -300]} intensity={0.45} color="#38BDF8" />

        <Grid
          args={[1000, 1000]}
          cellSize={10}
          cellThickness={0.5}
          cellColor={isDark ? '#1E293B' : '#CBD5E1'}
          sectionSize={50}
          sectionThickness={1}
          sectionColor={isDark ? '#334155' : '#94A3B8'}
          fadeDistance={900}
          infiniteGrid
        />

        {/* 3D Printing Z-up coordinate frame mapped cleanly to Three.js Y-up */}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <BuildVolumeBox />
          {splitResult ? <SplitPartsGroup /> : <RawModelMesh />}
        </group>

        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
        <GizmoHelper alignment="top-right" margin={[72, 72]}>
          <GizmoViewport axisColors={['#F87171', '#34D399', '#38BDF8']} labelColor="white" />
        </GizmoHelper>
      </Canvas>

      {/* Empty state overlay */}
      {!rawMesh && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="uxigl-glass-clear rounded-2xl px-6 py-5 text-center">
            <Box className="uxigl-accent-text mx-auto mb-2 h-8 w-8" />
            <p className="uxigl-text-primary text-sm font-semibold">
              Load a 3D model from Step 1
            </p>
            <p className="uxigl-text-muted mt-1 text-xs">
              STL, OBJ, or 3MF files are automatically measured and split into the fewest possible parts.
            </p>
          </div>
        </div>
      )}

      {/* Exploded View slider bar after splitting */}
      {splitResult && (
        <div className="uxigl-glass-clear absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full px-5 py-2.5">
          <Layers className="uxigl-accent-text h-4 w-4 shrink-0" />
          <span className="uxigl-text-primary shrink-0 text-xs font-semibold">
            Exploded View
          </span>
          <Slider
            min={0}
            max={1.5}
            step={0.02}
            value={explodeFactor}
            onChange={setExplodeFactor}
            className="w-40"
          />
          <span className="uxigl-accent-text w-10 text-right font-mono text-xs font-bold">
            {Math.round(explodeFactor * 100)}%
          </span>
        </div>
      )}

      {/* Bottom-right status pill (printer or active model info) */}
      <div className="pointer-events-none absolute bottom-4 right-4 text-xs">
        {rawMesh ? (
          <div className="uxigl-glass-clear flex items-center gap-2.5 rounded-full px-3.5 py-1.5">
            <span className="uxigl-text-primary max-w-[160px] truncate font-medium">
              {rawMesh.fileName}
            </span>
            <span className="uxigl-text-muted">•</span>
            <span className="uxigl-accent-text font-mono font-semibold">
              {targetSize.x.toFixed(1)} × {targetSize.y.toFixed(1)} × {targetSize.z.toFixed(1)} mm
            </span>
            <span className="uxigl-text-muted">•</span>
            <span className="uxigl-text-secondary font-mono">{modelVolumeCM3.toFixed(1)} cm³</span>
            <span className="uxigl-text-muted">•</span>
            <span className="font-mono font-semibold text-emerald-500">
              ~{estimatedGrams.toFixed(0)} g {filamentMaterial}
            </span>
          </div>
        ) : (
          <div className="uxigl-glass-clear rounded-full px-3.5 py-1.5">
            <span className="uxigl-text-muted">
              Build Plate:{' '}
              <strong className="uxigl-text-primary">
                {printer.brand} {printer.model}
              </strong>{' '}
              ({printer.buildVolume.x}×{printer.buildVolume.y}×{printer.buildVolume.z} mm)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
