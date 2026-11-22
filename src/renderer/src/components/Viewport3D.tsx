import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, Grid, OrbitControls } from '@react-three/drei';
import { Box, Layers } from 'lucide-react';
import { Slider } from '@/components/primitives';
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
  const { showBuildPlate, getActivePrinter } = useAppStore();
  const printer = getActivePrinter();
  const { x, y, z } = printer.buildVolume;

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

  return (
    <group position={[0, 0, z * 0.5]}>
      <lineSegments geometry={edgesGeo}>
        <lineBasicMaterial color="#38BDF8" transparent opacity={0.45} />
      </lineSegments>
      <mesh position={[0, 0, -z * 0.5 + 0.1]}>
        <planeGeometry args={[x, y]} />
        <meshBasicMaterial color="#0EA5E9" transparent opacity={0.06} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function Viewport3D() {
  const { rawMesh, splitResult, explodeFactor, themeMode, setExplodeFactor } = useAppStore();
  const isDark = themeMode === 'dark';

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
              Adım 1'den bir 3D model yükleyin
            </p>
            <p className="uxigl-text-muted mt-1 text-xs">
              STL, OBJ veya 3MF dosyaları otomatik ölçülür ve sihirbaz adımlarıyla en az parçaya bölünür.
            </p>
          </div>
        </div>
      )}

      {/* Exploded View slider bar after splitting */}
      {splitResult && (
        <div className="uxigl-glass-clear absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full px-5 py-2.5">
          <Layers className="uxigl-accent-text h-4 w-4 shrink-0" />
          <span className="uxigl-text-primary shrink-0 text-xs font-semibold">
            Patlatılmış Görünüm
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
    </div>
  );
}
