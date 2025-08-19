"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  SizePreset,
  useVideoCanvas,
  VideoCanvas,
  VideoCanvasManager,
} from "../../r3f-video-recorder";
import { Button } from "../../components/ui/button";
import { observer } from "mobx-react";
import { Slider } from "../../components/ui/slider";
import { autorun, reaction, when } from "mobx";
import FileSaver from "file-saver";
import { toast } from "sonner";
import Link from "next/link";
import { CarouselScene } from "../scenes/carousel";
import { FpsSelector, SizeSelector } from "../controls";
// @ts-ignore
import FPSStats from "react-fps-stats";

function RotatingCube() {
  const canvas = useVideoCanvas();
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
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
  const [size, setSize] = useState<SizePreset>("2x");
  const [videoCanvas, setVideoCanvas] = useState<VideoCanvasManager | null>(
    null
  );

  return (
    <div className="py-24 px-4">
      <FPSStats />
      <div className="flex flex-col gap-4  w-full lg:w-[50vw] mx-auto">
        <div className="flex items-center">
          <div className="flex gap-4">
            <Link href="/realtime" className="text-gray-950">
              Realtime
            </Link>
            <Link href="/frame-accurate" className="text-gray-500">
              Frame-Accurate
            </Link>
          </div>
          <div className="flex-1" />
        </div>
        <div className="h-[55vh] w-full bg-gray-50">
          <VideoCanvas
            fps={60}
            onCreated={({ videoCanvas }) => {
              setVideoCanvas(videoCanvas);
            }}
            camera={{ position: [0, 0, 100], fov: 15 }}
          >
            <CarouselScene />
          </VideoCanvas>
        </div>
        {videoCanvas && (
          <>
            <div className="flex items-center gap-3">
              <FpsSelector
                value={videoCanvas.fps}
                onValueChange={(fps) => videoCanvas.setFps(fps)}
              />
              <SizeSelector value={size} onValueChange={setSize} />
              <div className="flex-1" />
              {videoCanvas.recording ? (
                <>
                  <Button onClick={() => videoCanvas.recording?.cancel()}>
                    Cancel
                  </Button>
                  <Button onClick={() => videoCanvas.recording?.stop()}>
                    Stop
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => {
                    videoCanvas
                      ?.record({
                        mode: "realtime",
                        size,
                      })
                      .then((blob) => FileSaver.saveAs(blob, "video.mp4"))
                      .catch((err) => toast.error(err?.message));
                  }}
                >
                  Record
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export default Page;
