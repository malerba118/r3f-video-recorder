"use client";

import {
  CanvasSource,
  Output,
  Mp4OutputFormat,
  BufferTarget,
  QUALITY_MEDIUM,
  getFirstEncodableVideoCodec,
  getEncodableVideoCodecs,
  OutputFormat,
  VideoCodec,
} from "mediabunny";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react";
import { Canvas, CanvasProps, useFrame, useThree } from "@react-three/fiber";
import { WebGLRenderer } from "three";

function even(n: number) {
  return n & 1 ? n + 1 : n; // next even
}

const VideoCanvasContext = createContext<VideoCanvasManager | null>(null);

export const useVideoCanvas = () => {
  const canvas = useContext(VideoCanvasContext);
  if (!canvas)
    throw new Error("Can only call useVideoCanvas inside of VideoCanvas");
  return canvas;
};

interface VideoCanvasProps extends CanvasProps {
  fps: number;
  onVideoCanvasCreated?: (videoCanvas: VideoCanvasManager) => void;
}

export const VideoCanvas = ({
  fps,
  children,
  onVideoCanvasCreated,
  ...otherProps
}: VideoCanvasProps) => {
  return (
    <Canvas {...otherProps}>
      <VideoCanvasInner fps={fps} onCreated={onVideoCanvasCreated}>
        {children}
      </VideoCanvasInner>
    </Canvas>
  );
};

const VideoCanvasInner = ({
  fps,
  children,
  onCreated,
}: {
  fps: number;
  children: ReactNode;
  onCreated?: (videoCanvas: VideoCanvasManager) => void;
}) => {
  const { gl, size } = useThree((state) => ({
    gl: state.gl,
    size: state.size,
  }));
  const videoCanvas = useMemo(
    () => new VideoCanvasManager(gl, { fps }),
    [gl, fps]
  );

  useLayoutEffect(() => {
    onCreated?.(videoCanvas);
  }, [videoCanvas, onCreated]);

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
      videoCanvas.recording &&
      videoCanvas.recording.status === VideoRecordingStatus.ReadyForFrames &&
      videoCanvas.recording.frameCount <= videoCanvas.frame &&
      !videoCanvas.recording.isCapturingFrame
    ) {
      videoCanvas.recording.captureFrame().then(() => {
        videoCanvas.setFrame(videoCanvas.frame + 1);
      });
    }
    gl.render(scene, camera);
  }, 1);

  return (
    <VideoCanvasContext.Provider value={videoCanvas}>
      {children}
    </VideoCanvasContext.Provider>
  );
};

type Seconds = number;

// export class VideoPlayer {
//   time: Seconds = 0;
//   playing = false;
//   fps: number;
//   private lastTimestamp: number | null = null;
//   private rafId: number | null = null;

//   constructor({ fps = 60 }: { fps?: number } = {}) {
//     this.fps = fps;
//   }

//   get frame() {
//     return Math.floor(this.time * this.fps + 0.00001);
//   }

//   setFrame(frame: number) {
//     return (this.time = frame / this.fps);
//   }

//   play() {
//     this.playing = true;
//     if (this.rafId === null) {
//       this.lastTimestamp = performance.now();
//       this.rafId = requestAnimationFrame(this.loop);
//     }
//   }

//   pause() {
//     this.playing = false;
//     if (this.rafId !== null) {
//       cancelAnimationFrame(this.rafId);
//       this.rafId = null;
//     }
//   }

//   private loop = () => {
//     if (!this.playing) return;
//     const timestamp = performance.now();
//     const delta = timestamp - this.lastTimestamp!;
//     this.lastTimestamp = timestamp;
//     this.time += delta / 1000;
//     this.rafId = requestAnimationFrame(this.loop);
//   };
// }

const EPSILON = 1e-7;

export class VideoCanvasManager {
  gl: WebGLRenderer;
  fps: number;
  recording: VideoRecording | null = null;
  rawTime: Seconds = 0;
  isPlaying = false;
  private lastTimestamp: number | null = null;
  private rafId: number | null = null;

  constructor(gl: WebGLRenderer, { fps = 60 }: { fps?: number } = {}) {
    this.gl = gl;
    this.fps = fps;
  }

