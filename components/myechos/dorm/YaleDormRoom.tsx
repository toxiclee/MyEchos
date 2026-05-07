"use client";

import { Html, OrbitControls, RoundedBox, Text, useCursor, useGLTF, useTexture } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import { MemoryPaperNote } from "../MemoryPaperNote";
import { ALL_MEMORY_IDS, MEMORY_BY_ID, type MemoryEcho, type MemoryId } from "./memoryData";

/** Wall plane centers at ±HALF (meters). */
const ROOM_HALF = 2.095;
/** Small gap so meshes don’t z-fight with wall planes; keeps props visually flush. */
const ROOM_WALL_INSET = 0.022;
/** Soft front limit (no solid wall mesh — keeps layout tidy). */
const ROOM_FRONT_Z = 1.86;
/** Back wall plane Z (same as `CreamRoomShell`). */
const BACK_WALL_Z = -ROOM_HALF;
/**
 * Preferred Z for flat wall-mounted props (center), slightly inside the room.
 * Snapping pulls wall items to this line so frames sit flush.
 */
const WALL_MOUNT_Z = BACK_WALL_Z + 0.052;

export type PlacementKind = "floor" | "wallBack" | "surface";

export type RoomObjectPose = {
  x: number;
  y: number;
  z: number;
  ry: number;
};

/**
 * Horizontal clamp: `r` = clearance from ±X walls; `backHalfDepth` = half-depth along -Z
 * (back of furniture toward the rear wall) so tall pieces can sit flush without a huge gap.
 */
function clampXZRoomCenter(x: number, z: number, r: number, backHalfDepth = r) {
  const minX = -ROOM_HALF + ROOM_WALL_INSET + r;
  const maxX = ROOM_HALF - ROOM_WALL_INSET - r;
  const minZ = -ROOM_HALF + ROOM_WALL_INSET + backHalfDepth;
  const maxZ = ROOM_FRONT_Z - r;
  return {
    x: THREE.MathUtils.clamp(x, minX, maxX),
    z: THREE.MathUtils.clamp(z, minZ, maxZ),
  };
}

/** L-desk slab anchor — keep in sync with `KallaxWorkstation` RoundedBox top. */
const KALLAX_DESK = {
  D: 0.37,
  deskL: 1.08,
  deskW: 0.78,
  deskY: 0.74,
  topHalfH: 0.021,
  topLift: 0.004,
} as const;

function deskSurfaceYFromDeskBase(deskBaseY: number): number {
  return deskBaseY + KALLAX_DESK.deskY + KALLAX_DESK.topLift + KALLAX_DESK.topHalfH;
}

/** Desk slab height when the desk pivot sits on the floor (y=0). */
const DESK_SURFACE_Y = deskSurfaceYFromDeskBase(0);

const DEFAULT_ROOM_LAYOUT: Record<MemoryId, RoomObjectPose> = {
  bed: { x: 1.38, y: 0, z: -0.28, ry: 0 },
  desk: { x: -0.82, y: 0, z: -1.34, ry: 0 },
  openCloset: { x: -1.28, y: 0, z: -1.84, ry: 0.18 },
  wallMemory1: { x: -0.62, y: 1.4, z: WALL_MOUNT_Z, ry: 0 },
  wallMemory2: { x: 0.12, y: 1.43, z: WALL_MOUNT_Z, ry: 0 },
  wallMemory3: { x: 0.68, y: 1.36, z: WALL_MOUNT_Z, ry: 0 },
  window: { x: ROOM_HALF - 0.03, y: 1.25, z: -0.56, ry: -Math.PI / 2 },
  cableNest: { x: 0.22, y: DESK_SURFACE_Y + 0.002, z: -1.52, ry: 0 },
  monitor: { x: -0.14, y: DESK_SURFACE_Y, z: -1.52, ry: 0 },
  keyboard: { x: -0.1, y: DESK_SURFACE_Y + 0.002, z: -1.1, ry: 0 },
  guitar: { x: -1.9, y: 0, z: -1.38, ry: 0.12 },
  hoodie: { x: -0.07, y: 0.44, z: -0.54, ry: 0 },
  photoFrame: { x: -1.48, y: 1.48, z: WALL_MOUNT_Z, ry: 0 },
  deskLamp: { x: -0.44, y: DESK_SURFACE_Y, z: -1.24, ry: 0 },
  mirror: { x: 0.18, y: DESK_SURFACE_Y, z: -1.22, ry: 0 },
  legoSouvenirs: { x: 0.14, y: DESK_SURFACE_Y + 0.003, z: -1.28, ry: 0 },
  /** Floor buddy near the desk leg. */
  shidizai: { x: -0.4, y: 0, z: -0.92, ry: 0.38 },
  sofa: { x: 1.06, y: 0, z: -1.06, ry: -0.16 },
  wardrobe: { x: -1.64, y: 0, z: -1.865, ry: 0 },
  stickyWall: { x: -1.02, y: 1.31, z: WALL_MOUNT_Z, ry: 0 },
  chair: { x: -0.07, y: 0, z: -0.58, ry: 0.92 },
};

const PROP_PLACEMENT: Record<MemoryId, PlacementKind> = {
  bed: "floor",
  desk: "floor",
  openCloset: "floor",
  wallMemory1: "wallBack",
  wallMemory2: "wallBack",
  wallMemory3: "wallBack",
  window: "surface",
  cableNest: "surface",
  monitor: "surface",
  keyboard: "surface",
  guitar: "floor",
  hoodie: "surface",
  photoFrame: "wallBack",
  deskLamp: "surface",
  mirror: "surface",
  legoSouvenirs: "surface",
  shidizai: "floor",
  sofa: "floor",
  wardrobe: "floor",
  stickyWall: "wallBack",
  chair: "floor",
};

/** Extra -Z half-depth for flush back-wall clamp (else uses collisionRadius). */
const PROP_BACK_HALF: Partial<Record<MemoryId, number>> = {
  wardrobe: 0.23,
  openCloset: 0.2,
  desk: 0.34,
  bed: 0.92,
  guitar: 0.08,
  sofa: 0.48,
  chair: 0.22,
};

const PROP_SURFACE_Y: Partial<Record<MemoryId, readonly [number, number]>> = {
  hoodie: [0.26, 0.58],
  window: [0.95, 1.9],
};

function snapCommittedPose(
  id: MemoryId,
  x: number,
  y: number,
  z: number,
  ry: number,
  placement: PlacementKind,
  r: number,
  backHalfDepth: number,
): RoomObjectPose {
  if (placement === "floor") {
    const c = clampXZRoomCenter(x, z, r, backHalfDepth);
    return { x: c.x, y: 0, z: c.z, ry };
  }
  if (placement === "wallBack") {
    const bh = Math.min(backHalfDepth, 0.07);
    const c = clampXZRoomCenter(x, z, r, bh);
    let zz = Math.abs(c.z - WALL_MOUNT_Z) < 0.42 ? WALL_MOUNT_Z : c.z;
    const c2 = clampXZRoomCenter(x, zz, r, bh);
    const cy = THREE.MathUtils.clamp(y, 0.72, 2.35);
    return { x: c2.x, y: cy, z: c2.z, ry };
  }
  const c = clampXZRoomCenter(x, z, r, backHalfDepth);
  const [ymin, ymax] = PROP_SURFACE_Y[id] ?? [0.7, 0.95];
  const cy = THREE.MathUtils.clamp(y, ymin, ymax);
  return { x: c.x, y: cy, z: c.z, ry };
}

function cloneDefaultLayout(): Record<MemoryId, RoomObjectPose> {
  return Object.fromEntries(
    ALL_MEMORY_IDS.map((id) => [id, { ...DEFAULT_ROOM_LAYOUT[id] }]),
  ) as Record<MemoryId, RoomObjectPose>;
}

/** Arrow keys orbit the camera (same feel as dragging). Disabled while typing on the desk keyboard. */
function ArrowKeyOrbitRotate({ keyboardFocused }: { keyboardFocused: boolean }) {
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (keyboardFocused) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const controls = get().controls as unknown as
        | {
            enabled: boolean;
            getAzimuthalAngle: () => number;
            getPolarAngle: () => number;
            setAzimuthalAngle: (v: number) => void;
            setPolarAngle: (v: number) => void;
            minAzimuthAngle: number;
            maxAzimuthAngle: number;
            minPolarAngle: number;
            maxPolarAngle: number;
          }
        | null
        | undefined;
      if (!controls?.enabled) return;

      const step = 0.048 * (e.shiftKey ? 1.65 : 1);
      let handled = false;

      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        const az = controls.getAzimuthalAngle();
        const next = az + (e.code === "ArrowLeft" ? step : -step);
        controls.setAzimuthalAngle(
          THREE.MathUtils.clamp(next, controls.minAzimuthAngle, controls.maxAzimuthAngle),
        );
        handled = true;
      } else if (e.code === "ArrowUp" || e.code === "ArrowDown") {
        const pol = controls.getPolarAngle();
        const next = pol + (e.code === "ArrowUp" ? -step : step);
        controls.setPolarAngle(
          THREE.MathUtils.clamp(next, controls.minPolarAngle, controls.maxPolarAngle),
        );
        handled = true;
      }

      if (handled) {
        e.preventDefault();
        invalidate();
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [get, invalidate, keyboardFocused]);

  return null;
}

