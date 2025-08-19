"use client";

import { useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  ScalePreset,
  useVideoCanvas,
  VideoCanvas,
  VideoCanvasManager,
} from "../../r3f-video-recorder";
import { Button } from "../../components/ui/button";
import { observer } from "mobx-react";
import { Slider } from "../../components/ui/slider";
import { reaction } from "mobx";
import FileSaver from "file-saver";
import { formatTime } from "@/components/utils";
import Link from "next/link";
import { DurationSelector, FpsSelector, ScaleSelector } from "../controls";
import { toast } from "sonner";

function RotatingCube() {
  const canvas = useVideoCanvas();
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;
    // Rotate the cube based on videoCanvas.time
    meshRef.current.rotation.x = 10 + canvas.time;
    meshRef.current.rotation.y = 10 + canvas.time * 0.7;
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="cyan" />
    </mesh>
  );
}

const Page = observer(() => {
  const [scale, setScale] = useState<ScalePreset>("2x");
  const maxDuration = 30;
  const [videoCanvas, setVideoCanvas] = useState<VideoCanvasManager | null>(
    null
  );
  const [recordingDuration, setRecordingDuration] = useState(5);

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
    <div className="py-24 px-4">
      <div className="flex flex-col gap-4 w-full lg:w-[50vw] mx-auto">
        <div className="flex items-center">
          <div className="flex gap-4">
            <Link href="/realtime" className="text-gray-500">
              Realtime
            </Link>
            <Link href="/deterministic" className="text-gray-950">
              Deterministic
            </Link>
          </div>
          <div className="flex-1" />
          {videoCanvas && (
            <span className="tabular-nums text-sm">
              Frame {videoCanvas.frame ?? 0} of {videoCanvas.fps * maxDuration}
            </span>
          )}
        </div>
        <div className="h-[55vh] w-full bg-gray-50">
          <VideoCanvas
            fps={12}
            onCreated={({ videoCanvas }) => {
              setVideoCanvas(videoCanvas);
            }}
          >
            <color attach="background" args={["#C7EDED"]} />
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} />
            <RotatingCube />
          </VideoCanvas>
        </div>
        {videoCanvas && (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <FpsSelector
                value={videoCanvas.fps}
                onValueChange={(fps) => videoCanvas.setFps(fps)}
              />
              <ScaleSelector
                className="hidden lg:flex"
                value={scale}
                onValueChange={setScale}
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
                      mode: "frame-accurate",
                      duration: Math.min(
                        recordingDuration,
                        maxDuration - videoCanvas.time
                      ),
                    })
                    .then((blob) => FileSaver.saveAs(blob, "video.mp4"))
                    .catch((err) => toast(err?.message));
                }}
                disabled={Boolean(videoCanvas.recording)}
              >
                {videoCanvas.recording ? "Recording" : "Record"}
              </Button>
              <span className="hidden lg:block">for</span>
              <DurationSelector
                className="w-20 hidden lg:flex"
                value={recordingDuration}
                onValueChange={setRecordingDuration}
              />
            </div>
            <div className="flex gap-3 items-center text-sm tabular-nums">
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
  );
});

export default Page;