  get time() {
    return this.frame / this.fps;
  }

  setTime(time: Seconds) {
    return this.setFrame(Math.floor(time * this.fps + EPSILON));
  }

  get frame() {
    return Math.floor(this.rawTime * this.fps + EPSILON);
  }

  setFrame(frame: number) {
    return (this.rawTime = Math.floor(frame + EPSILON) / this.fps);
  }

  play() {
    this.isPlaying = true;
    if (this.rafId === null) {
      this.lastTimestamp = performance.now();
      this.rafId = requestAnimationFrame(this.loop);
    }
  }

  pause() {
    this.isPlaying = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private loop = () => {
    if (!this.isPlaying) return;
    const timestamp = performance.now();
    const delta = timestamp - this.lastTimestamp!;
    this.lastTimestamp = timestamp;
    this.rawTime += delta / 1000;
    this.rafId = requestAnimationFrame(this.loop);
  };

  record({
    duration,
    format = new Mp4OutputFormat(),
    codec = "avc",
  }: {
    duration: Seconds;
    format?: OutputFormat;
    codec?: VideoCodec;
  }) {
    return new Promise<Blob>(async (resolver, rejecter) => {
      this.recording = new VideoRecording({
        canvas: this.gl.domElement,
        fps: this.fps,
        duration,
        format,
        codec,
        onDone: resolver,
        onError: rejecter,
      });
    });
  }
}

enum VideoRecordingStatus {
  Initializing = "initializing",
  ReadyForFrames = "ready-for-frames",
  Finalizing = "finalizing",
  Canceling = "canceling",
}

type VideoRecordingParams = {
  canvas: HTMLCanvasElement;
  fps: number;
  duration: Seconds;
  format: OutputFormat;
  codec: VideoCodec;
  onDone: (data: Blob) => void;
  onError: (err: unknown) => void;
};

class VideoRecording {
  canvas: HTMLCanvasElement;
  fps: number;
  duration: Seconds;
  format: OutputFormat;
  codec: VideoCodec;
  output: Output;
  canvasSource: CanvasSource;
  onDone: (data: Blob) => void;
  onError: (err: unknown) => void;
  frameCount: number = 0;
  status: VideoRecordingStatus = VideoRecordingStatus.Initializing;
  isCapturingFrame: boolean = false;

  constructor(params: VideoRecordingParams) {
    this.canvas = params.canvas;
    this.fps = params.fps;
    this.duration = params.duration;
    this.format = params.format;
    this.codec = params.codec;
    this.onDone = params.onDone;
    this.onError = params.onError;

    this.output = new Output({
      format: params.format,
      target: new BufferTarget(),
    });
    this.canvasSource = new CanvasSource(this.canvas, {
      codec: params.codec,
      bitrate: QUALITY_MEDIUM,
    });
    this.output.addVideoTrack(this.canvasSource, { frameRate: this.fps });
    this.output
      .start()
      .then(() => {
        this.status = VideoRecordingStatus.ReadyForFrames;
      })
      .catch((e) => {
        this.cancel(e || new Error("Unable to initialize recording"));
      });
  }

  async captureFrame() {
    try {
      this.isCapturingFrame = true;
      await this.canvasSource.add(this.frameCount / this.fps, 1 / this.fps);
      this.frameCount += 1;
      if (this.frameCount / this.fps >= this.duration) {
        await this.stop();
      }
    } catch (err) {
      await this.cancel(err);
    } finally {
      this.isCapturingFrame = false;
    }
  }

  private stop = async () => {
    try {
      this.status = VideoRecordingStatus.Finalizing;
      this.canvasSource.close();
      await this.output.finalize();
      const buffer = (this.output.target as BufferTarget).buffer;
      const blob = new Blob([buffer!], {
        type: this.output.format.mimeType,
      });
      this.onDone(blob);
    } catch (err) {
      this.cancel(err);
    }
  };

  private cancel = async (err: unknown = new Error("Recording canceled")) => {
    try {
      this.status = VideoRecordingStatus.Canceling;
      this.canvasSource.close();
      await this.output.cancel();
      this.onError(err);
    } catch (err) {
      this.onError(err);
    }
  };
}