/** Large window on +X wall — soft daylight; cream curtains (tap to open / close). */
function BedWallWindow({
  curtainBlendRef,
  onToggleCurtains,
}: {
  curtainBlendRef: MutableRefObject<number>;
  onToggleCurtains: () => void;
}) {
  const wx = 2.082;
  const wy = 1.12;
  const wz = -0.28;
  const fw = 1.22;
  const fh = 0.9;
  const frameT = 0.042;
  const leftG = useRef<THREE.Group>(null);
  const rightG = useRef<THREE.Group>(null);
  const skyRef = useRef<THREE.MeshStandardMaterial>(null);
  const [cordHover, setCordHover] = useState(false);
  const [panelHover, setPanelHover] = useState(false);
  useCursor(cordHover || panelHover);

  const onTap = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onToggleCurtains();
  }, [onToggleCurtains]);

  useFrame(() => {
    const b = curtainBlendRef.current;
    const t = performance.now() * 0.001;
    const sway = Math.sin(t * 0.34) * 0.022 * (0.35 + b * 0.65);
    if (leftG.current) {
      const xl = THREE.MathUtils.lerp(-0.14, -0.58, b);
      leftG.current.position.x = xl + sway;
      leftG.current.rotation.y = THREE.MathUtils.lerp(0.02, 0.16, b);
    }
    if (rightG.current) {
      const xr = THREE.MathUtils.lerp(0.14, 0.58, b);
      rightG.current.position.x = xr - sway;
      rightG.current.rotation.y = THREE.MathUtils.lerp(-0.02, -0.16, b);
    }
    if (skyRef.current) {
      skyRef.current.emissiveIntensity = THREE.MathUtils.lerp(0.14, 0.58, b);
    }
  });

  const ch = fh - frameT * 2 - 0.08;

  return (
    <group position={[wx, wy, wz]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh position={[0, 0, 0.008]} receiveShadow>
        <planeGeometry args={[fw - frameT * 2, fh - frameT * 2]} />
        <meshStandardMaterial
          ref={skyRef}
          color="#f6f8fc"
          roughness={0.62}
          metalness={0}
          emissive="#fff6e4"
          emissiveIntensity={0.45}
        />
      </mesh>
      <mesh position={[0, (fh - frameT) / 2, 0]}>
        <boxGeometry args={[fw, frameT, 0.024]} />
        <meshStandardMaterial color="#f2ebe2" roughness={0.52} metalness={0.02} />
      </mesh>
      <mesh position={[0, -(fh - frameT) / 2, 0]}>
        <boxGeometry args={[fw, frameT, 0.024]} />
        <meshStandardMaterial color="#f2ebe2" roughness={0.52} metalness={0.02} />
      </mesh>
      <mesh position={[(fw - frameT) / 2, 0, 0]}>
        <boxGeometry args={[frameT, fh, 0.024]} />
        <meshStandardMaterial color="#f2ebe2" roughness={0.52} metalness={0.02} />
      </mesh>
      <mesh position={[-(fw - frameT) / 2, 0, 0]}>
        <boxGeometry args={[frameT, fh, 0.024]} />
        <meshStandardMaterial color="#f2ebe2" roughness={0.52} metalness={0.02} />
      </mesh>

      <mesh position={[0, -fh / 2 - 0.026, 0.05]} castShadow receiveShadow>
        <boxGeometry args={[fw + 0.08, 0.032, 0.1]} />
        <meshStandardMaterial color="#ebe3d8" roughness={0.68} metalness={0} />
      </mesh>

      <group ref={leftG} position={[-fw * 0.22, 0, 0.04]}>
        <mesh
          castShadow
          onPointerDown={onTap}
          onPointerOver={() => setPanelHover(true)}
          onPointerOut={() => setPanelHover(false)}
        >
          <planeGeometry args={[0.16, ch, 1, 10]} />
          <meshStandardMaterial
            color="#f0e8dc"
            roughness={0.9}
            metalness={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
      <group ref={rightG} position={[fw * 0.22, 0, 0.04]}>
        <mesh
          castShadow
          onPointerDown={onTap}
          onPointerOver={() => setPanelHover(true)}
          onPointerOut={() => setPanelHover(false)}
        >
          <planeGeometry args={[0.16, ch, 1, 10]} />
          <meshStandardMaterial
            color="#ede6da"
            roughness={0.9}
            metalness={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      <group
        position={[0, -fh / 2 + 0.14, 0.07]}
        onPointerDown={onTap}
        onPointerOver={() => setCordHover(true)}
        onPointerOut={() => setCordHover(false)}
      >
        <mesh position={[0, -0.05, 0]}>
          <cylinderGeometry args={[0.014, 0.014, 0.1, 10]} />
          <meshStandardMaterial color="#d4c8b8" roughness={0.65} metalness={0.08} />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <sphereGeometry args={[0.022, 10, 8]} />
          <meshStandardMaterial
            color="#c9b8a4"
            roughness={0.45}
            metalness={0.12}
            emissive="#f5ebe0"
            emissiveIntensity={cordHover ? 0.12 : 0.04}
          />
        </mesh>
      </group>
    </group>
  );
}

/** Bright cream / warm ivory shell — no dark pattern. */
function CreamRoomShell() {
  const wall = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f7f2ea",
        roughness: 0.88,
        metalness: 0.02,
      }),
    [],
  );
  const ceiling = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#faf7f2",
        roughness: 0.92,
        metalness: 0,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      wall.dispose();
      ceiling.dispose();
    };
  }, [wall, ceiling]);

  return (
    <>
      <mesh position={[0, 1.28, -2.095]} receiveShadow material={wall}>
        <planeGeometry args={[4.2, 2.65]} />
      </mesh>
      <mesh position={[-2.095, 1.28, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow material={wall}>
        <planeGeometry args={[4.2, 2.65]} />
      </mesh>
      <mesh position={[2.095, 1.28, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow material={wall}>
        <planeGeometry args={[4.2, 2.65]} />
      </mesh>
      <mesh position={[0, 2.605, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={ceiling}>
        <planeGeometry args={[4.2, 4.2]} />
      </mesh>
    </>
  );
}

function MonitorHeroScreen({ url = "/wallpaper-room.png" }: { url?: string }) {
  const texture = useTexture(url);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  useLayoutEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    const img = texture.image as HTMLImageElement | undefined;
    if (!img?.naturalWidth) return;
    const screenAspect = 0.48 / 0.3;
    const imgAspect = img.naturalWidth / img.naturalHeight;
    if (imgAspect > screenAspect) {
      const w = screenAspect / imgAspect;
      texture.repeat.set(w, 1);
      texture.offset.set((1 - w) / 2, 0);
    } else {
      const h = imgAspect / screenAspect;
      texture.repeat.set(1, h);
      texture.offset.set(0, (1 - h) / 2);
    }
    texture.needsUpdate = true;
  }, [texture]);

  useFrame(() => {
    const m = matRef.current;
    if (!m) return;
    const t = performance.now() * 0.001;
    const flicker =
      0.052 +
      Math.sin(t * 2.05) * 0.014 +
      Math.sin(t * 7.4) * 0.006 +
      Math.sin(t * 13.1) * 0.0035;
    m.emissiveIntensity = flicker;
  });

  return (
    <mesh position={[0, 0.21, 0.008]} renderOrder={2}>
      <planeGeometry args={[0.48, 0.3]} />
      <meshStandardMaterial
        ref={matRef}
        map={texture}
        roughness={0.52}
        metalness={0.05}
        emissive="#fff2e0"
        emissiveIntensity={0.06}
      />
    </mesh>
  );
}

function CeilingPaperLanterns({ lampOn }: { lampOn: boolean }) {
  const warm = "#fff4e6";
  const positions: [number, number, number][] = [
    [-0.55, 2.42, -0.35],
    [0.45, 2.48, 0.05],
    [1.15, 2.44, -0.55],
  ];
  return (
    <group>
      {positions.map((p, i) => (
        <group key={i} position={p}>
          <mesh castShadow>
            <sphereGeometry args={[0.17, 24, 20]} />
            <meshPhysicalMaterial
              color="#fdfaf6"
              roughness={0.35}
              metalness={0}
              transmission={0.55}
              thickness={0.2}
              transparent
              opacity={0.92}
              emissive={warm}
              emissiveIntensity={lampOn ? 0.35 : 0.08}
            />
          </mesh>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.02, 0.028, 0.1, 8]} />
            <meshStandardMaterial color="#e8e4dc" roughness={0.6} />
          </mesh>
          <pointLight
            position={[0, -0.04, 0]}
            intensity={lampOn ? 1.15 : 0.22}
            distance={5.5}
            decay={2}
            color={warm}
          />
        </group>
      ))}
    </group>
  );
}

/** Carcass only — doors are interactive overlay so clicks don’t fight drag. */
function TallWardrobeCarcass() {
  const cream = "#f3eee6";
  const inset = "#e8e2d8";
  const kick = "#c9bfb2";

  return (
    <group>
      <mesh receiveShadow position={[0, 0.034, 0.04]}>
        <boxGeometry args={[0.62, 0.068, 0.44]} />
        <meshStandardMaterial color={kick} roughness={0.88} metalness={0.02} />
      </mesh>

      <RoundedBox args={[0.58, 1.82, 0.46]} radius={0.022} smoothness={4} castShadow receiveShadow position={[0, 0.958, 0]}>
        <meshPhysicalMaterial
          color={cream}
          roughness={0.62}
          metalness={0.03}
          clearcoat={0.08}
          clearcoatRoughness={0.55}
        />
      </RoundedBox>

      <mesh position={[0, 1.02, 0.232]} receiveShadow>
        <planeGeometry args={[0.52, 1.58]} />
        <meshStandardMaterial color={inset} roughness={0.82} metalness={0} polygonOffset polygonOffsetFactor={1} />
      </mesh>

      <mesh position={[0, 1.02, 0.238]}>
        <boxGeometry args={[0.012, 1.5, 0.006]} />
        <meshStandardMaterial color="#dcd3c8" roughness={0.9} metalness={0} />
      </mesh>

      <RoundedBox args={[0.6, 0.038, 0.48]} radius={0.012} smoothness={2} castShadow position={[0, 1.887, 0]}>
        <meshStandardMaterial color="#ebe4da" roughness={0.58} metalness={0.02} />
      </RoundedBox>
    </group>
  );
}

/** Hinged doors — tap panel or handle to open/close (smooth lerp). */
function TallWardrobeDoorsInteractive({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const leftRef = useRef<THREE.Group>(null);
  const rightRef = useRef<THREE.Group>(null);
  const [hoverL, setHoverL] = useState(false);
  const [hoverR, setHoverR] = useState(false);
  useCursor(hoverL || hoverR);

  useFrame(() => {
    const tL = open ? -0.92 : 0;
    const tR = open ? 0.92 : 0;
    if (leftRef.current) {
      leftRef.current.rotation.y = THREE.MathUtils.lerp(leftRef.current.rotation.y, tL, 0.16);
    }
    if (rightRef.current) {
      rightRef.current.rotation.y = THREE.MathUtils.lerp(rightRef.current.rotation.y, tR, 0.16);
    }
  });

  const onDoorPointer = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onToggle();
    },
    [onToggle],
  );

  return (
    <group>
      <group ref={leftRef} position={[-0.275, 1.02, 0.236]}>
        <mesh
          castShadow
          position={[0.125, 0, 0]}
          onPointerDown={onDoorPointer}
          onPointerOver={() => setHoverL(true)}
          onPointerOut={() => setHoverL(false)}
        >
          <boxGeometry args={[0.26, 1.52, 0.016]} />
          <meshStandardMaterial color="#f8f4ed" roughness={0.72} metalness={0} />
        </mesh>
        <mesh
          castShadow
          position={[0.125, 1.1, 0.022]}
          rotation={[Math.PI / 2, 0, 0]}
          onPointerDown={onDoorPointer}
          onPointerOver={() => setHoverL(true)}
          onPointerOut={() => setHoverL(false)}
        >
          <cylinderGeometry args={[0.012, 0.012, 0.048, 12]} />
          <meshStandardMaterial color="#c2bbb2" roughness={0.35} metalness={0.55} />
        </mesh>
      </group>
      <group ref={rightRef} position={[0.275, 1.02, 0.236]}>
        <mesh
          castShadow
          position={[-0.125, 0, 0]}
          onPointerDown={onDoorPointer}
          onPointerOver={() => setHoverR(true)}
          onPointerOut={() => setHoverR(false)}
        >
          <boxGeometry args={[0.26, 1.52, 0.016]} />
          <meshStandardMaterial color="#f8f4ed" roughness={0.72} metalness={0} />
        </mesh>
        <mesh
          castShadow
          position={[-0.125, 1.1, 0.022]}
          rotation={[Math.PI / 2, 0, 0]}
          onPointerDown={onDoorPointer}
          onPointerOver={() => setHoverR(true)}
          onPointerOut={() => setHoverR(false)}
        >
          <cylinderGeometry args={[0.012, 0.012, 0.048, 12]} />
          <meshStandardMaterial color="#c2bbb2" roughness={0.35} metalness={0.55} />
        </mesh>
      </group>
    </group>
  );
}

/** Open-front wardrobe: rod + hanging clothes + folded stack (stylized). */
function OpenClosetWithClothes() {
  const w = 0.7;
  const d = 0.46;
  const h = 1.72;
  const t = 0.026;
  const cream = "#f3eee8";
  const garmentColors = ["#6b8cae", "#c9a5a8", "#e8e4dc", "#8fa38c", "#c8b8d4"];

  return (
    <group>
      <mesh receiveShadow position={[0, t / 2, 0]}>
        <boxGeometry args={[w, t, d]} />
        <meshStandardMaterial color="#e5ddd4" roughness={0.82} />
      </mesh>
      <mesh castShadow position={[0, h / 2 + t, -d / 2 + t / 2]}>
        <boxGeometry args={[w, h, t]} />
        <meshStandardMaterial color={cream} roughness={0.68} metalness={0.02} />
      </mesh>
      <mesh castShadow position={[-w / 2 + t / 2, h / 2 + t, 0]}>
        <boxGeometry args={[t, h, d - t * 2]} />
        <meshStandardMaterial color={cream} roughness={0.68} metalness={0.02} />
      </mesh>
      <mesh castShadow position={[w / 2 - t / 2, h / 2 + t, 0]}>
        <boxGeometry args={[t, h, d - t * 2]} />
        <meshStandardMaterial color={cream} roughness={0.68} metalness={0.02} />
      </mesh>
      <mesh castShadow position={[0, h + t - t / 2, 0]}>
        <boxGeometry args={[w, t, d]} />
        <meshStandardMaterial color="#ebe4dc" roughness={0.7} />
      </mesh>

      <mesh castShadow position={[0, 1.34, 0.06]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.011, 0.011, w * 0.62, 12]} />
        <meshStandardMaterial color="#b8b0a8" roughness={0.4} metalness={0.35} />
      </mesh>

      {garmentColors.map((color, i) => (
        <mesh
          key={i}
          castShadow
          position={[-w * 0.2 + i * 0.095, 1.26, 0.06]}
          rotation={[0.06 + i * 0.02, 0, (i - 2) * 0.04]}
        >
          <boxGeometry args={[0.042, 0.5, 0.26]} />
          <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
        </mesh>
      ))}

      <mesh castShadow position={[w * 0.12, 0.52, -0.05]}>
        <boxGeometry args={[0.22, 0.11, 0.2]} />
        <meshStandardMaterial color="#9aaabe" roughness={0.85} />
      </mesh>
      <mesh castShadow position={[w * 0.12, 0.63, -0.05]}>
        <boxGeometry args={[0.2, 0.09, 0.18]} />
        <meshStandardMaterial color="#d8cfc4" roughness={0.88} />
      </mesh>
    </group>
  );
}

/** Solid-body electric — sunburst-ish, pickguard + dual pickups (🎸-style silhouette). */
/** Acoustic guitar leaning on a wall — curved body, sound hole, fretboard, readable at room scale. */
function StylizedLeanAcousticGuitar({
  wood,
  darkWood,
  metal,
}: {
  wood: { color: string; roughness: number; metalness: number };
  darkWood: { color: string; roughness: number; metalness: number };
  metal: { color: string; roughness: number; metalness: number };
}) {
  return (
    <group position={[0, 0, 0]} rotation={[0.11, 0.08, -0.14]}>
      {/* Body lower bout */}
      <mesh castShadow position={[0, 0.22, 0.02]} rotation={[0.35, 0, 0]} scale={[1, 0.72, 1]}>
        <sphereGeometry args={[0.16, 20, 16]} />
        <meshPhysicalMaterial
          {...wood}
          color="#a86b42"
          roughness={0.48}
          metalness={0.06}
          clearcoat={0.22}
          clearcoatRoughness={0.5}
        />
      </mesh>
      {/* Upper bout */}
      <mesh castShadow position={[0, 0.38, -0.06]} rotation={[0.25, 0, 0]} scale={[0.78, 0.62, 0.88]}>
        <sphereGeometry args={[0.11, 18, 14]} />
        <meshPhysicalMaterial {...wood} color="#9c5f38" roughness={0.5} metalness={0.05} />
      </mesh>
      {/* Waist pinch */}
      <mesh castShadow position={[0, 0.3, -0.02]} scale={[0.92, 0.55, 0.95]}>
        <sphereGeometry args={[0.1, 16, 12]} />
        <meshPhysicalMaterial {...wood} color="#8f5532" roughness={0.52} metalness={0.04} />
      </mesh>
      {/* Sound hole ring */}
      <mesh castShadow position={[0, 0.28, 0.068]} rotation={[0.95, 0, 0]}>
        <torusGeometry args={[0.042, 0.008, 10, 28]} />
        <meshStandardMaterial {...darkWood} />
      </mesh>
      <mesh position={[0, 0.28, 0.074]} rotation={[0.95, 0, 0]}>
        <circleGeometry args={[0.034, 24]} />
        <meshStandardMaterial color="#1a1816" roughness={0.92} metalness={0} />
      </mesh>
      {/* Bridge */}
      <mesh castShadow position={[0, 0.16, 0.055]} rotation={[0.4, 0, 0]}>
        <boxGeometry args={[0.09, 0.014, 0.028]} />
        <meshStandardMaterial {...darkWood} />
      </mesh>
      {/* Neck + head */}
      <RoundedBox args={[0.034, 0.52, 0.042]} radius={0.008} smoothness={3} castShadow position={[0, 0.72, -0.05]}>
        <meshPhysicalMaterial {...darkWood} roughness={0.72} metalness={0.02} />
      </RoundedBox>
      <RoundedBox args={[0.038, 0.09, 0.048]} radius={0.01} smoothness={3} castShadow position={[0, 0.98, -0.06]}>
        <meshPhysicalMaterial {...darkWood} />
      </RoundedBox>
      {/* Frets hint */}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} castShadow position={[0, 0.52 + i * 0.048, 0.018]}>
          <boxGeometry args={[0.036, 0.002, 0.042]} />
          <meshStandardMaterial color="#2a2624" roughness={0.65} metalness={0.12} />
        </mesh>
      ))}
      {/* Strings */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const ox = (i - 2.5) * 0.0045;
        return (
          <mesh key={i} castShadow position={[ox, 0.58, -0.04]}>
            <cylinderGeometry args={[0.0009, 0.0009, 0.62, 4]} />
            <meshStandardMaterial color="#dcd6cc" roughness={0.22} metalness={0.55} />
          </mesh>
        );
      })}
      {/* Tuners */}
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[s * 0.022, 1.02, -0.05]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.007, 0.007, 0.02, 8]} />
          <meshStandardMaterial {...metal} />
        </mesh>
      ))}
    </group>
  );
}

