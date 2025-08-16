"use client";

import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  useVideoCanvas,
  VideoCanvas,
  VideoCanvasManager,
} from "./lib/video-timeline";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Scene() {
  const videoCanvasRef = useRef<VideoCanvasManager>(null);
  return (
    <div className="w-screen h-screen bg-gray-900 flex flex-col items-center justify-center">
      <button onClick={() => videoCanvasRef.current?.play()}>Play</button>
      <button onClick={() => videoCanvasRef.current?.pause()}>Pause</button>
      <div className="h-1/2 w-1/2">
        <VideoCanvas
          fps={10}
          onVideoCanvasCreated={(videoCanvas) => {
            videoCanvasRef.current = videoCanvas;
          }}
          camera={{ position: [0, 0, 8] }}
          gl={{ preserveDrawingBuffer: true }}
        >
          <ambientLight intensity={0.4} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <BouncingBall />
          <Walls />
          <OrbitControls />
        </VideoCanvas>
      </div>
    </div>
  );
}

function BouncingBall() {
  const canvas = useVideoCanvas();
  const meshRef = useRef<THREE.Mesh>(null);

  // Define boundaries
  const bounds = {
    x: 4,
    y: 3,
    z: 3,
  };

  useFrame((state) => {
    if (!meshRef.current) return;

    const time = canvas.time;

    // Define speeds for each axis (cycles per second)
    const speedX = 0.8;
    const speedY = 0.6;
    const speedZ = 0.4;

    // Calculate position as pure functions of time that bounce between boundaries
    // Using a triangle wave function that oscillates between -bounds and +bounds
    const triangleWave = (t: number, speed: number, amplitude: number) => {
      const cycle = (t * speed) % 2;
      return cycle <= 1
        ? (cycle * 2 - 1) * amplitude // -amplitude to +amplitude
        : (3 - cycle * 2) * amplitude; // +amplitude to -amplitude
    };

    const x = triangleWave(time, speedX, bounds.x);
    const y = triangleWave(time, speedY, bounds.y);
    const z = triangleWave(time, speedZ, bounds.z);

    // Update mesh position directly from time
    meshRef.current.position.set(x, y, z);
  });

  return (
    <mesh
      ref={meshRef}
      onPointerDown={() =>
        canvas
          .record({ duration: 8 })
          .then((blob) => download(blob, "myfile"))
          .catch((err) => console.log("ERRRRRRRRORR", err?.message))
      }
    >
      <sphereGeometry args={[0.2, 32, 32]} />
      <meshStandardMaterial color="#ff6b6b" roughness={0.3} metalness={0.1} />
    </mesh>
  );
}

function Walls() {
  const bounds = {
    x: 4,
    y: 3,
    z: 3,
  };

  return (
    <group>
      {/* Invisible walls - just for visual reference */}
      <lineSegments>
        <edgesGeometry
          args={[
            new THREE.BoxGeometry(bounds.x * 2, bounds.y * 2, bounds.z * 2),
          ]}
        />
        <lineBasicMaterial color="#444444" transparent opacity={0.3} />
      </lineSegments>
    </group>
  );
}
