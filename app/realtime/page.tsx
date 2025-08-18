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

function RotatingCube() {
  const canvas = useVideoCanvas();
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    // Rotate the cube based on videoCanvas.time
    meshRef.current.rotation.x = clock.elapsedTime;
    meshRef.current.rotation.y = clock.elapsedTime * 0.7;
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
  const fps = 60;
  // const maxDuration = 30;
  // const maxFrames = maxDuration * fps;
  const [videoCanvas, setVideoCanvas] = useState<VideoCanvasManager | null>(
    null
  );

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
                        })
                        .then((blob) => FileSaver.saveAs(blob, "video.mp4"))
                        .catch((err) => toast.error(err?.message));
                    }}
                  >
                    Record
                  </Button>
                )}
              </div>
              {/* <Slider
                value={[videoCanvas.frame]}
                onValueChange={([frame]) => videoCanvas.setFrame(frame)}
                min={0}
                max={maxFrames}
                step={1}
              /> */}
            </>
          )}
        </div>
      </div>
    </div>
  );
});

export default Page;