/** IKEA Kallax–style 2×4 cube shelf with desk extension and two legs. */
function KallaxWorkstation({
  white,
  binPink,
}: {
  white: { color: string; roughness: number; metalness: number };
  binPink: { color: string; roughness: number; metalness: number };
}) {
  const W = 0.76;
  const H = 1.46;
  const D = 0.37;
  const T = 0.022;
  const deskY = 0.74;
  const deskL = 1.08;
  const deskW = 0.78;

  const innerW = W - 2 * T;
  const innerH = H - 2 * T;
  const colW = (innerW - T) / 2;
  const rowH = (innerH - 3 * T) / 4;

  const cubbyBins = [
    { cx: -innerW / 4 - T / 4, cz: D / 2 - T - 0.04, rowFromTop: 0 },
    { cx: innerW / 4 + T / 4, cz: D / 2 - T - 0.04, rowFromTop: 0 },
  ];

  return (
    <group>
      <mesh position={[0, T / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[W, T, D]} />
        <meshStandardMaterial {...white} />
      </mesh>
      <mesh position={[0, H - T / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[W, T, D]} />
        <meshStandardMaterial {...white} />
      </mesh>
      <mesh position={[-W / 2 + T / 2, H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[T, H - 2 * T, D]} />
        <meshStandardMaterial {...white} />
      </mesh>
      <mesh position={[W / 2 - T / 2, H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[T, H - 2 * T, D]} />
        <meshStandardMaterial {...white} />
      </mesh>
      <mesh position={[0, H / 2, -D / 2 + T / 2]} castShadow receiveShadow>
        <boxGeometry args={[W - 2 * T, H - 2 * T, T]} />
        <meshStandardMaterial {...white} />
      </mesh>

      <mesh castShadow receiveShadow position={[0, T + rowH / 2, 0]}>
        <boxGeometry args={[innerW, T, D - 2 * T]} />
        <meshStandardMaterial {...white} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, T + rowH + T + rowH / 2, 0]}>
        <boxGeometry args={[innerW, T, D - 2 * T]} />
        <meshStandardMaterial {...white} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, T + 2 * (rowH + T) + rowH / 2, 0]}>
        <boxGeometry args={[innerW, T, D - 2 * T]} />
        <meshStandardMaterial {...white} />
      </mesh>

      <mesh castShadow receiveShadow position={[0, H / 2, 0]}>
        <boxGeometry args={[T, H - 2 * T, D - 2 * T]} />
        <meshStandardMaterial {...white} />
      </mesh>

      {cubbyBins.map((b, i) => {
        const yFromBottom = T + b.rowFromTop * (rowH + T) + rowH / 2;
        return (
          <mesh key={i} castShadow position={[b.cx, yFromBottom, b.cz]}>
            <boxGeometry args={[colW - 0.04, rowH - 0.04, 0.14]} />
            <meshStandardMaterial {...binPink} />
          </mesh>
        );
      })}

      {/* L-return slab — thicker, soft bevel */}
      <RoundedBox
        args={[deskL, 0.042, deskW]}
        radius={0.014}
        smoothness={4}
        castShadow
        receiveShadow
        position={[D / 2 + deskL / 2 - 0.02, deskY + 0.004, 0]}
      >
        <meshPhysicalMaterial
          color="#faf9f7"
          roughness={0.38}
          metalness={0.04}
          clearcoat={0.1}
          clearcoatRoughness={0.45}
        />
      </RoundedBox>
      {/* Apron / modesty panel — reads as real furniture thickness */}
      <mesh castShadow receiveShadow position={[D / 2 + deskL / 2 - 0.02, deskY * 0.52, deskW / 2 - 0.018]}>
        <boxGeometry args={[deskL * 0.92, deskY * 0.88, 0.014]} />
        <meshStandardMaterial color="#f0ebe4" roughness={0.55} metalness={0.03} />
      </mesh>
      <mesh castShadow receiveShadow position={[D / 2 + deskL / 2 - 0.02, deskY * 0.52, -deskW / 2 + 0.018]}>
        <boxGeometry args={[deskL * 0.92, deskY * 0.88, 0.014]} />
        <meshStandardMaterial color="#f0ebe4" roughness={0.55} metalness={0.03} />
      </mesh>
      {/* Tapered legs — four corners under the return */}
      <mesh castShadow position={[D / 2 + deskL - 0.05, deskY / 2, deskW / 2 - 0.07]}>
        <cylinderGeometry args={[0.022, 0.03, deskY - 0.05, 14]} />
        <meshStandardMaterial {...white} />
      </mesh>
      <mesh castShadow position={[D / 2 + deskL - 0.05, deskY / 2, -deskW / 2 + 0.07]}>
        <cylinderGeometry args={[0.022, 0.03, deskY - 0.05, 14]} />
        <meshStandardMaterial {...white} />
      </mesh>
      <mesh castShadow position={[D / 2 + deskL * 0.38, deskY / 2, deskW / 2 - 0.05]}>
        <cylinderGeometry args={[0.02, 0.028, deskY - 0.05, 14]} />
        <meshStandardMaterial {...white} />
      </mesh>
      <mesh castShadow position={[D / 2 + deskL * 0.38, deskY / 2, -deskW / 2 + 0.05]}>
        <cylinderGeometry args={[0.02, 0.028, deskY - 0.05, 14]} />
        <meshStandardMaterial {...white} />
      </mesh>
    </group>
  );
}

function KeyboardCap({ focused }: { focused: boolean }) {
  const [hover, setHover] = useState(false);
  useCursor(hover || focused);
  const rows = 4;
  const cols = 14;
  const kw = 0.31;
  const kd = 0.11;
  const gap = 0.008;
  const cellW = (kw - gap * (cols - 1)) / cols;
  const cellD = (kd - gap * (rows - 1)) / rows;
  const keyH = 0.008;
  const baseY = keyH * 0.5 + 0.002;
  return (
    <group onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.38, 0.02, 0.15]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <RoundedBox args={[kw + 0.024, 0.014, kd + 0.024]} radius={0.006} smoothness={2} castShadow position={[0, 0.009, 0]}>
        <meshStandardMaterial
          color="#eae6e2"
          roughness={0.55}
          metalness={0.06}
          emissive={focused ? "#f5ebe0" : "#0a0908"}
          emissiveIntensity={focused ? 0.12 : hover ? 0.04 : 0.02}
        />
      </RoundedBox>
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const isSpace = r === rows - 1 && c > 4 && c < 9;
          if (isSpace) return null;
          const w = r === rows - 1 && (c <= 1 || c >= cols - 2) ? cellW * 1.35 : cellW;
          const x = -kw / 2 + c * (cellW + gap) + cellW / 2 + (w > cellW ? cellW * 0.18 : 0);
          const z = -kd / 2 + r * (cellD + gap) + cellD / 2;
          return (
            <mesh key={`${r}-${c}`} castShadow position={[x, baseY, z]}>
              <boxGeometry args={[w * 0.92, keyH, cellD * 0.88]} />
              <meshStandardMaterial
                color="#2c2a28"
                roughness={0.42}
                metalness={0.05}
                emissive={focused ? "#3d3835" : "#080706"}
                emissiveIntensity={focused ? 0.08 : 0.02}
              />
            </mesh>
          );
        }),
      ).flat()}
    </group>
  );
}

/** Oval vanity mirror on a small stand — reads as makeup mirror on desk. */
function VanityStandingMirror() {
  return (
    <group rotation={[0.12, -0.2, 0]}>
      <mesh castShadow position={[0, 0.018, 0]}>
        <cylinderGeometry args={[0.06, 0.065, 0.016, 22]} />
        <meshStandardMaterial color="#ebe6df" roughness={0.4} metalness={0.18} />
      </mesh>
      <RoundedBox args={[0.012, 0.11, 0.085]} radius={0.004} smoothness={2} castShadow position={[-0.055, 0.078, 0]}>
        <meshStandardMaterial color="#f4eee6" roughness={0.52} metalness={0.06} />
      </RoundedBox>
      <mesh position={[0, 0.14, 0.022]} rotation={[0.1, 0, 0]}>
        <circleGeometry args={[0.072, 40]} />
        <meshPhysicalMaterial
          color="#d8ecfa"
          roughness={0.06}
          metalness={0.88}
          clearcoat={1}
          clearcoatRoughness={0.12}
          emissive="#eef8ff"
          emissiveIntensity={0.06}
        />
      </mesh>
      <mesh position={[0, 0.14, 0.02]} rotation={[0.1, 0, 0]}>
        <ringGeometry args={[0.058, 0.078, 36]} />
        <meshStandardMaterial color="#e0d8ce" roughness={0.38} metalness={0.22} />
      </mesh>
    </group>
  );
}

function LegoStuddedBrick({
  cols,
  rows,
  h,
  mat,
  position: pos,
  rotation: rot = [0, 0, 0] as [number, number, number],
}: {
  cols: number;
  rows: number;
  h: number;
  mat: { color: string; roughness: number; metalness: number };
  position: [number, number, number];
  rotation?: [number, number, number];
}) {
  const u = 0.016;
  const w = cols * u;
  const d = rows * u;
  return (
    <group position={pos} rotation={rot}>
      <mesh castShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[w * 0.98, h, d * 0.98]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {Array.from({ length: cols }, (_, c) =>
        Array.from({ length: rows }, (_, r) => (
          <mesh
            key={`${c}-${r}`}
            castShadow
            position={[(c - (cols - 1) / 2) * u, h + 0.004, (r - (rows - 1) / 2) * u]}
          >
            <cylinderGeometry args={[0.0055, 0.0055, 0.006, 10]} />
            <meshStandardMaterial {...mat} />
          </mesh>
        )),
      ).flat()}
    </group>
  );
}

/** Glossy brick plastic — stylized LEGO read, matches memory-room cream/pink palette. */
function legoPlasticProps(color: string) {
  return {
    color,
    roughness: 0.26,
    metalness: 0.06,
    clearcoat: 0.42,
    clearcoatRoughness: 0.28,
  } as const;
}

/**
 * Sitting “Angel”-style brick figure (pink alien with ears, antennae, heart balloon) —
 * gentle idle motion: ear flap, antenna sway, head tilt, balloon bob, butterfly flutter.
 */
function StylizedLegoAngelFigure() {
  const headRef = useRef<THREE.Group>(null);
  const earLRef = useRef<THREE.Group>(null);
  const earRRef = useRef<THREE.Group>(null);
  const antLRef = useRef<THREE.Group>(null);
  const antRRef = useRef<THREE.Group>(null);
  const balloonRef = useRef<THREE.Group>(null);
  const butterflyRef = useRef<THREE.Group>(null);
  const winkRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const t = performance.now() * 0.001;
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(t * 0.95) * 0.07;
      headRef.current.rotation.x = Math.sin(t * 1.15 + 0.4) * 0.035;
    }
    if (earLRef.current) {
      earLRef.current.rotation.x = 0.12 + Math.sin(t * 1.85) * 0.14;
    }
    if (earRRef.current) {
      earRRef.current.rotation.x = 0.12 + Math.sin(t * 1.85 + 0.55) * 0.14;
    }
    if (antLRef.current) {
      antLRef.current.rotation.z = Math.sin(t * 2.25) * 0.11;
      antLRef.current.rotation.x = Math.sin(t * 1.65 + 0.8) * 0.06;
    }
    if (antRRef.current) {
      antRRef.current.rotation.z = -Math.sin(t * 2.1 + 0.3) * 0.11;
      antRRef.current.rotation.x = Math.sin(t * 1.7) * 0.06;
    }
    if (balloonRef.current) {
      balloonRef.current.rotation.z = Math.sin(t * 1.45) * 0.12;
      balloonRef.current.rotation.x = Math.sin(t * 1.2 + 1) * 0.05;
      balloonRef.current.position.x = Math.sin(t * 1.35) * 0.006;
    }
    if (butterflyRef.current) {
      butterflyRef.current.rotation.y = Math.sin(t * 2.8) * 0.25;
      butterflyRef.current.position.y = 0.018 + Math.sin(t * 3.2) * 0.003;
    }
    const wk = winkRef.current;
    if (wk) {
      wk.scale.y = 0.35 + Math.max(0, Math.sin(t * 0.35)) * 0.25;
    }
  });

  const pink = legoPlasticProps("#e89abf");
  const cream = legoPlasticProps("#f5e8dc");
  const lavender = legoPlasticProps("#a884c4");
  const blueBalloon = legoPlasticProps("#4a9ee8");
  const yellow = legoPlasticProps("#f4d24a");

  return (
    <group rotation={[0, -0.35, 0]} scale={0.92}>
      {/* Body + sitting pose */}
      <RoundedBox args={[0.036, 0.028, 0.03]} radius={0.006} smoothness={3} castShadow position={[0, 0.016, 0]}>
        <meshPhysicalMaterial {...pink} />
      </RoundedBox>
      <mesh castShadow position={[0, 0.018, 0.017]} rotation={[-0.15, 0, 0]}>
        <circleGeometry args={[0.012, 16]} />
        <meshPhysicalMaterial {...cream} />
      </mesh>

      {/* Back feet — purple pads */}
      <mesh castShadow position={[-0.014, 0.006, -0.014]}>
        <sphereGeometry args={[0.012, 12, 10]} />
        <meshPhysicalMaterial {...pink} />
      </mesh>
      <mesh castShadow position={[0.014, 0.006, -0.014]}>
        <sphereGeometry args={[0.012, 12, 10]} />
        <meshPhysicalMaterial {...pink} />
      </mesh>
      <mesh position={[-0.014, 0.006, -0.02]}>
        <circleGeometry args={[0.006, 12]} />
        <meshPhysicalMaterial {...lavender} />
      </mesh>
      <mesh position={[0.014, 0.006, -0.02]}>
        <circleGeometry args={[0.006, 12]} />
        <meshPhysicalMaterial {...lavender} />
      </mesh>

      {/* Front paws */}
      <mesh castShadow position={[-0.02, 0.008, 0.02]}>
        <boxGeometry args={[0.014, 0.01, 0.016]} />
        <meshPhysicalMaterial {...pink} />
      </mesh>
      <mesh castShadow position={[0.02, 0.008, 0.02]}>
        <boxGeometry args={[0.014, 0.01, 0.016]} />
        <meshPhysicalMaterial {...pink} />
      </mesh>

      {/* Head rig */}
      <group ref={headRef} position={[0, 0.048, 0.002]}>
        <mesh castShadow>
          <sphereGeometry args={[0.028, 22, 18]} />
          <meshPhysicalMaterial {...pink} />
        </mesh>
        {/* Studs on crown */}
        {[
          [-0.008, 0.024, 0.006],
          [0.008, 0.024, 0.006],
          [0, 0.026, -0.006],
        ].map((p, i) => (
          <mesh key={i} castShadow position={p as [number, number, number]}>
            <cylinderGeometry args={[0.0042, 0.0042, 0.0035, 10]} />
            <meshPhysicalMaterial {...pink} />
          </mesh>
        ))}
        {/* Forehead heart chip */}
        <mesh castShadow position={[0, 0.018, 0.024]} rotation={[0.4, 0, 0]}>
          <sphereGeometry args={[0.0045, 8, 8]} />
          <meshPhysicalMaterial color="#e070a0" roughness={0.3} metalness={0.05} clearcoat={0.35} />
        </mesh>

        {/* Face */}
        <mesh castShadow position={[0, 0.002, 0.026]}>
          <sphereGeometry args={[0.007, 14, 12]} />
          <meshPhysicalMaterial {...lavender} />
        </mesh>
        <mesh position={[-0.009, 0.008, 0.025]}>
          <sphereGeometry args={[0.0065, 14, 12]} />
          <meshStandardMaterial color="#1a1818" roughness={0.35} metalness={0.1} />
        </mesh>
        <mesh position={[-0.008, 0.01, 0.028]}>
          <sphereGeometry args={[0.0022, 8, 8]} />
          <meshStandardMaterial color="#faf8f5" roughness={0.25} metalness={0.05} />
        </mesh>
        <mesh ref={winkRef} position={[0.01, 0.008, 0.026]} rotation={[0, 0, -0.35]}>
          <torusGeometry args={[0.0045, 0.0012, 6, 12, Math.PI * 1.05]} />
          <meshStandardMaterial color="#1a1818" roughness={0.4} metalness={0.08} />
        </mesh>

        {/* Ears — hinge at head */}
        <group ref={earLRef} position={[-0.024, 0.006, 0]}>
          <mesh castShadow position={[-0.018, 0, 0]} rotation={[0, 0, 0.08]}>
            <boxGeometry args={[0.032, 0.004, 0.034]} />
            <meshPhysicalMaterial {...pink} />
          </mesh>
          <mesh position={[-0.018, 0, 0.0025]} rotation={[0, 0, 0.08]}>
            <boxGeometry args={[0.026, 0.002, 0.028]} />
            <meshPhysicalMaterial {...cream} />
          </mesh>
        </group>
        <group ref={earRRef} position={[0.024, 0.006, 0]}>
          <mesh castShadow position={[0.018, 0, 0]} rotation={[0, 0, -0.08]}>
            <boxGeometry args={[0.032, 0.004, 0.034]} />
            <meshPhysicalMaterial {...pink} />
          </mesh>
          <mesh position={[0.018, 0, 0.0025]} rotation={[0, 0, -0.08]}>
            <boxGeometry args={[0.026, 0.002, 0.028]} />
            <meshPhysicalMaterial {...cream} />
          </mesh>
        </group>

        {/* Antennae */}
        <group ref={antLRef} position={[-0.01, 0.028, 0]}>
          <mesh castShadow position={[0, 0.022, 0]} rotation={[0.35, 0, -0.25]}>
            <cylinderGeometry args={[0.002, 0.0025, 0.038, 8]} />
            <meshPhysicalMaterial {...pink} />
          </mesh>
          <mesh castShadow position={[-0.008, 0.042, 0.012]} rotation={[0.5, 0, -0.2]}>
            <sphereGeometry args={[0.0045, 10, 8]} />
            <meshPhysicalMaterial {...lavender} />
          </mesh>
        </group>
        <group ref={antRRef} position={[0.01, 0.028, 0]}>
          <mesh castShadow position={[0, 0.022, 0]} rotation={[0.35, 0, 0.25]}>
            <cylinderGeometry args={[0.002, 0.0025, 0.038, 8]} />
            <meshPhysicalMaterial {...pink} />
          </mesh>
          <mesh castShadow position={[0.008, 0.042, 0.012]} rotation={[0.5, 0, 0.2]}>
            <sphereGeometry args={[0.0045, 10, 8]} />
            <meshPhysicalMaterial {...lavender} />
          </mesh>
        </group>
      </group>

      {/* Heart balloon + string */}
      <group ref={balloonRef} position={[0.02, 0.072, -0.038]}>
        <mesh castShadow position={[0, -0.028, 0]}>
          <cylinderGeometry args={[0.0012, 0.0012, 0.032, 6]} />
          <meshStandardMaterial color="#f2eee8" roughness={0.45} metalness={0.02} />
        </mesh>
        <mesh castShadow position={[-0.004, 0.008, 0]}>
          <sphereGeometry args={[0.014, 14, 12]} />
          <meshPhysicalMaterial {...blueBalloon} />
        </mesh>
        <mesh castShadow position={[0.005, 0.006, 0.002]}>
          <sphereGeometry args={[0.012, 12, 10]} />
          <meshPhysicalMaterial {...yellow} />
        </mesh>
      </group>

      {/* Tiny butterfly */}
      <group ref={butterflyRef} position={[0.055, 0.028, 0.018]} rotation={[0, 0.6, 0]}>
        <mesh castShadow position={[0, 0, 0]}>
          <cylinderGeometry args={[0.002, 0.002, 0.012, 6]} />
          <meshStandardMaterial color="#2a2620" roughness={0.55} metalness={0.05} />
        </mesh>
        <mesh castShadow position={[-0.01, 0.004, 0]} rotation={[0.2, 0, -0.3]}>
          <circleGeometry args={[0.012, 12]} />
          <meshPhysicalMaterial {...yellow} side={THREE.DoubleSide} />
        </mesh>
        <mesh castShadow position={[0.01, 0.004, 0]} rotation={[0.2, 0, 0.3]}>
          <circleGeometry args={[0.012, 12]} />
          <meshPhysicalMaterial {...yellow} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

/** Desk souvenir cluster — animated brick-style Angel figure (+ optional accent bricks). */
function LegoSouvenirsCluster({
  lego,
}: {
  lego: { color: string; roughness: number; metalness: number }[];
}) {
  const [a, b] = lego;
  return (
    <group>
      <group position={[0, 0, 0]}>
        <StylizedLegoAngelFigure />
      </group>
      <LegoStuddedBrick cols={2} rows={2} h={0.01} mat={a} position={[0.068, 0, 0.034]} rotation={[0, -0.4, 0]} />
      <LegoStuddedBrick cols={2} rows={1} h={0.009} mat={b} position={[-0.055, 0.001, 0.028]} rotation={[0, 0.55, 0]} />
    </group>
  );
}

function RoomAtmosphere({
  lampOn,
  typingGlowRef,
  curtainBlendRef,
}: {
  lampOn: boolean;
  typingGlowRef: MutableRefObject<number>;
  curtainBlendRef: MutableRefObject<number>;
}) {
  const { gl, scene } = useThree();
  const fogBright = useMemo(() => new THREE.Color("#e8ebe4"), []);
  const fogSoft = useMemo(() => new THREE.Color("#d8dfd4"), []);
  const bgBright = useMemo(() => new THREE.Color("#ebe6dc"), []);
  const bgSoft = useMemo(() => new THREE.Color("#ddd8ce"), []);

  useFrame(() => {
    const lit = lampOn ? 1 : 0;
    const c = curtainBlendRef.current;
    const pulse = typingGlowRef.current;
    typingGlowRef.current *= 0.94;
    const airy = c * 0.55 + 0.45;
    const targetExp = (0.66 + lit * 0.32 + pulse * 0.08) * (0.92 + c * 0.08);
    gl.toneMappingExposure = THREE.MathUtils.lerp(gl.toneMappingExposure, targetExp, 0.06);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.lerpColors(fogSoft, fogBright, (lit * 0.82 + 0.18 + pulse * 0.04) * airy);
      scene.fog.near = THREE.MathUtils.lerp(scene.fog.near, 7.2 + (1 - c) * 1.2 + pulse * 3, 0.08);
      scene.fog.far = THREE.MathUtils.lerp(scene.fog.far, 17.5 + c * 2.5 + pulse * 2, 0.06);
    }
    if (scene.background instanceof THREE.Color) {
      scene.background.lerpColors(bgSoft, bgBright, (lit * 0.72 + 0.28) * airy);
    }
  });
  return null;
}

