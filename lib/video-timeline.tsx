"use client";

import {
  CanvasSource,
  Output,
  Mp4OutputFormat,
  BufferTarget,
  QUALITY_MEDIUM,
  getFirstEncodableVideoCodec,
  getEncodableVideoCodecs,
} from "mediabunny";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";

const VideoTimelineContext = createContext<{
  player: VideoPlayer;
  recorder: VideoRecorder;
} | null>(null);

export const useTimeline = () => {
  const timeline = useContext(VideoTimelineContext);
  if (!timeline)
    throw new Error("Can only call useTimeline inside of VideoTimeline");
  return timeline;
};

export const VideoTimeline = ({
  children,
  fps,
}: {
  children: ReactNode;
  fps: number;
}) => {
  const gl = useThree((state) => state.gl);
  const canvasEl = useThree((state) => state.gl.domElement);
  const timeline = useMemo(
    () => ({
      player: new VideoPlayer({ fps }),
      recorder: new VideoRecorder(canvasEl, { fps }),
    }),
    [canvasEl, fps]
  );

  useEffect(() => {
    gl.setPixelRatio(2);
  }, [gl]);

  useFrame(({ gl, scene, camera }) => {
    if (
      timeline.recorder.recording &&
      timeline.recorder.recording.frameCount <= timeline.player.frame &&
      !timeline.recorder.isCapturing
    ) {
      timeline.recorder.captureFrame().then(() => {
        timeline.player.setFrame(timeline.player.frame + 1);
      });
    }
    gl.render(scene, camera);
  }, 1);

  return (
    <VideoTimelineContext.Provider value={timeline}>
      {children}
    </VideoTimelineContext.Provider>
  );
};

type Seconds = number;

export class VideoPlayer {
  time: Seconds = 0;
  playing = false;
  fps: number;
  private lastTimestamp: number | null = null;
  private rafId: number | null = null;

  constructor({ fps = 60 }: { fps?: number } = {}) {
    this.fps = fps;
  }

  get frame() {
    return Math.floor(this.time * this.fps + 0.00001);
  }

  setFrame(frame: number) {
    return (this.time = frame / this.fps);
  }

  play() {
    this.playing = true;
    if (this.rafId === null) {
      this.lastTimestamp = performance.now();
      this.rafId = requestAnimationFrame(this.loop);
    }
  }

  pause() {
    this.playing = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private loop = () => {
    if (!this.playing) return;
    const timestamp = performance.now();
    const delta = timestamp - this.lastTimestamp!;
    this.lastTimestamp = timestamp;
    this.time += delta / 1000;
    this.rafId = requestAnimationFrame(this.loop);
  };
}

interface VideoRecording {
  duration: Seconds;
  frameCount: number;
  canvasSource: CanvasSource;
  output: Output;
  resolver: (data: Blob) => void;
  rejecter: () => void;
  isDone: boolean;
}

export class VideoRecorder {
  canvasEl: HTMLCanvasElement;
  fps: number;
  isCapturing = false;
  recording: VideoRecording | null = null;

  constructor(
    canvasEl: HTMLCanvasElement,
    { fps = 60 }: { fps?: number } = {}
  ) {
    this.canvasEl = canvasEl;
    this.fps = fps;
  }

  record({ duration }: { duration: Seconds }) {
    return new Promise<Blob>(async (resolver, rejecter) => {
      const output = new Output({
        format: new Mp4OutputFormat(),
        target: new BufferTarget(),
      });
      const codecs = await getEncodableVideoCodecs();
      console.log(codecs);
      // const videoCodec = await getFirstEncodableVideoCodec(
      //   output.format.getSupportedVideoCodecs(),
      //   {
      //     width: this.canvasEl.width,
      //     height: this.canvasEl.height,
      //   }
      // );
      const canvasSource = new CanvasSource(this.canvasEl, {
        codec: codecs.find((c) => c.includes("avc")) || "vp9",
        bitrate: QUALITY_MEDIUM,
      });

      // const videoCodec = await getFirstEncodableVideoCodec(
      //   output.format.getSupportedVideoCodecs(),
      //   {
      //     width: this.canvasEl.width,
      //     height: this.canvasEl.height,
      //   }
      // );

      // const canvasSource = new CanvasSource(this.canvasEl, {
      //   codec: videoCodec || "av1",
      //   bitrate: QUALITY_MEDIUM,
      // });

      output.addVideoTrack(canvasSource, { frameRate: this.fps });
      await output.start();

      this.recording = {
        duration,
        frameCount: 0,
        canvasSource,
        output,
        resolver,
        rejecter,
        isDone: false,
      };
    });
  }

  async captureFrame() {
    if (!this.recording) return;

    this.isCapturing = true;
    await this.recording.canvasSource.add(
      this.recording.frameCount / this.fps,
      1 / this.fps
    );
    this.recording.frameCount += 1;

    if (this.recording.frameCount / this.fps >= this.recording.duration) {
      this.recording.isDone = true;
      this.recording.canvasSource.close();
      await this.recording.output.finalize();
      const blob = new Blob([this.recording.output.target.buffer!], {
        type: this.recording.output.format.mimeType,
      });
      this.recording.resolver(blob);
      this.recording = null;
    }
    this.isCapturing = false;
  }

  cancel() {
    this.recording?.rejecter?.();
  }
}
