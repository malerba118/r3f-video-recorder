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
import { toast } from "sonner";
import Link from "next/link";
import { CarouselScene } from "../scenes/carousel";

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
  const [videoCanvas, setVideoCanvas] = useState<VideoCanvasManager | null>(
    null
  );

  return (
    <div className="flex flex-col h-[100dvh]">
      <div className="p-4 flex gap-4">
        <Link href="/realtime" className="text-gray-950">
          Realtime
        </Link>
        <Link href="/deterministic" className="text-gray-400">
          Deterministic
        </Link>
      </div>
      <div className="flex-1 py-24">
        <div className="flex flex-col gap-4 w-[50vw] mx-auto">
          <div className="h-[50vh] w-[50vw] bg-black">
            <VideoCanvas
              fps={60}
              onCreated={({ videoCanvas }) => {
                setVideoCanvas(videoCanvas);
              }}
              camera={{ position: [0, 0, 100], fov: 15 }}
            >
              {/* <color attach="background" args={["black"]} />
              <ambientLight intensity={0.5} />
              <directionalLight position={[10, 10, 5]} intensity={1} />
              <RotatingCube /> */}
              <CarouselScene />
            </VideoCanvas>
          </div>
          {videoCanvas && (
            <>
              <div className="flex items-center gap-3">
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
                          type: "realtime",
                          scale: "2x",
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
    </div>
  );
});

export default Page;