function PhotoInFrame({ url }: { url: string }) {
  const texture = useTexture(url);
  useLayoutEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    const img = texture.image as HTMLImageElement | undefined;
    if (!img?.naturalWidth) return;
    const ir = img.naturalWidth / img.naturalHeight;
    const fr = 0.34 / 0.42;
    if (ir > fr) {
      const w = fr / ir;
      texture.repeat.set(w, 1);
      texture.offset.set((1 - w) / 2, 0);
    } else {
      const h = ir / fr;
      texture.repeat.set(1, h);
      texture.offset.set(0, (1 - h) / 2);
    }
    texture.needsUpdate = true;
  }, [texture]);
  return (
    <mesh position={[0, 0, 0.028]}>
      <planeGeometry args={[0.34, 0.42]} />
      <meshStandardMaterial
        map={texture}
        roughness={0.5}
        metalness={0}
        emissive="#faf6f0"
        emissiveIntensity={0.05}
      />
    </mesh>
  );
}

/** Thin wooden frame + photo plane, mounted on a wall facing +Z. */
function WallFramedPhoto({
  url,
  position,
  rotation = [0, 0, 0],
  photoW,
  photoH,
}: {
  url: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  photoW: number;
  photoH: number;
}) {
  const texture = useTexture(url);
  useLayoutEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    const img = texture.image as HTMLImageElement | undefined;
    if (!img?.naturalWidth) return;
    const ir = img.naturalWidth / img.naturalHeight;
    const fr = photoW / photoH;
    if (ir > fr) {
      const w = fr / ir;
      texture.repeat.set(w, 1);
      texture.offset.set((1 - w) / 2, 0);
    } else {
      const h = ir / fr;
      texture.repeat.set(1, h);
      texture.offset.set(0, (1 - h) / 2);
    }
    texture.needsUpdate = true;
  }, [texture, photoW, photoH]);

  const border = 0.038;
  const fw = photoW + border * 2;
  const fh = photoH + border * 2;

  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow receiveShadow position={[0, 0, -0.011]}>
        <boxGeometry args={[fw, fh, 0.02]} />
        <meshStandardMaterial color="#c4b5a3" roughness={0.82} metalness={0.02} />
      </mesh>
      <mesh position={[0, 0, 0.011]} receiveShadow>
        <planeGeometry args={[photoW, photoH]} />
        <meshStandardMaterial
          map={texture}
          roughness={0.48}
          metalness={0}
          emissive="#faf6f0"
          emissiveIntensity={0.06}
        />
      </mesh>
    </group>
  );
}

/** Lets prop meshes read parent hover (e.g. soft rim light on GLB). */
const DraggableHoverContext = createContext(false);

type DraggablePropProps = {
  memory: MemoryEcho;
  base: [number, number, number];
  planeY: number;
  placement: PlacementKind;
  /** Half-depth toward the back wall for room clamp (defaults to collisionRadius). */
  backHalfDepth?: number;
  /** After a translate drag, snap + persist pose (rotation preserved). */
  onCommitTransform?: (pose: RoomObjectPose) => void;
  /** Horizontal radius (XZ) for keeping the object inside solid walls (meters). */
  collisionRadius?: number;
  /** Small nudge area when no room clamp is desired (rare). */
  dragRadius?: number;
  selectedId: MemoryId | null;
  onSelect: (m: MemoryEcho) => void;
  onDragChange: (active: boolean) => void;
  onTap?: () => void;
  /** Local offset for the floating paper scrap (meters). */
  paperOffset?: [number, number, number];
  /** Y rotation (radians), applied around object center. */
  rotationY?: number;
  /** Gentle drag on the whisper-thin handle nudges this. */
  rotatable?: boolean;
  onRotationDelta?: (delta: number) => void;
  /** Local +X where the rotation nub sits (meters). */
  rotateHandleX?: number;
  /** Local Y so the nub sits above the floor / outside thick meshes (important for bed, monitor). */
  rotateHandleY?: number;
  /** When true, hover / selection can show the floating paper scrap (off by default; enable in scene UI). */
  paperEnabled?: boolean;
  /** When true, paper only appears after click-select (not on hover). */
  paperOnlyWhenSelected?: boolean;
  paperRevealMode?: "typewriter" | "fade";
  /** Meshes that receive pointer events but are not the main drag hull (e.g. hinged doors). */
  interactiveOverlay?: ReactNode;
  /** Soft selection ring on floor / plane (meters). */
  selectionHaloInner?: number;
  selectionHaloOuter?: number;
  selectionHaloY?: number;
  children: ReactNode;
};

function hashSwaySeed(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 11)) % 997;
  return h * 0.001;
}

