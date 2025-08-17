"use client";

import { useRef, useMemo, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  useVideoCanvas,
  VideoCanvas,
  VideoCanvasManager,
} from "./lib/video-timeline";
import { Button } from "./components/ui/button";
import { observer } from "mobx-react";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const Scene = observer(() => {
  // const videoCanvasRef = useRef<VideoCanvasManager>(null);
  const [videoCanvas, setVideoCanvas] = useState<VideoCanvasManager | null>(
    null
  );
  return (
    <div className="w-screen h-screen bg-white flex flex-col items-center justify-center">
      {videoCanvas?.isPlaying ? (
        <Button onClick={() => videoCanvas?.pause()}>Pause</Button>
      ) : (
        <Button onClick={() => videoCanvas?.play()}>Play</Button>
      )}
      <Button
        onClick={() =>
          videoCanvas
            ?.record({ duration: 10 })
            .then((blob) => download(blob, "myfile"))
            .catch((err) => console.log("ERRRRRRRRORR", err?.message))
        }
      >
        Record
      </Button>
      <div className="h-1/2 w-1/2 bg-black">
        <VideoCanvas
          fps={10}
          onCreated={({ videoCanvas }) => {
            setVideoCanvas(videoCanvas);
          }}
        >
          <color attach="background" args={["black"]} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <RotatingCube />
        </VideoCanvas>
      </div>
    </div>
  );
});

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
