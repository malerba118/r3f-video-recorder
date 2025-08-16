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
  useLayoutEffect,
  useMemo,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { WebGLRenderer } from "three";

function even(n: number) {
  return n & 1 ? n + 1 : n; // next even
}

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
  const { gl, size } = useThree((state) => ({
    gl: state.gl,
    size: state.size,
  }));
  const timeline = useMemo(
    () => ({
      player: new VideoPlayer({ fps }),
      recorder: new VideoRecorder(gl, { fps }),
    }),
    [gl, fps]
  );

  // h264 encoding requires that resolution width & height are even numbers.
  // Here we monkey patch the WebGLRenderer setSize function to ensure renderer
  // dimensions will always be even numbers.
  useLayoutEffect(() => {
    // @ts-ignore
    gl.originalSetSize = gl.setSize;
    gl.setSize = function (width, height, updateStyle = true) {
      // @ts-ignore
      gl.originalSetSize(even(width), even(height), updateStyle);
    };
  }, [gl]);

  useLayoutEffect(() => {
    gl.setSize(size.width, size.height, false);
  }, [gl, size.width, size.height]);

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
  gl: WebGLRenderer;
  fps: number;
  isCapturing = false;
  recording: VideoRecording | null = null;

  constructor(gl: WebGLRenderer, { fps = 60 }: { fps?: number } = {}) {
    this.gl = gl;
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
      const canvasSource = new CanvasSource(this.gl.domElement, {
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
      await this.stop();
    }
    this.isCapturing = false;
  }

  private async stop() {
    if (!this.recording) return;
    this.recording.isDone = true;
    this.recording.canvasSource.close();
    await this.recording.output.finalize();
    const buffer = (this.recording.output.target as BufferTarget).buffer;
    const blob = new Blob([buffer!], {
      type: this.recording.output.format.mimeType,
    });
    this.recording.resolver(blob);
    this.recording = null;
  }

  cancel() {
    this.recording?.rejecter?.();
  }
}