function DraggableProp({
  memory,
  base,
  planeY,
  placement,
  backHalfDepth,
  onCommitTransform,
  collisionRadius = 0.3,
  dragRadius,
  selectedId,
  onSelect,
  onDragChange,
  onTap,
  paperOffset = [0.2, 0.28, 0.05],
  rotationY = 0,
  rotatable = false,
  onRotationDelta,
  rotateHandleX = 0.22,
  rotateHandleY = 0.22,
  paperEnabled = false,
  paperOnlyWhenSelected = false,
  paperRevealMode = "typewriter",
  interactiveOverlay,
  selectionHaloInner = 0.34,
  selectionHaloOuter = 0.5,
  selectionHaloY = 0.018,
  children,
}: DraggablePropProps) {
  const groupRef = useRef<THREE.Group>(null);
  const interactRef = useRef<THREE.Group>(null);
  const breathingRef = useRef<THREE.Group>(null);
  const draggingRef = useRef(false);
  const translateDragRef = useRef(false);
  const dragIsRotateRef = useRef(false);
  const lastRotateXRef = useRef(0);
  const swaySeed = useMemo(() => hashSwaySeed(memory.id), [memory.id]);
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), [planeY]);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const dragRef = useRef<{ grabDx: number; grabDz: number } | null>(null);
  const flushMoveRef = useRef<(ev: PointerEvent) => void>(() => {});
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragCommittedRef = useRef(false);
  const touchScaleRef = useRef(1);
  const [hovered, setHovered] = useState(false);
  const [handleHover, setHandleHover] = useState(false);
  useCursor(hovered || handleHover);

  const backHalf = backHalfDepth ?? collisionRadius;
  const isSelected = selectedId === memory.id;
  const showPaper =
    paperEnabled && (paperOnlyWhenSelected ? isSelected : hovered || isSelected);

  useLayoutEffect(() => {
    const g = groupRef.current;
    if (!g || translateDragRef.current) return;
    g.position.set(base[0], base[1], base[2]);
  }, [base[0], base[1], base[2]]);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    if (!translateDragRef.current) {
      g.position.y = base[1];
    }
    const ir = interactRef.current;
    if (ir) {
      const breathe = 1 + Math.sin(performance.now() * 0.0009 + swaySeed) * 0.006;
      touchScaleRef.current = THREE.MathUtils.lerp(touchScaleRef.current, 1, 0.1);
      ir.scale.setScalar(touchScaleRef.current * breathe);
    }
    const br = breathingRef.current;
    if (br) {
      if (!draggingRef.current) {
        const t = performance.now() * 0.00065 + swaySeed;
        br.rotation.x = Math.sin(t) * 0.007;
        br.rotation.z = Math.cos(t * 0.88) * 0.005;
      } else {
        br.rotation.x *= 0.9;
        br.rotation.z *= 0.9;
      }
    }
  });

  const flushMove = useCallback(
    (ev: PointerEvent) => {
      const d = dragRef.current;
      const g = groupRef.current;
      if (!d || !g) return;
      const rect = gl.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, hit)) {
        let nx = hit.x - d.grabDx;
        let nz = hit.z - d.grabDz;
        if (dragRadius != null) {
          const r = dragRadius;
          nx = THREE.MathUtils.clamp(nx, base[0] - r, base[0] + r);
          nz = THREE.MathUtils.clamp(nz, base[2] - r, base[2] + r);
        } else {
          const cl = clampXZRoomCenter(nx, nz, collisionRadius, backHalf);
          nx = cl.x;
          nz = cl.z;
        }
        const w = 0.34;
        g.position.x = THREE.MathUtils.lerp(g.position.x, nx, w);
        g.position.z = THREE.MathUtils.lerp(g.position.z, nz, w);
        g.position.y = base[1];
      }
    },
    [backHalf, base, camera, collisionRadius, dragRadius, gl, hit, ndc, plane, raycaster],
  );

  flushMoveRef.current = flushMove;

  const onRotateHandleDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (!rotatable || !onRotationDelta) return;
      onSelect(memory);
      let lastX = e.nativeEvent.clientX;
      draggingRef.current = true;
      translateDragRef.current = false;
      onDragChange(true);
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - lastX;
        lastX = ev.clientX;
        onRotationDelta(dx * 0.0062);
      };
      const up = () => {
        draggingRef.current = false;
        onDragChange(false);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [memory, onDragChange, onRotationDelta, onSelect, rotatable],
  );

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      pointerStartRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
      dragCommittedRef.current = false;
      dragIsRotateRef.current = false;
      translateDragRef.current = false;
      touchScaleRef.current = 0.988;
      const g = groupRef.current;
      if (!g) return;

      const move = (ev: PointerEvent) => {
        const start = pointerStartRef.current;
        if (!start || !g) return;
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!dragCommittedRef.current && dx * dx + dy * dy > 49) {
          dragCommittedRef.current = true;
          draggingRef.current = true;
          onSelect(memory);
          onDragChange(true);
          const wantRotate = ev.shiftKey && rotatable && !!onRotationDelta;
          dragIsRotateRef.current = wantRotate;
          translateDragRef.current = !wantRotate;
          if (wantRotate) {
            lastRotateXRef.current = ev.clientX;
          } else {
            const rect = gl.domElement.getBoundingClientRect();
            ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
            ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(ndc, camera);
            if (raycaster.ray.intersectPlane(plane, hit)) {
              dragRef.current = {
                grabDx: hit.x - g.position.x,
                grabDz: hit.z - g.position.z,
              };
            } else {
              dragRef.current = { grabDx: 0, grabDz: 0 };
            }
          }
        }
        if (dragCommittedRef.current) {
          if (dragIsRotateRef.current && onRotationDelta) {
            const rdx = ev.clientX - lastRotateXRef.current;
            lastRotateXRef.current = ev.clientX;
            onRotationDelta(rdx * 0.0068);
          } else {
            flushMoveRef.current(ev);
          }
        }
      };

      const up = () => {
        const didTranslate = dragCommittedRef.current && !dragIsRotateRef.current && translateDragRef.current;
        const gUp = groupRef.current;
        if (didTranslate && onCommitTransform && gUp) {
          const next = snapCommittedPose(
            memory.id,
            gUp.position.x,
            gUp.position.y,
            gUp.position.z,
            rotationY,
            placement,
            collisionRadius,
            backHalf,
          );
          onCommitTransform(next);
        }
        if (!dragCommittedRef.current) {
          onTap?.();
          onSelect(memory);
        }
        pointerStartRef.current = null;
        dragRef.current = null;
        dragCommittedRef.current = false;
        dragIsRotateRef.current = false;
        draggingRef.current = false;
        translateDragRef.current = false;
        onDragChange(false);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [
      backHalf,
      camera,
      collisionRadius,
      hit,
      memory,
      ndc,
      onCommitTransform,
      onDragChange,
      onRotationDelta,
      onSelect,
      onTap,
      placement,
      plane,
      raycaster,
      rotatable,
      rotationY,
    ],
  );

  return (
    <group ref={groupRef}>
      <group rotation={[0, rotationY, 0]}>
        <group ref={breathingRef}>
          <group
            ref={interactRef}
            onPointerDown={onPointerDown}
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
          >
            <DraggableHoverContext.Provider value={hovered}>{children}</DraggableHoverContext.Provider>
          </group>
          {interactiveOverlay}
          {isSelected && rotatable && onRotationDelta ? (
            <group position={[rotateHandleX, rotateHandleY, 0.04]}>
              <mesh
                onPointerDown={onRotateHandleDown}
                onPointerOver={() => setHandleHover(true)}
                onPointerOut={() => setHandleHover(false)}
                renderOrder={10}
              >
                <sphereGeometry args={[0.055, 12, 10]} />
                <meshStandardMaterial
                  color={handleHover ? "#c9b89a" : "#bdae92"}
                  roughness={0.55}
                  metalness={0.08}
                  transparent
                  opacity={handleHover ? 0.88 : 0.62}
                  emissive="#e8dcc4"
                  emissiveIntensity={handleHover ? 0.14 : 0.06}
                  depthWrite={false}
                />
              </mesh>
              <mesh position={[0.07, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.018, 0.0035, 8, 18]} />
                <meshStandardMaterial color="#7a8f72" roughness={0.65} metalness={0.08} transparent opacity={0.85} />
              </mesh>
            </group>
          ) : null}
          {isSelected ? (
            <>
              <group position={[0, selectionHaloY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <mesh renderOrder={-1}>
                  <ringGeometry args={[selectionHaloInner, selectionHaloOuter, 40]} />
                  <meshBasicMaterial color="#a8b89a" transparent opacity={0.5} depthWrite={false} />
                </mesh>
                <mesh renderOrder={-2} scale={1.06}>
                  <ringGeometry args={[selectionHaloOuter, selectionHaloOuter + 0.05, 40]} />
                  <meshBasicMaterial
                    color="#dce8d0"
                    transparent
                    opacity={0.22}
                    depthWrite={false}
                  />
                </mesh>
              </group>
              <pointLight position={[0.12, 0.22, 0.1]} intensity={0.34} distance={2.35} decay={2} color="#fff0d8" />
            </>
          ) : null}
          {showPaper ? (
            <Html
              position={paperOffset}
              transform
              distanceFactor={5.2}
              pointerEvents="none"
              style={{ pointerEvents: "none", width: "92px", zIndex: 2 }}
            >
              <MemoryPaperNote
                text={memory.echo}
                visible={showPaper}
                pinned={isSelected}
                revealMode={paperRevealMode}
              />
            </Html>
          ) : null}
        </group>
      </group>
    </group>
  );
}

const SHIDIZAI_GLB = "/models/shidizai.glb";
/** ~8.8 cm tall on the desk — reads as a small figurine, not a toy statue. */
const SHIDIZAI_TARGET_HEIGHT = 0.088;
const BED_GLB = "/models/bed.glb";
const GUITAR_GLB = "/models/guitar.glb";
const SOFA_GLB = "/models/sofa.glb";
/** Performance: simple lights, no lanterns, idle secondary GLTFs, fewer pick targets on static room. Swap GLBs in /public/models/ for low-poly assets. */
const SCENE_LIGHTWEIGHT = true;
const DEV_LIGHTWEIGHT_LIGHTING = SCENE_LIGHTWEIGHT;

const noopMeshRaycast: THREE.Mesh["raycast"] = function () {
  /* skip — large static room shells need not participate in R3F raycasting */
};

/** Above this, skip cloning BufferGeometry when importing GLBs — keeps your mesh on screen without doubling VRAM. */
const GLTF_VERTEX_FULL_UNSHARE_BUDGET = 72_000;

function countDrawableVertices(obj: THREE.Object3D): number {
  let n = 0;
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry?.attributes?.position) {
      n += m.geometry.attributes.position.count;
    }
  });
  return n;
}

/**
 * `scene.clone(true)` still shares BufferGeometry + Material with the GLTFLoader cache.
 * Skinned meshes: duplicate materials only; keep geometry bound to the cloned skeleton.
 * When `skipGeometryClone`, only materials are duplicated (required for huge libmeshy GLBs).
 */
function deepUnshareGltfMeshes(root: THREE.Object3D, options?: { skipGeometryClone?: boolean }) {
  const skipGeo = options?.skipGeometryClone ?? false;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh & THREE.SkinnedMesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (mesh.isSkinnedMesh) {
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => (m ? m.clone() : m));
      } else if (mesh.material) {
        mesh.material = mesh.material.clone();
      }
      return;
    }
    if (!skipGeo) {
      mesh.geometry = mesh.geometry.clone();
    }
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => (m ? m.clone() : m));
    } else if (mesh.material) {
      mesh.material = mesh.material.clone();
    }
  });
}

function cloneGltfForRoom(scene: THREE.Object3D) {
  const verts = countDrawableVertices(scene);
  const skipGeometryClone = verts > GLTF_VERTEX_FULL_UNSHARE_BUDGET;
  let skinned = false;
  scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
  });
  const r = skinned ? SkeletonUtils.clone(scene) : scene.clone(true);
  deepUnshareGltfMeshes(r, { skipGeometryClone });
  return r;
}

function useIdlePreloadSecondaryGltf() {
  useEffect(() => {
    if (!SCENE_LIGHTWEIGHT) return;
    const run = () => {
      useGLTF.preload(SOFA_GLB);
      useGLTF.preload(GUITAR_GLB);
      useGLTF.preload(SHIDIZAI_GLB);
    };
    const g = globalThis as typeof globalThis & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof g.requestIdleCallback === "function") {
      const id = g.requestIdleCallback(run, { timeout: 3200 });
      return () => g.cancelIdleCallback?.(id);
    }
    const t = g.setTimeout(run, 900);
    return () => g.clearTimeout(t);
  }, []);
}

function IdleHydrateSecondaryGltf({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(!SCENE_LIGHTWEIGHT);
  useEffect(() => {
    if (!SCENE_LIGHTWEIGHT) return;
    const reveal = () => setShow(true);
    const g = globalThis as typeof globalThis & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof g.requestIdleCallback === "function") {
      const id = g.requestIdleCallback(reveal, { timeout: 1200 });
      return () => g.cancelIdleCallback?.(id);
    }
    const t = g.setTimeout(reveal, 500);
    return () => g.clearTimeout(t);
  }, []);
  return show ? children : null;
}

function StaticRoomPickBypass({ children }: { children: ReactNode }) {
  const gRef = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    if (!SCENE_LIGHTWEIGHT || !gRef.current) return;
    gRef.current.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = false;
        m.receiveShadow = false;
        m.raycast = noopMeshRaycast;
      }
    });
  }, []);
  return <group ref={gRef}>{children}</group>;
}

function applyCreamyBedSurface(mm: THREE.Material | null | undefined) {
  if (!mm) return;
  const creamy = new THREE.Color("#f4f0e9");
  const creamyDark = new THREE.Color("#e9e1d6");
  const m = mm as THREE.MeshStandardMaterial & {
    transparent?: boolean;
    opacity?: number;
    depthWrite?: boolean;
    side?: THREE.Side;
    roughness?: number;
    metalness?: number;
  };
  if ("color" in m && m.color && (m.color as THREE.Color).isColor) {
    const c = m.color as THREE.Color;
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    const targetCol = hsl.l < 0.38 ? creamyDark : creamy;
    c.lerp(targetCol, 0.65);
  }
  m.side = THREE.DoubleSide;
  if ("transparent" in m) m.transparent = false;
  if ("opacity" in m) m.opacity = 1;
  if ("depthWrite" in m) m.depthWrite = true;
  if ("depthTest" in m) (m as { depthTest?: boolean }).depthTest = true;
  if (typeof m.roughness === "number") {
    m.roughness = THREE.MathUtils.clamp(m.roughness * 0.92 + 0.06, 0, 1);
  }
  if (typeof m.metalness === "number") {
    m.metalness = Math.min(m.metalness, 0.12);
  }
}

function CreamyBedModel() {
  const { scene } = useGLTF(BED_GLB);
  const root = useMemo(() => cloneGltfForRoom(scene), [scene]);
  const shadowed = !SCENE_LIGHTWEIGHT;

  useLayoutEffect(() => {
    const calcBounds = (target: THREE.Object3D) => {
      target.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(target);
    };

    const creamFallback = () =>
      new THREE.MeshStandardMaterial({
        color: "#f4f0e9",
        roughness: 0.88,
        metalness: 0.04,
        side: THREE.DoubleSide,
      });

    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.visible = true;
      mesh.castShadow = shadowed;
      mesh.receiveShadow = shadowed;
      mesh.frustumCulled = false;
      const raw = mesh.material;
      const list = Array.isArray(raw) ? [...raw] : [raw];
      const next = list.map((mm) => {
        if (!mm) return creamFallback();
        if (mm.type === "ShaderMaterial") return creamFallback();
        if (!("color" in mm) || !(mm as { color?: THREE.Color }).color?.isColor) return creamFallback();
        return mm;
      });
      mesh.material = Array.isArray(raw) ? next : next[0]!;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mm of mats) applyCreamyBedSurface(mm);
    });

    let b0 = calcBounds(root);
    let s0 = b0.getSize(new THREE.Vector3());
    const horiz = Math.max(s0.x, s0.z);
    // Only auto-lay-flat when the model is clearly "standing" (tall and roughly square footprint).
    if (s0.y > horiz * 1.55 && horiz > 1e-6 && s0.y / horiz > 1.35) {
      root.rotation.x = -Math.PI / 2;
      root.updateMatrixWorld(true);
      b0 = calcBounds(root);
      s0 = b0.getSize(new THREE.Vector3());
    }
    const maxSpan = Math.max(s0.x, s0.y, s0.z, 1e-6);
    if (!Number.isFinite(maxSpan) || maxSpan < 1e-4) {
      root.scale.setScalar(1);
      root.position.set(0, 0, 0);
      return;
    }
    const targetSpan = 2.05;
    const scale = THREE.MathUtils.clamp(targetSpan / maxSpan, 0.35, 3.5);
    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);
    const b1 = calcBounds(root);
    const c1 = b1.getCenter(new THREE.Vector3());
    root.position.set(-c1.x, -b1.min.y, -c1.z);
  }, [root, shadowed]);

  return (
    <group>
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[2.02, 0.76, 2.08]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <primitive object={root} />
    </group>
  );
}

function CreamyGuitarModel() {
  const { scene } = useGLTF(GUITAR_GLB);
  const root = useMemo(() => cloneGltfForRoom(scene), [scene]);
  const shadowed = !SCENE_LIGHTWEIGHT;

  useLayoutEffect(() => {
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
    const s = THREE.MathUtils.clamp(0.7 / maxDim, 0.2, 2.4);
    root.scale.setScalar(s);
    root.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(root);
    const c2 = b2.getCenter(new THREE.Vector3());
    root.position.set(-c2.x, -b2.min.y, -c2.z);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = shadowed;
      mesh.receiveShadow = shadowed;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mm of mats) {
        if (!mm || !("isMeshStandardMaterial" in mm) || !(mm as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          continue;
        }
        const std = mm as THREE.MeshStandardMaterial;
        if (std.color) {
          const hsl = { h: 0, s: 0, l: 0 };
          std.color.getHSL(hsl);
          const wood = hsl.l < 0.45 ? new THREE.Color("#8f6348") : new THREE.Color("#caa98b");
          std.color.lerp(wood, 0.68);
          std.color.lerp(new THREE.Color("#f7f1e8"), 0.06);
        }
        std.roughness = THREE.MathUtils.clamp((std.roughness ?? 0.6) * 0.95 + 0.03, 0, 1);
        std.metalness = Math.min(std.metalness ?? 0, 0.2);
      }
    });
  }, [root, shadowed]);

  return (
    <group rotation={[0, -0.22, 0]}>
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[0.34, 0.72, 0.16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <primitive object={root} />
    </group>
  );
}

function CreamySofaModel() {
  const { scene } = useGLTF(SOFA_GLB);
  const root = useMemo(() => cloneGltfForRoom(scene), [scene]);
  const shadowed = !SCENE_LIGHTWEIGHT;

  useLayoutEffect(() => {
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
    const s = THREE.MathUtils.clamp(1.35 / maxDim, 0.2, 3.2);
    root.scale.setScalar(s);
    root.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(root);
    const c2 = b2.getCenter(new THREE.Vector3());
    root.position.set(-c2.x, -b2.min.y, -c2.z);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.visible = true;
      mesh.castShadow = shadowed;
      mesh.receiveShadow = shadowed;
      mesh.frustumCulled = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mm of mats) {
        applyCreamyBedSurface(mm);
      }
    });
  }, [root, shadowed]);

  return (
    <group>
      <mesh position={[0, 0.34, 0]}>
        <boxGeometry args={[1.5, 0.72, 0.7]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <primitive object={root} />
    </group>
  );
}


