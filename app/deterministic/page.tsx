"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  useVideoCanvas,
  VideoCanvas,
  VideoCanvasManager,
} from "../../lib/video-timeline";
import { Button } from "../../components/ui/button";
import { observer } from "mobx-react";
import { Slider } from "../../components/ui/slider";
import { autorun, reaction, when } from "mobx";
import FileSaver from "file-saver";
import { formatTime } from "@/lib/utils";
import Link from "next/link";
import { FpsSelector } from "../controls";

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

const Page = observer(() => {
  // const videoCanvasRef = useRef<VideoCanvasManager>(null);
  const maxDuration = 30;
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
    <div className="flex flex-col h-[100dvh]">
      <div className="p-4 flex gap-4">
        <Link href="/realtime" className="text-gray-400">
          Realtime
        </Link>
        <Link href="/deterministic" className="text-gray-950">
          Deterministic
        </Link>
      </div>
      <div className="flex-1 py-24">
        <div className="flex flex-col gap-4 w-[50vw] mx-auto">
          <div className="flex justify-end h-4">
            {videoCanvas && (
              <span className="tabular-nums text-sm">
                Frame {videoCanvas.frame ?? 0} of{" "}
                {videoCanvas.fps * maxDuration}
              </span>
            )}
          </div>
          <div className="h-[50vh] w-[50vw] bg-black">
            <VideoCanvas
              fps={12}
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
          {videoCanvas && (
            <>
              <div className="flex items-center gap-3">
                <FpsSelector
                  value={videoCanvas.fps}
                  onValueChange={(fps) => videoCanvas.setFps(fps)}
                />
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
                        type: "deterministic",
                        duration: Math.min(10, maxDuration - videoCanvas.time),
                      })
                      .then((blob) => FileSaver.saveAs(blob, "video.mp4"))
                      .catch((err) =>
                        console.log("ERRRRRRRRORR", err?.message)
                      );
                  }}
                >
                  Record
                </Button>
              </div>
              <div className="flex gap-3 items-center text-xs tabular-nums">
                <span>{formatTime(videoCanvas.time)}</span>
                <Slider
                  value={[videoCanvas.frame]}
                  onValueChange={([frame]) => videoCanvas.setFrame(frame)}
                  min={0}
                  max={videoCanvas.fps * maxDuration}
                  step={1}
                />
                <span>{formatTime(maxDuration)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

export default Page;
