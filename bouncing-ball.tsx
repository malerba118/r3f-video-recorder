"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
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
    <div className="w-screen h-screen bg-white flex flex-col items-center justify-center">
      <button onClick={() => videoCanvasRef.current?.play()}>Play</button>
      <button onClick={() => videoCanvasRef.current?.pause()}>Pause</button>
      <button
        onClick={() =>
          videoCanvasRef.current
            ?.record({ duration: 10 })
            .then((blob) => download(blob, "myfile"))
            .catch((err) => console.log("ERRRRRRRRORR", err?.message))
        }
      >
        Record
      </button>
      <div className="h-1/2 w-1/2 bg-black">
        <VideoCanvas
          ref={videoCanvasRef}
          fps={10}
          camera={{ position: [0, 0, 8] }}
        >
          <color attach="background" args={["black"]} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <RotatingCube />
        </VideoCanvas>
      </div>
    </div>
  );
}

function RotatingCube() {
  const canvas = useVideoCanvas();
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;
    // Rotate the cube based on videoCanvas.time
    meshRef.current.rotation.x = canvas.time;
    meshRef.current.rotation.y = canvas.time * 0.7;
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="orange" />
    </mesh>
  );
}