function ShidizaiDeskCharm({ size = 1 }: { size?: number }) {
  const hovered = useContext(DraggableHoverContext);
  const { scene } = useGLTF(SHIDIZAI_GLB);
  const root = useMemo(() => cloneGltfForRoom(scene), [scene]);
  const lightRef = useRef<THREE.PointLight>(null);
  const warmRef = useRef(0);
  const shadowed = !SCENE_LIGHTWEIGHT;

  useLayoutEffect(() => {
    root.updateMatrixWorld(true);
    const meshBounds = new THREE.Box3();
    const scratch = new THREE.Box3();
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingBox) return;
      scratch.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      meshBounds.union(scratch);
    });
    const box = meshBounds.isEmpty() ? new THREE.Box3().setFromObject(root) : meshBounds;
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
    const s = THREE.MathUtils.clamp(SHIDIZAI_TARGET_HEIGHT / maxDim, 0.12, 2.4);
    root.scale.setScalar(s);
    root.updateMatrixWorld(true);
    const b2 = new THREE.Box3();
    const scratch2 = new THREE.Box3();
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingBox) return;
      scratch2.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      b2.union(scratch2);
    });
    if (b2.isEmpty()) b2.setFromObject(root);
    const c = b2.getCenter(new THREE.Vector3());
    root.position.set(-c.x, -b2.min.y, -c.z);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = shadowed;
      mesh.receiveShadow = shadowed;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const creamyTint = new THREE.Color("#fbf6ee");
      const stitchBlue = new THREE.Color("#3d96d8");
      const stitchDeep = new THREE.Color("#245f95");
      const stitchNavy = new THREE.Color("#1d4d74");
      const stitchEarPink = new THREE.Color("#d487a1");
      for (const mm of mats) {
        if (!mm || !("isMeshStandardMaterial" in mm) || !(mm as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          continue;
        }
        const std = mm as THREE.MeshStandardMaterial;
        if (std.color) {
          const hsl = { h: 0, s: 0, l: 0 };
          std.color.getHSL(hsl);
          const isBlueRange = hsl.h > 0.45 && hsl.h < 0.73;
          const isNeutralBody = hsl.s < 0.32 && hsl.l > 0.14 && hsl.l < 0.82;
          const isVeryDark = hsl.l < 0.2;
          const isPinkRange = hsl.h > 0.86 || hsl.h < 0.06;
          if (isBlueRange || isNeutralBody) {
            const t = isNeutralBody ? 0.8 : 0.62;
            std.color.lerp(hsl.l < 0.35 ? stitchDeep : stitchBlue, t);
            if (hsl.l < 0.18) std.color.lerp(stitchNavy, 0.48);
          } else if (isPinkRange && hsl.s > 0.22) {
            std.color.lerp(stitchEarPink, 0.34);
          } else if (isVeryDark) {
            std.color.lerp(stitchNavy, 0.4);
          }
          std.color.offsetHSL(0, 0.08, 0.01);
          std.color.lerp(creamyTint, 0.04);
        }
        std.roughness = THREE.MathUtils.clamp((std.roughness ?? 0.55) * 0.9 + 0.03, 0, 1);
        std.envMapIntensity = (std.envMapIntensity ?? 1) * 0.82;
        std.emissive = std.emissive ?? new THREE.Color("#000000");
        std.emissive.lerp(new THREE.Color("#2b6fa3"), 0.12);
        std.emissiveIntensity = Math.max(std.emissiveIntensity ?? 0, 0.08);
      }
    });
  }, [root, shadowed]);

  useFrame((_, dt) => {
    const goal = hovered ? 1 : 0;
    warmRef.current = THREE.MathUtils.lerp(warmRef.current, goal, 1 - Math.exp(-12 * dt));
    const w = warmRef.current;
    const L = lightRef.current;
    if (L) L.intensity = w * 0.5;
  });

  return (
    <group scale={size}>
      <pointLight
        ref={lightRef}
        position={[0.02, 0.11, 0.05]}
        color="#fff4e6"
        distance={0.58}
        decay={2}
        intensity={0}
      />
      {/* Larger invisible drag hull so the tiny model is easy to grab/move. */}
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[0.2, 0.24, 0.2]} />
        <meshBasicMaterial transparent opacity={0.01} depthWrite={false} />
      </mesh>
      <primitive object={root} />
    </group>
  );
}

useGLTF.preload(BED_GLB);

function DeskLampMeshes({ lampOn }: { lampOn: boolean }) {
  const shadeMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const bulbMatRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(() => {
    const t = performance.now() * 0.001;
    const s = shadeMatRef.current;
    const b = bulbMatRef.current;
    if (s) {
      s.emissiveIntensity = lampOn ? 0.28 + Math.sin(t * 1.2) * 0.05 : 0.045;
    }
    if (b) {
      b.emissiveIntensity = lampOn ? 1.05 + Math.sin(t * 1.55) * 0.09 + Math.sin(t * 5.1) * 0.02 : 0.07;
    }
  });

  const warm = "#ffd9a8";
  return (
    <group rotation={[0, 0.35, 0]}>
      <RoundedBox args={[0.14, 0.032, 0.14]} radius={0.018} smoothness={3} castShadow position={[0, 0.018, 0]}>
        <meshStandardMaterial color="#ebe4dc" roughness={0.48} metalness={0.14} />
      </RoundedBox>
      {/* Lower arm */}
      <mesh castShadow position={[0.04, 0.12, 0]} rotation={[0, 0, 0.52]}>
        <cylinderGeometry args={[0.014, 0.016, 0.2, 10]} />
        <meshStandardMaterial color="#d8d2ca" roughness={0.42} metalness={0.35} />
      </mesh>
      {/* Upper arm */}
      <mesh castShadow position={[0.1, 0.22, 0.02]} rotation={[0.35, 0, 0.95]}>
        <cylinderGeometry args={[0.012, 0.014, 0.16, 10]} />
        <meshStandardMaterial color="#d8d2ca" roughness={0.4} metalness={0.38} />
      </mesh>
      <group position={[0.14, 0.34, 0.05]} rotation={[-0.38, 0.2, 0.15]}>
        <mesh castShadow>
          <coneGeometry args={[0.1, 0.16, 18, 1, true]} />
          <meshStandardMaterial
            ref={shadeMatRef}
            color="#faf6ee"
            emissive="#ffe9c4"
            emissiveIntensity={lampOn ? 0.3 : 0.06}
            side={THREE.DoubleSide}
            roughness={0.65}
          />
        </mesh>
        <mesh position={[0, -0.04, 0]}>
          <sphereGeometry args={[0.038, 14, 12]} />
          <meshStandardMaterial
            ref={bulbMatRef}
            color="#fff8e8"
            emissive={warm}
            emissiveIntensity={lampOn ? 1.0 : 0.08}
          />
        </mesh>
      </group>
      {lampOn ? (
        <pointLight position={[0.14, 0.32, 0.05]} intensity={1.35} distance={2.8} decay={2} color={warm} />
      ) : null}
    </group>
  );
}

/** Key + fill lights: sun slides toward the window as curtains open; gentle, not technical. */
function AdaptiveRoomLights({
  lampOn,
  curtainBlendRef,
}: {
  lampOn: boolean;
  curtainBlendRef: MutableRefObject<number>;
}) {
  const dirRef = useRef<THREE.DirectionalLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const ambRef = useRef<THREE.AmbientLight>(null);
  const ptWinRef = useRef<THREE.PointLight>(null);
  const ptLampRef = useRef<THREE.PointLight>(null);
  const posMood = useMemo(() => new THREE.Vector3(0.35, 2.15, -3.35), []);
  const posSun = useMemo(() => new THREE.Vector3(4.05, 2.02, 0.32), []);
  const colCool = useMemo(() => new THREE.Color("#dce0e6"), []);
  const colWarm = useMemo(() => new THREE.Color("#fff4e6"), []);

  useLayoutEffect(() => {
    const L = dirRef.current;
    if (L) {
      L.target.position.set(0.05, 0.94, -0.5);
      L.target.updateMatrixWorld();
    }
  }, []);

  useFrame(() => {
    const c = curtainBlendRef.current;
    const lm = lampOn ? 1 : 0.48;
    if (dirRef.current) {
      dirRef.current.position.lerpVectors(posMood, posSun, c);
      dirRef.current.updateMatrixWorld();
      dirRef.current.color.lerpColors(colCool, colWarm, c * 0.9 + 0.1);
      dirRef.current.intensity = (1.02 + c * 1.48) * lm;
    }
    if (hemiRef.current) {
      hemiRef.current.intensity = (0.5 + c * 0.28) * lm;
    }
    if (ambRef.current) {
      ambRef.current.intensity = (0.24 + c * 0.34) * lm + 0.06;
    }
    if (ptWinRef.current) {
      ptWinRef.current.intensity = (0.32 + c * 0.62) * (lampOn ? 1 : 0.38);
    }
    if (ptLampRef.current) {
      ptLampRef.current.intensity = lampOn ? 1.72 * (0.52 + c * 0.48) : 0;
    }
  });

  return (
    <>
      <hemisphereLight ref={hemiRef} color="#f5faf6" groundColor="#ebe4d8" intensity={0.62} />
      <ambientLight ref={ambRef} color="#fffbf6" intensity={0.5} />
      <directionalLight
        ref={dirRef}
        castShadow
        color="#fff2dc"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.4}
        shadow-camera-far={14}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-2.5}
        shadow-bias={-0.00022}
        shadow-radius={4}
      />
      <pointLight
        ref={ptWinRef}
        position={[1.42, 1.34, -0.12]}
        distance={4.8}
        decay={2}
        color="#ffe8c8"
      />
      <pointLight
        ref={ptLampRef}
        position={[-0.38, 0.95, 0.35]}
        distance={3.2}
        decay={2}
        color="#fff1dd"
      />
    </>
  );
}

function LightweightRoomLights({ lampOn }: { lampOn: boolean }) {
  return (
    <>
      <ambientLight color="#fff8ef" intensity={0.72} />
      <hemisphereLight color="#f4f8f5" groundColor="#e8e1d6" intensity={0.48} />
      <directionalLight position={[2.2, 2.6, 1.3]} intensity={0.52} color="#fff2df" />
      {lampOn ? <pointLight position={[-0.45, 0.95, 0.28]} intensity={0.22} distance={2.1} color="#ffe8c9" /> : null}
    </>
  );
}

type YaleDormRoomProps = {
  photoUrl: string;
  selectedId: MemoryId | null;
  onSelectMemory: (m: MemoryEcho) => void;
  /** Per-item: when true, hover/selection shows the tiny paper scrap. */
  paperEnabledById: Partial<Record<MemoryId, boolean>>;
  lampOn: boolean;
  onLampChange: (on: boolean) => void;
  keyboardFocused: boolean;
  onKeyboardFocusedChange: (v: boolean) => void;
  monitorLines: string[];
  monitorDraft: string;
  typingGlowRef: MutableRefObject<number>;
  /** Objects removed from the scene until shown again. */
  hiddenIds?: ReadonlySet<MemoryId>;
};

