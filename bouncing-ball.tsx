"use client";

import { useRef, useMemo, useState, useEffect } from "react";
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
import { Slider } from "./components/ui/slider";
import { autorun, reaction, when } from "mobx";

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
  const fps = 12;
  const maxDuration = 10;
  const maxFrames = maxDuration * fps;
  const [videoCanvas, setVideoCanvas] = useState<VideoCanvasManager | null>(
    null
  );

  useEffect(() => {
    if (videoCanvas) {
      return reaction(
        () => videoCanvas.time,
        (time) => {
          if (time >= maxDuration) {
            videoCanvas.pause();
            videoCanvas.setTime(maxDuration);
          }
        }
      );
    }
  }, [videoCanvas]);

  return (
    <div className="w-screen h-screen bg-white flex flex-col items-center justify-center">
      <div className="h-1/2 w-1/2 bg-black">
        <VideoCanvas
          fps={fps}
          onCreated={({ videoCanvas }) => {
            setVideoCanvas(videoCanvas);
          }}
        >
          <color attach="background" args={["black"]} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <RotatingCube />
        </VideoCanvas>
        <div className="h-24 flex flex-col justify-center gap-3">
          {videoCanvas && (
            <>
              <div className="flex items-center gap-3">
                <p className="tabular-nums">
                  {videoCanvas.frame} / {maxFrames}
                </p>
                <div className="flex-1" />
                {videoCanvas.isPlaying ? (
                  <Button onClick={() => videoCanvas.pause()}>Pause</Button>
                ) : (
                  <Button onClick={() => videoCanvas.play()}>Play</Button>
                )}
                <Button
                  onClick={() => {
                    videoCanvas
                      ?.record({
                        duration: Math.min(
                          maxDuration,
                          maxDuration - videoCanvas.time
                        ),
                      })
                      .then((blob) => download(blob, "myfile"))
                      .catch((err) =>
                        console.log("ERRRRRRRRORR", err?.message)
                      );
                  }}
                >
                  Record
                </Button>
              </div>
              <Slider
                value={[videoCanvas.frame]}
                onValueChange={([frame]) => videoCanvas.setFrame(frame)}
                min={0}
                max={maxFrames}
                step={1}
              />
            </>
          )}
        </div>
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
