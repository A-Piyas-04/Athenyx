"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * "The assay table": the brand mark struck in metal. Three gold bars step down
 * in width and tone, left-flush, exactly as BrandMark draws them, resting in
 * front of the square hallmark punch. One hard key light rakes across the
 * milled bevels. The only motion is a ~57-second rotation, a barely visible
 * breathing, and pointer parallax.
 *
 * Deliberately NOT using @react-three/drei: the three things it would give us
 * here (Environment, RoundedBox, Center) are a PMREMGenerator + RoomEnvironment
 * (both in core three), an ExtrudeGeometry with a bevel — which is better,
 * because the bevel IS the milled edge that catches the light — and two
 * hardcoded offsets. Please don't add it.
 *
 * This is the only module in the marketing tree that imports three or R3F, so
 * that everything else stays off the critical path.
 */

/** A bar with a rounded profile and a bevelled edge. */
function barGeometry(width: number, height: number, depth: number) {
  const r = 0.07;
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.028,
    bevelSize: 0.028,
    bevelOffset: 0,
    bevelSegments: 3,
    curveSegments: 6,
  });
  geometry.center();
  return geometry;
}

function roundedSquarePath(size: number, radius: number) {
  const s = size / 2;
  const path = new THREE.Path();
  path.moveTo(-s + radius, -s);
  path.lineTo(s - radius, -s);
  path.quadraticCurveTo(s, -s, s, -s + radius);
  path.lineTo(s, s - radius);
  path.quadraticCurveTo(s, s, s - radius, s);
  path.lineTo(-s + radius, s);
  path.quadraticCurveTo(-s, s, -s, s - radius);
  path.lineTo(-s, -s + radius);
  path.quadraticCurveTo(-s, -s, -s + radius, -s);
  return path;
}

/** The punch: a rounded square ring. */
function frameGeometry() {
  const shape = new THREE.Shape(roundedSquarePath(3.4, 0.34).getPoints(24));
  shape.holes.push(roundedSquarePath(2.78, 0.26));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.18,
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.022,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geometry.center();
  return geometry;
}

const BARS = [
  { w: 2.0, y: 0.6, x: 0, z: 0, color: "#e1c802", roughness: 0.26 },
  { w: 1.44, y: 0.0, x: -0.14, z: 0.06, color: "#a28900", roughness: 0.33 },
  { w: 0.88, y: -0.6, x: -0.28, z: 0.12, color: "#806800", roughness: 0.41 },
];

/**
 * Builds the room-light environment that makes the gold read as metal — the
 * one thing that would otherwise justify pulling in drei.
 *
 * This runs from the Canvas `onCreated` callback rather than from a hook,
 * because assigning `scene.environment` is a mutation and the React Compiler
 * (correctly) refuses mutations of values returned by hooks. The generator is
 * disposed immediately: the texture it produced stays valid without it.
 */
function buildEnvironment(gl: THREE.WebGLRenderer, scene: THREE.Scene): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(gl);
  const room = new RoomEnvironment();
  const texture = pmrem.fromScene(room, 0.04).texture;
  scene.environment = texture;
  pmrem.dispose();
  room.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry?.dispose();
  });
  return texture;
}

function Hallmark({ scroll }: { scroll: MotionValue<number> }) {
  const group = useRef<THREE.Group>(null);
  const frame = useRef<THREE.Mesh>(null);
  const bars = useRef<(THREE.Mesh | null)[]>([]);

  const geometries = useMemo(
    () => ({
      bars: BARS.map((bar) => barGeometry(bar.w, 0.425, 0.3)),
      frame: frameGeometry(),
    }),
    [],
  );

  useEffect(
    () => () => {
      geometries.bars.forEach((g) => g.dispose());
      geometries.frame.dispose();
    },
    [geometries],
  );

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const p = scroll.get();
    const pointer = state.pointer;

    g.rotation.y += delta * 0.11;
    // Damp toward the pointer instead of snapping; never re-render React.
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, g.rotation.y + pointer.x * 0.16, 4, delta);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, -pointer.y * 0.07, 4, delta);
    g.position.y = p * 0.5;

    state.camera.position.z = 5.2 + p * 1.6;

    const t = state.clock.elapsedTime;
    bars.current.forEach((bar, i) => {
      if (bar) bar.position.y = BARS[i].y + Math.sin(t * 0.55 + i * 1.9) * 0.022;
    });
    if (frame.current) frame.current.rotation.z -= delta * 0.035;
  });

  return (
    <group ref={group}>
      <mesh ref={frame} geometry={geometries.frame} position={[0.18, 0, -0.95]}>
        <meshStandardMaterial color="#412201" metalness={0.85} roughness={0.52} />
      </mesh>
      {BARS.map((bar, i) => (
        <mesh
          key={bar.color}
          ref={(node) => {
            bars.current[i] = node;
          }}
          geometry={geometries.bars[i]}
          position={[bar.x, bar.y, bar.z]}
        >
          <meshStandardMaterial color={bar.color} metalness={1} roughness={bar.roughness} />
        </mesh>
      ))}
    </group>
  );
}

export function AssayScene({ scroll, onReady }: { scroll: MotionValue<number>; onReady?: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const env = useRef<THREE.Texture | null>(null);
  const [active, setActive] = useState(true);

  // R3F disposes the renderer and the scene graph itself; the environment
  // texture is ours, so we release it here.
  useEffect(
    () => () => {
      env.current?.dispose();
      env.current = null;
    },
    [],
  );

  // Stop the render loop entirely when the hero is scrolled past or the tab is
  // hidden: "never" drops the rAF loop, so the GPU goes quiet.
  useEffect(() => {
    const node = wrap.current;
    if (!node) return;
    const io = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { threshold: 0.05 });
    io.observe(node);
    const onVisibility = () => setActive(!document.hidden && !!node.isConnected);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div ref={wrap} className="h-full w-full">
      <Canvas
        frameloop={active ? "always" : "never"}
        dpr={[1, 1.75]}
        resize={{ scroll: false, debounce: { scroll: 0, resize: 120 } }}
        camera={{ fov: 32, position: [0, 1.15, 5.2] }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        onCreated={({ gl, camera, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          camera.lookAt(0, 0.05, 0);
          env.current = buildEnvironment(gl, scene);
          onReady?.();
        }}
      >
        <ambientLight intensity={0.18} />
        <directionalLight position={[3.4, 4.6, 3.2]} intensity={2.6} />
        <directionalLight position={[-2.6, 1.2, -3]} intensity={0.75} color="#f0dc5a" />
        <directionalLight position={[0, -2, 2]} intensity={0.25} color="#614501" />
        <Hallmark scroll={scroll} />
      </Canvas>
    </div>
  );
}