export function YaleDormRoom({
  photoUrl,
  selectedId,
  onSelectMemory,
  paperEnabledById,
  lampOn,
  onLampChange,
  keyboardFocused,
  onKeyboardFocusedChange,
  monitorLines,
  monitorDraft,
  typingGlowRef,
  hiddenIds,
}: YaleDormRoomProps) {
  const [orbitPaused, setOrbitPaused] = useState(false);
  const [wardrobeDoorsOpen, setWardrobeDoorsOpen] = useState(false);
  const toggleWardrobeDoors = useCallback(() => setWardrobeDoorsOpen((v) => !v), []);
  const [curtainsOpen, setCurtainsOpen] = useState(true);
  const curtainBlendRef = useRef(1);
  const toggleCurtains = useCallback(() => setCurtainsOpen((v) => !v), []);
  useFrame(() => {
    curtainBlendRef.current = THREE.MathUtils.lerp(curtainBlendRef.current, curtainsOpen ? 1 : 0, 0.052);
  });

  const [poseById, setPoseById] = useState(cloneDefaultLayout);
  const [shidizaiSize, setShidizaiSize] = useState(1);
  useIdlePreloadSecondaryGltf();

  const committersById = useMemo(
    () =>
      Object.fromEntries(
        ALL_MEMORY_IDS.map((id) => [
          id,
          (next: RoomObjectPose) => {
            setPoseById((s) => ({ ...s, [id]: next }));
          },
        ]),
      ) as Record<MemoryId, (p: RoomObjectPose) => void>,
    [],
  );

  const rot = useCallback(
    (id: MemoryId) => ({
      rotationY: poseById[id].ry,
      rotatable: true as const,
      onRotationDelta: (delta: number) =>
        setPoseById((s) => ({ ...s, [id]: { ...s[id], ry: s[id].ry + delta } })),
    }),
    [poseById],
  );

  const paper = (id: MemoryId) => ({
    paperEnabled: !!paperEnabledById[id],
    paperOnlyWhenSelected: true as const,
    paperRevealMode: "typewriter" as const,
  });

  const deskTopY = deskSurfaceYFromDeskBase(poseById.desk.y);
  const nudgeShidizaiSize = useCallback(
    (delta: number) => {
      setShidizaiSize((s) => THREE.MathUtils.clamp(s + delta, 0.62, 1.7));
    },
    [],
  );

  const vis = useCallback(
    (id: MemoryId) => {
      if (id === "bed") return true;
      if (id === "openCloset") return false;
      return !hiddenIds?.has(id);
    },
    [hiddenIds],
  );
  const monitorScreenLines = useMemo(() => {
    const base = monitorLines.slice(-5);
    if (monitorDraft) return [...base, `${monitorDraft}▏`];
    if (base.length > 0) return base;
    return ["start typing an echo..."];
  }, [monitorDraft, monitorLines]);

  const mat = useMemo(
    () => ({
      creamWall: { color: "#f2ebe3", roughness: 0.9, metalness: 0 },
      woodFloor: { color: "#c9a87a", roughness: 0.68, metalness: 0.02 },
      carpet: { color: "#d8cfc4", roughness: 0.92, metalness: 0 },
      whitePaint: { color: "#f7f6f2", roughness: 0.45, metalness: 0.05 },
      oak: { color: "#b89570", roughness: 0.62, metalness: 0.02 },
      monitor: { color: "#2a2a2a", roughness: 0.35, metalness: 0.4 },
      metal: { color: "#c8c4c0", roughness: 0.35, metalness: 0.65 },
      guitarWood: { color: "#7a5238", roughness: 0.52, metalness: 0.04 },
      guitarDark: { color: "#3d2a22", roughness: 0.8, metalness: 0 },
      hoodie: { color: "#e8ccd8", roughness: 0.92, metalness: 0 },
      paper: { color: "#f5f2eb", roughness: 0.88, metalness: 0 },
      bookBlue: { color: "#4a6fa5", roughness: 0.65, metalness: 0.05 },
      bookRed: { color: "#a85c5c", roughness: 0.65, metalness: 0.05 },
      lego: [
        { color: "#e85d4c", roughness: 0.55, metalness: 0.05 },
        { color: "#4a90d9", roughness: 0.55, metalness: 0.05 },
        { color: "#f4d35e", roughness: 0.55, metalness: 0.05 },
      ],
      kallaxBin: { color: "#e8c4d0", roughness: 0.74, metalness: 0.06 },
    }),
    [],
  );

  return (
    <group>
      {!DEV_LIGHTWEIGHT_LIGHTING ? (
        <RoomAtmosphere
          lampOn={lampOn}
          typingGlowRef={typingGlowRef}
          curtainBlendRef={curtainBlendRef}
        />
      ) : null}
      <OrbitControls
        makeDefault
        enabled={!orbitPaused}
        enablePan
        minPolarAngle={0.72}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minAzimuthAngle={-0.65}
        maxAzimuthAngle={0.65}
        target={[0, 1.02, -0.82]}
        minDistance={2.55}
        maxDistance={5.8}
        enableDamping
        dampingFactor={0.042}
        rotateSpeed={0.52}
      />
      <ArrowKeyOrbitRotate keyboardFocused={keyboardFocused} />

      {DEV_LIGHTWEIGHT_LIGHTING ? (
        <LightweightRoomLights lampOn={lampOn} />
      ) : (
        <AdaptiveRoomLights lampOn={lampOn} curtainBlendRef={curtainBlendRef} />
      )}

      {!DEV_LIGHTWEIGHT_LIGHTING ? <CeilingPaperLanterns lampOn={lampOn} /> : null}

      <StaticRoomPickBypass>
        <CreamRoomShell />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
          <planeGeometry args={[8, 8]} />
          <meshStandardMaterial {...mat.woodFloor} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.15, 0.004, 0.1]} receiveShadow>
          <planeGeometry args={[2.4, 1.65]} />
          <meshStandardMaterial color="#e8ddd4" roughness={0.9} metalness={0} />
        </mesh>
      </StaticRoomPickBypass>

      <BedWallWindow curtainBlendRef={curtainBlendRef} onToggleCurtains={toggleCurtains} />
      {vis("window") ? (
      <DraggableProp
        memory={MEMORY_BY_ID.window}
        base={[poseById.window.x, poseById.window.y, poseById.window.z]}
        planeY={poseById.window.y}
        placement={PROP_PLACEMENT.window}
        onCommitTransform={committersById.window}
        collisionRadius={0.12}
        selectedId={selectedId}
        onSelect={onSelectMemory}
        onDragChange={setOrbitPaused}
        paperOffset={[0.16, 0.12, 0.02]}
        rotatable={false}
        selectionHaloInner={0.08}
        selectionHaloOuter={0.14}
        selectionHaloY={-0.04}
        {...paper("window")}
      >
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[0.18, 0.34]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </DraggableProp>
      ) : null}

      {/* Wall collage — each frame is its own draggable + persisted pose */}
      <Suspense fallback={null}>
        {vis("wallMemory1") ? (
        <DraggableProp
          memory={MEMORY_BY_ID.wallMemory1}
          base={[poseById.wallMemory1.x, poseById.wallMemory1.y, poseById.wallMemory1.z]}
          planeY={poseById.wallMemory1.y}
          placement={PROP_PLACEMENT.wallMemory1}
          onCommitTransform={committersById.wallMemory1}
          collisionRadius={0.14}
          selectedId={selectedId}
          onSelect={onSelectMemory}
          onDragChange={setOrbitPaused}
          rotateHandleX={0.32}
          rotateHandleY={0.02}
          selectionHaloInner={0.14}
          selectionHaloOuter={0.26}
          selectionHaloY={-0.12}
          {...rot("wallMemory1")}
          {...paper("wallMemory1")}
        >
          <group rotation={[0, 0, 0.035]}>
            <mesh position={[0, 0, 0.06]}>
              <boxGeometry args={[0.58, 0.42, 0.06]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <WallFramedPhoto
              url="/myechos/wall-memory-1.png"
              position={[0, 0, 0]}
              photoW={0.48}
              photoH={0.32}
            />
          </group>
        </DraggableProp>
        ) : null}
        {vis("wallMemory2") ? (
        <DraggableProp
          memory={MEMORY_BY_ID.wallMemory2}
          base={[poseById.wallMemory2.x, poseById.wallMemory2.y, poseById.wallMemory2.z]}
          planeY={poseById.wallMemory2.y}
          placement={PROP_PLACEMENT.wallMemory2}
          onCommitTransform={committersById.wallMemory2}
          collisionRadius={0.12}
          selectedId={selectedId}
          onSelect={onSelectMemory}
          onDragChange={setOrbitPaused}
          rotateHandleX={0.22}
          rotateHandleY={0.02}
          selectionHaloInner={0.1}
          selectionHaloOuter={0.2}
          selectionHaloY={-0.14}
          {...rot("wallMemory2")}
          {...paper("wallMemory2")}
        >
          <group rotation={[0, 0, -0.028]}>
            <mesh position={[0, 0, 0.06]}>
              <boxGeometry args={[0.38, 0.5, 0.06]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <WallFramedPhoto
              url="/myechos/wall-memory-2.png"
              position={[0, 0, 0]}
              photoW={0.29}
              photoH={0.4}
            />
          </group>
        </DraggableProp>
        ) : null}
        {vis("wallMemory3") ? (
        <DraggableProp
          memory={MEMORY_BY_ID.wallMemory3}
          base={[poseById.wallMemory3.x, poseById.wallMemory3.y, poseById.wallMemory3.z]}
          planeY={poseById.wallMemory3.y}
          placement={PROP_PLACEMENT.wallMemory3}
          onCommitTransform={committersById.wallMemory3}
          collisionRadius={0.12}
          selectedId={selectedId}
          onSelect={onSelectMemory}
          onDragChange={setOrbitPaused}
          rotateHandleX={0.2}
          rotateHandleY={0.02}
          selectionHaloInner={0.1}
          selectionHaloOuter={0.19}
          selectionHaloY={-0.11}
          {...rot("wallMemory3")}
          {...paper("wallMemory3")}
        >
          <group rotation={[0, 0, 0.022]}>
            <mesh position={[0, 0, 0.06]}>
              <boxGeometry args={[0.37, 0.47, 0.06]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <WallFramedPhoto
              url="/myechos/wall-memory-3.png"
              position={[0, 0, 0]}
              photoW={0.28}
              photoH={0.37}
            />
          </group>
        </DraggableProp>
        ) : null}
      </Suspense>

      {vis("stickyWall") ? (
      <DraggableProp
        memory={MEMORY_BY_ID.stickyWall}
        base={[poseById.stickyWall.x, poseById.stickyWall.y, poseById.stickyWall.z]}
        planeY={poseById.stickyWall.y}
        placement={PROP_PLACEMENT.stickyWall}
        onCommitTransform={committersById.stickyWall}
        collisionRadius={0.12}
        selectedId={selectedId}
        onSelect={onSelectMemory}
        onDragChange={setOrbitPaused}
        rotateHandleX={0.22}
        rotateHandleY={0.12}
        {...rot("stickyWall")}
        {...paper("stickyWall")}
      >
        <group>
          {(
            [
              [-0.08, 0.06, 0.012, "#fff3b0", 0.1, 0.08, -0.04],
              [0.04, -0.05, 0.014, "#ffd6e8", 0.09, 0.07, 0.05],
              [0.1, 0.08, 0.01, "#ffe8c4", 0.08, 0.09, -0.02],
              [-0.02, -0.1, 0.013, "#d4f0ff", 0.07, 0.08, 0.03],
              [0.12, -0.02, 0.011, "#fff3b0", 0.085, 0.075, 0.06],
              [-0.12, -0.04, 0.015, "#e8ffd4", 0.09, 0.07, -0.05],
              [0.02, 0.11, 0.009, "#ffd6e8", 0.075, 0.085, 0.02],
              [-0.06, 0.12, 0.013, "#fff3b0", 0.08, 0.07, -0.03],
            ] as const
          ).map(([x, y, z, col, w, h, rz], i) => (
            <mesh key={i} position={[x, y, z]} rotation={[0, 0, rz]}>
              <planeGeometry args={[w, h]} />
              <meshStandardMaterial color={col} roughness={0.78} metalness={0} side={THREE.DoubleSide} />
            </mesh>
          ))}
        </group>
      </DraggableProp>
      ) : null}

      {/* Bed — loaded from user GLB, creamy white treatment */}
      {vis("bed") ? (
      <DraggableProp
        memory={MEMORY_BY_ID.bed}
        base={[poseById.bed.x, poseById.bed.y, poseById.bed.z]}
        planeY={0.06}
        placement={PROP_PLACEMENT.bed}
        backHalfDepth={PROP_BACK_HALF.bed}
        onCommitTransform={committersById.bed}
        collisionRadius={0.58}
        selectedId={selectedId}
        onSelect={onSelectMemory}
        onDragChange={setOrbitPaused}
        paperOffset={[0.26, 0.22, 0.1]}
        rotateHandleX={0.62}
        rotateHandleY={0.32}
        selectionHaloInner={0.52}
        selectionHaloOuter={0.68}
        {...rot("bed")}
        {...paper("bed")}
      >
        <Suspense
          fallback={
            <mesh position={[0, 0.18, 0]}>
              <boxGeometry args={[1.9, 0.36, 1.05]} />
              <meshStandardMaterial color="#ebe4dc" roughness={0.9} metalness={0.02} />
            </mesh>
          }
        >
          <CreamyBedModel />
        </Suspense>
      </DraggableProp>
      ) : null}

      {/* Tall closed cabinet — separate from L-desk */}
      {vis("wardrobe") ? (
      <DraggableProp
        memory={MEMORY_BY_ID.wardrobe}
        base={[poseById.wardrobe.x, poseById.wardrobe.y, poseById.wardrobe.z]}
        planeY={0.08}
        placement={PROP_PLACEMENT.wardrobe}
        backHalfDepth={PROP_BACK_HALF.wardrobe}
        onCommitTransform={committersById.wardrobe}
        collisionRadius={0.36}
        selectedId={selectedId}
        onSelect={onSelectMemory}
        onDragChange={setOrbitPaused}
        paperOffset={[0.28, 0.72, 0.12]}
        rotateHandleX={0.34}
        rotateHandleY={0.82}
        {...rot("wardrobe")}
        {...paper("wardrobe")}
        interactiveOverlay={
          <TallWardrobeDoorsInteractive open={wardrobeDoorsOpen} onToggle={toggleWardrobeDoors} />
        }
      >
        <TallWardrobeCarcass />
      </DraggableProp>
      ) : null}

      {/* L-desk along back wall — long run horizontal, shelf against wall */}
      {vis("desk") ? (
      <DraggableProp
        memory={MEMORY_BY_ID.desk}
        base={[poseById.desk.x, poseById.desk.y, poseById.desk.z]}
        planeY={deskTopY}
        placement={PROP_PLACEMENT.desk}
        backHalfDepth={PROP_BACK_HALF.desk}
        onCommitTransform={committersById.desk}
        collisionRadius={0.62}
        selectedId={selectedId}
        onSelect={onSelectMemory}
        onDragChange={setOrbitPaused}
        paperOffset={[0.2, 0.72, 0.1]}
        rotateHandleX={0.58}
        rotateHandleY={0.09}
        selectionHaloInner={0.55}
        selectionHaloOuter={0.72}
        {...rot("desk")}
        {...paper("desk")}
      >
        <KallaxWorkstation white={mat.whitePaint} binPink={mat.kallaxBin} />
      </DraggableProp>
      ) : null}

      {vis("keyboard") ? (
      <DraggableProp
        memory={MEMORY_BY_ID.keyboard}
        base={[poseById.keyboard.x, poseById.keyboard.y, poseById.keyboard.z]}
        planeY={poseById.keyboard.y}
        placement={PROP_PLACEMENT.keyboard}
        onCommitTransform={committersById.keyboard}
        collisionRadius={0.11}
        selectedId={selectedId}
        onSelect={onSelectMemory}
        onDragChange={setOrbitPaused}
        paperOffset={[0.12, 0.06, 0.05]}
        rotateHandleX={0.22}
        rotateHandleY={0.04}
        onTap={() => onKeyboardFocusedChange(true)}
        {...rot("keyboard")}
        {...paper("keyboard")}
      >
        <KeyboardCap focused={keyboardFocused} />
      </DraggableProp>
      ) : null}

      {/* Open wardrobe — visible clothes */}
      {vis("openCloset") ? (
      <DraggableProp
        memory={MEMORY_BY_ID.openCloset}
        base={[poseById.openCloset.x, poseById.openCloset.y, poseById.openCloset.z]}
        planeY={0.08}
        placement={PROP_PLACEMENT.openCloset}
        backHalfDepth={PROP_BACK_HALF.openCloset}
        onCommitTransform={committersById.openCloset}
        collisionRadius={0.42}
        selectedId={selectedId}
        onSelect={onSelectMemory}
        onDragChange={setOrbitPaused}
        paperOffset={[0.2, 0.65, 0.1]}
        rotateHandleX={0.36}
        rotateHandleY={0.88}
        {...rot("openCloset")}
        {...paper("openCloset")}
      >
        <OpenClosetWithClothes />
      </DraggableProp>
      ) : null}

      {vis("monitor") ? (
      <DraggableProp
        memory={MEMORY_BY_ID.monitor}
        base={[poseById.monitor.x, poseById.monitor.y, poseById.monitor.z]}
        planeY={poseById.monitor.y + 0.19}
        placement={PROP_PLACEMENT.monitor}
        onCommitTransform={committersById.monitor}
        collisionRadius={0.18}
        selectedId={selectedId}
        onSelect={onSelectMemory}
        onDragChange={setOrbitPaused}
        paperOffset={[0.22, 0.38, 0.04]}
        rotateHandleX={0.32}
        rotateHandleY={0.22}
        {...rot("monitor")}
        {...paper("monitor")}
      >
        <mesh position={[0, 0.19, 0.05]}>
          <boxGeometry args={[0.64, 0.42, 0.2]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {/* Stand — column + foot */}
        <mesh castShadow position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.028, 0.034, 0.1, 14]} />
          <meshStandardMaterial color="#2a2a2a" roughness={0.45} metalness={0.35} />
        </mesh>
        <RoundedBox args={[0.22, 0.016, 0.1]} radius={0.004} smoothness={2} castShadow position={[0, 0.004, 0]}>
          <meshStandardMaterial color="#242424" roughness={0.5} metalness={0.4} />
        </RoundedBox>
        {/* Bezel */}
        <RoundedBox args={[0.54, 0.36, 0.026]} radius={0.012} smoothness={3} castShadow position={[0, 0.21, 0]}>
          <meshStandardMaterial color="#141414" roughness={0.38} metalness={0.55} />
        </RoundedBox>
        <mesh castShadow position={[0, 0.21, -0.014]}>
          <boxGeometry args={[0.5, 0.32, 0.012]} />
          <meshStandardMaterial color="#0a0a0a" roughness={0.55} metalness={0.25} />
        </mesh>
        <Suspense
          fallback={
            <mesh position={[0, 0.21, 0.008]}>
              <planeGeometry args={[0.48, 0.3]} />
              <meshStandardMaterial color="#070707" roughness={0.65} />
            </mesh>
          }
        >
          <MonitorHeroScreen />
        </Suspense>
        {/* Screen glow rim */}
        <mesh position={[0, 0.21, 0.011]}>
          <planeGeometry args={[0.49, 0.31]} />
          <meshStandardMaterial
            color="#fff6e8"
            transparent
            opacity={0.12}
            depthWrite={false}
            emissive="#ffe8cc"
            emissiveIntensity={0.35}
          />
        </mesh>
        <group position={[0, 0.21, 0.014]} renderOrder={4}>
          {monitorScreenLines.map((line, i) => (
            <Text
              key={`${i}-${line.slice(0, 12)}`}
              position={[0, 0.108 - i * 0.044, 0]}
              fontSize={0.022}
              maxWidth={0.42}
              lineHeight={1.18}
              textAlign="center"
              anchorX="center"
              anchorY="middle"
              color={monitorLines.length === 0 && !monitorDraft ? "#f4f0dc" : "#eaf7df"}
              outlineWidth={0.0013}
              outlineColor="#7aa27a"
            >
              {line}
            </Text>
          ))}
        </group>
      </DraggableProp>
      ) : null}

      {vis("deskLamp") ? (
      <DraggableProp
        memory={MEMORY_BY_ID.deskLamp}
        base={[poseById.deskLamp.x, poseById.deskLamp.y, poseById.deskLamp.z]}
        planeY={poseById.deskLamp.y + 0.02}
        placement={PROP_PLACEMENT.deskLamp}
        onCommitTransform={committersById.deskLamp}
        collisionRadius={0.11}
        selectedId={selectedId}
        onSelect={onSelectMemory}
        onDragChange={setOrbitPaused}
        paperOffset={[-0.11, 0.2, 0.06]}
        rotateHandleX={0.14}
        rotateHandleY={0.16}
        onTap={() => onLampChange(!lampOn)}
        {...rot("deskLamp")}
        {...paper("deskLamp")}
      >
        <DeskLampMeshes lampOn={lampOn} />
      </DraggableProp>
      ) : null}

      {vis("mirror") ? (
      <DraggableProp
        memory={MEMORY_BY_ID.mirror}
        base={[poseById.mirror.x, poseById.mirror.y, poseById.mirror.z]}
        planeY={poseById.mirror.y + 0.06}
        placement={PROP_PLACEMENT.mirror}
        onCommitTransform={committersById.mirror}
        collisionRadius={0.09}
        selectedId={selectedId}
        onSelect={onSelectMemory}
        onDragChange={setOrbitPaused}
        rotateHandleX={0.14}
        rotateHandleY={0.18}
        {...rot("mirror")}
        {...paper("mirror")}
      >
        <VanityStandingMirror />
      </DraggableProp>
      ) : null}

      {vis("sofa") ? (
        <IdleHydrateSecondaryGltf>
          <DraggableProp
            memory={MEMORY_BY_ID.sofa}
            base={[poseById.sofa.x, poseById.sofa.y, poseById.sofa.z]}
            planeY={0.06}
            placement={PROP_PLACEMENT.sofa}
            backHalfDepth={PROP_BACK_HALF.sofa}
            onCommitTransform={committersById.sofa}
            collisionRadius={0.46}
            selectedId={selectedId}
            onSelect={onSelectMemory}
            onDragChange={setOrbitPaused}
            paperOffset={[0.28, 0.28, 0.08]}
            rotateHandleX={0.46}
            rotateHandleY={0.2}
            selectionHaloInner={0.44}
            selectionHaloOuter={0.62}
            {...rot("sofa")}
            {...paper("sofa")}
          >
            <Suspense fallback={null}>
              <CreamySofaModel />
            </Suspense>
          </DraggableProp>
        </IdleHydrateSecondaryGltf>
      ) : null}

      {vis("chair") ? (
      <DraggableProp
        memory={MEMORY_BY_ID.chair}
        base={[poseById.chair.x, poseById.chair.y, poseById.chair.z]}
        planeY={0.06}
        placement={PROP_PLACEMENT.chair}
        backHalfDepth={PROP_BACK_HALF.chair}
        onCommitTransform={committersById.chair}
        collisionRadius={0.26}
        selectedId={selectedId}
        onSelect={onSelectMemory}
        onDragChange={setOrbitPaused}
        paperOffset={[0.18, 0.42, 0.06]}
        rotateHandleX={0.34}
        rotateHandleY={0.38}
        {...rot("chair")}
        {...paper("chair")}
      >
        {/* Office chair — practical silhouette, still creamy/stylized */}
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2;
          const armLen = 0.28;
          return (
            <group key={i}>
              <mesh castShadow position={[Math.sin(a) * 0.14, 0.032, Math.cos(a) * 0.14]} rotation={[0.06, a, 0]}>
                <boxGeometry args={[0.05, 0.016, armLen]} />
                <meshStandardMaterial color="#ddd8d3" roughness={0.45} metalness={0.35} />
              </mesh>
              <mesh castShadow position={[Math.sin(a) * 0.23, 0.018, Math.cos(a) * 0.23]}>
                <sphereGeometry args={[0.026, 10, 8]} />
                <meshStandardMaterial color="#343434" roughness={0.84} metalness={0.07} />
              </mesh>
            </group>
          );
        })}
        <mesh castShadow position={[0, 0.062, 0]}>
          <cylinderGeometry args={[0.064, 0.074, 0.032, 18]} />
          <meshStandardMaterial color="#d8d3ce" roughness={0.48} metalness={0.22} />
        </mesh>
        <mesh castShadow position={[0, 0.24, 0]}>
          <cylinderGeometry args={[0.018, 0.024, 0.32, 14]} />
          <meshStandardMaterial color="#beb9b3" roughness={0.3} metalness={0.58} />
        </mesh>
        <mesh castShadow position={[0, 0.355, 0]}>
          <cylinderGeometry args={[0.048, 0.054, 0.07, 18]} />
          <meshStandardMaterial color="#d6d0cb" roughness={0.44} metalness={0.2} />
        </mesh>
        <RoundedBox args={[0.48, 0.075, 0.46]} radius={0.034} smoothness={5} castShadow position={[0, 0.41, 0.03]}>
          <meshPhysicalMaterial
            color="#f2efea"
            roughness={0.5}
            metalness={0.03}
            clearcoat={0.18}
            clearcoatRoughness={0.5}
          />
        </RoundedBox>
        <RoundedBox args={[0.42, 0.5, 0.09]} radius={0.04} smoothness={5} castShadow position={[0, 0.67, -0.17]}>
          <meshPhysicalMaterial
            color="#f6f3ef"
            roughness={0.46}
            metalness={0.02}
            clearcoat={0.16}
            clearcoatRoughness={0.52}
          />
        </RoundedBox>
        <RoundedBox args={[0.28, 0.08, 0.04]} radius={0.02} smoothness={4} castShadow position={[0.28, 0.56, 0.02]}>
          <meshStandardMaterial color="#ebe7e2" roughness={0.55} metalness={0.04} />
        </RoundedBox>
        <RoundedBox args={[0.28, 0.08, 0.04]} radius={0.02} smoothness={4} castShadow position={[-0.28, 0.56, 0.02]}>
          <meshStandardMaterial color="#ebe7e2" roughness={0.55} metalness={0.04} />
        </RoundedBox>
      </DraggableProp>
      ) : null}

      {/* Lego + souvenirs cluster */}
      {vis("legoSouvenirs") ? (
      <DraggableProp
        memory={MEMORY_BY_ID.legoSouvenirs}
        base={[poseById.legoSouvenirs.x, poseById.legoSouvenirs.y, poseById.legoSouvenirs.z]}
        planeY={poseById.legoSouvenirs.y + 0.02}
        placement={PROP_PLACEMENT.legoSouvenirs}
        onCommitTransform={committersById.legoSouvenirs}
        collisionRadius={0.11}
        selectedId={selectedId}
        onSelect={onSelectMemory}
        onDragChange={setOrbitPaused}
        rotateHandleX={0.16}
        rotateHandleY={0.06}
        {...rot("legoSouvenirs")}
        {...paper("legoSouvenirs")}
      >
        <LegoSouvenirsCluster lego={mat.lego} />
      </DraggableProp>
      ) : null}

      {vis("shidizai") ? (
        <IdleHydrateSecondaryGltf>
          <DraggableProp
            memory={MEMORY_BY_ID.shidizai}
            base={[poseById.shidizai.x, poseById.shidizai.y, poseById.shidizai.z]}
            planeY={0.04}
            placement={PROP_PLACEMENT.shidizai}
            onCommitTransform={committersById.shidizai}
            collisionRadius={0.14}
            selectedId={selectedId}
            onSelect={onSelectMemory}
            onDragChange={setOrbitPaused}
            paperOffset={[0.11, 0.12, 0.03]}
            rotateHandleX={0.16}
            rotateHandleY={0.14}
            selectionHaloInner={0.1}
            selectionHaloOuter={0.16}
            selectionHaloY={0.01}
            paperOnlyWhenSelected
            paperRevealMode="fade"
            {...rot("shidizai")}
            paperEnabled={false}
          >
            <Suspense fallback={null}>
              <ShidizaiDeskCharm size={shidizaiSize} />
            </Suspense>
            {selectedId === "shidizai" ? (
              <Html
                position={[0.15, 0.07, 0]}
                transform
                distanceFactor={4.3}
                style={{ width: "112px" }}
              >
                <div
                  className="pointer-events-auto flex items-center justify-between gap-1.5 rounded-full border border-[#c8d7c8]/65 bg-[#fbf8f1]/85 px-2 py-1 text-[10px] text-[#4f5a49] shadow-[0_6px_18px_rgba(90,90,70,0.14)] backdrop-blur-sm"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <span className="font-serif text-[9px] tracking-wide">size</span>
                  <button
                    type="button"
                    className="rounded-full border border-[#c8cfbb] bg-[#f4f6ee] px-2 py-0.5 text-[10px] leading-none text-[#56634f] hover:bg-[#eef3e4]"
                    onClick={() => nudgeShidizaiSize(-0.08)}
                  >
                    smaller
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-[#b9c9b1] bg-[#edf5e9] px-2 py-0.5 text-[10px] leading-none text-[#4f6452] hover:bg-[#e5f0e0]"
                    onClick={() => nudgeShidizaiSize(0.08)}
                  >
                    bigger
                  </button>
                </div>
              </Html>
            ) : null}
          </DraggableProp>
        </IdleHydrateSecondaryGltf>
      ) : null}

      {/* Photo frame + user image */}
      {vis("photoFrame") ? (
      <DraggableProp
        memory={MEMORY_BY_ID.photoFrame}
        base={[poseById.photoFrame.x, poseById.photoFrame.y, poseById.photoFrame.z]}
        planeY={poseById.photoFrame.y}
        placement={PROP_PLACEMENT.photoFrame}
        onCommitTransform={committersById.photoFrame}
        collisionRadius={0.1}
        selectedId={selectedId}
        onSelect={onSelectMemory}
        onDragChange={setOrbitPaused}
        rotateHandleX={0.26}
        rotateHandleY={0.3}
        {...rot("photoFrame")}
        {...paper("photoFrame")}
      >
        <mesh position={[0, 0, 0.05]}>
          <boxGeometry args={[0.52, 0.62, 0.14]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <RoundedBox args={[0.44, 0.54, 0.038]} radius={0.014} smoothness={3} castShadow receiveShadow>
          <meshPhysicalMaterial color="#c9b8a5" roughness={0.72} metalness={0.04} clearcoat={0.06} clearcoatRoughness={0.65} />
        </RoundedBox>
        <Suspense
          key={photoUrl}
          fallback={
            <mesh position={[0, 0, 0.028]}>
              <planeGeometry args={[0.34, 0.42]} />
              <meshStandardMaterial color="#e8e0d6" roughness={0.85} />
            </mesh>
          }
        >
          <PhotoInFrame url={photoUrl} />
        </Suspense>
      </DraggableProp>
      ) : null}

      {/* Guitar from user GLB */}
      {vis("guitar") ? (
        <IdleHydrateSecondaryGltf>
          <DraggableProp
            memory={MEMORY_BY_ID.guitar}
            base={[poseById.guitar.x, poseById.guitar.y, poseById.guitar.z]}
            planeY={0.06}
            placement={PROP_PLACEMENT.guitar}
            backHalfDepth={PROP_BACK_HALF.guitar}
            onCommitTransform={committersById.guitar}
            collisionRadius={0.16}
            selectedId={selectedId}
            onSelect={onSelectMemory}
            onDragChange={setOrbitPaused}
            rotateHandleX={0.22}
            rotateHandleY={0.28}
            {...rot("guitar")}
            {...paper("guitar")}
          >
            <Suspense fallback={null}>
              <CreamyGuitarModel />
            </Suspense>
          </DraggableProp>
        </IdleHydrateSecondaryGltf>
      ) : null}

      {/* Hoodie on chair */}
      {vis("hoodie") ? (
      <DraggableProp
        memory={MEMORY_BY_ID.hoodie}
        base={[poseById.hoodie.x, poseById.hoodie.y, poseById.hoodie.z]}
        planeY={poseById.hoodie.y}
        placement={PROP_PLACEMENT.hoodie}
        onCommitTransform={committersById.hoodie}
        collisionRadius={0.13}
        selectedId={selectedId}
        onSelect={onSelectMemory}
        onDragChange={setOrbitPaused}
        rotateHandleX={0.22}
        rotateHandleY={0.12}
        {...rot("hoodie")}
        {...paper("hoodie")}
      >
        <group rotation={[0.18, -0.85, 0.08]}>
          <mesh castShadow position={[0, 0.02, 0]} scale={[1, 0.35, 0.85]}>
            <sphereGeometry args={[0.22, 18, 14]} />
            <meshPhysicalMaterial
              {...mat.hoodie}
              sheen={0.65}
              sheenRoughness={0.55}
              sheenColor={mat.hoodie.color}
            />
          </mesh>
          <mesh castShadow position={[0, 0.06, -0.14]} rotation={[0.5, 0, 0]}>
            <sphereGeometry args={[0.12, 14, 10]} />
            <meshPhysicalMaterial {...mat.hoodie} roughness={0.9} />
          </mesh>
          <mesh castShadow position={[0.08, 0.04, 0.06]} rotation={[0.2, 0, 0.4]}>
            <cylinderGeometry args={[0.045, 0.055, 0.12, 12]} />
            <meshPhysicalMaterial {...mat.hoodie} />
          </mesh>
        </group>
      </DraggableProp>
      ) : null}

      {vis("cableNest") ? (
      <DraggableProp
        memory={MEMORY_BY_ID.cableNest}
        base={[poseById.cableNest.x, poseById.cableNest.y, poseById.cableNest.z]}
        planeY={poseById.cableNest.y + 0.01}
        placement={PROP_PLACEMENT.cableNest}
        onCommitTransform={committersById.cableNest}
        collisionRadius={0.09}
        selectedId={selectedId}
        onSelect={onSelectMemory}
        onDragChange={setOrbitPaused}
        rotateHandleX={0.2}
        rotateHandleY={0.02}
        {...rot("cableNest")}
        {...paper("cableNest")}
      >
        <mesh castShadow position={[0.02, 0.006, -0.02]} rotation={[Math.PI / 2, 0, 0.85]}>
          <torusGeometry args={[0.09, 0.0065, 6, 28]} />
          <meshStandardMaterial color="#3a3a3a" roughness={0.82} />
        </mesh>
        <mesh castShadow position={[-0.03, 0.005, 0.02]} rotation={[Math.PI / 2, 0.15, 0.4]}>
          <torusGeometry args={[0.065, 0.005, 6, 24]} />
          <meshStandardMaterial color="#2c2c2c" roughness={0.85} />
        </mesh>
        <mesh castShadow position={[0.04, 0.004, 0.03]} rotation={[1.35, 0.2, 0.1]}>
          <cylinderGeometry args={[0.004, 0.004, 0.14, 6]} />
          <meshStandardMaterial color="#4a4846" roughness={0.55} metalness={0.15} />
        </mesh>
      </DraggableProp>
      ) : null}
    </group>
  );
}

export default YaleDormRoom;
