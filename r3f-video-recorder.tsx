"use client";

import {
  CanvasSource,
  Output,
  Mp4OutputFormat,
  BufferTarget,
  QUALITY_HIGH,
  OutputFormat,
  VideoCodec,
  Quality,
} from "mediabunny";
import {
  createContext,
  forwardRef,
  type ReactNode,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Canvas,
  CanvasProps,
  RootState,
  useFrame,
  useThree,
} from "@react-three/fiber";
import { Vector2, WebGLRenderer } from "three";
import { action, makeObservable, observable, runInAction } from "mobx";

export type Seconds = number;
export type ScalePreset = "1x" | "2x" | "3x" | "4x";

const EPSILON = 1e-7;

function floor(n: number) {
  return Math.floor(n + EPSILON);
}

function even(n: number) {
  const rounded = Math.round(n);
  return rounded & 1 ? rounded + 1 : rounded; // next even
}

const SCALES: Record<ScalePreset, number> = {
  "1x": 1,
  "2x": 2,
  "3x": 3,
  "4x": 4,
};

const VideoCanvasContext = createContext<VideoCanvasManager | null>(null);

export const useVideoCanvas = () => {
  const canvas = useContext(VideoCanvasContext);
  if (!canvas)
    throw new Error("Can only call useVideoCanvas inside of VideoCanvas");
  return canvas;
};

type VideoCanvasRootState = RootState & {
  videoCanvas: VideoCanvasManager;
};

interface VideoCanvasProps extends Omit<CanvasProps, "onCreated"> {
  fps: number;
  onCreated?: (params: VideoCanvasRootState) => void;
}

export const VideoCanvas = forwardRef<HTMLCanvasElement, VideoCanvasProps>(
  ({ fps, onCreated, children, ...otherProps }, ref) => {
    const stateRef = useRef<RootState>(null);
    const videoCanvasRef = useRef<VideoCanvasManager>(null);

    const maybeNotifyCreated = () => {
      if (stateRef.current && videoCanvasRef.current)
        onCreated?.({
          ...stateRef.current,
          videoCanvas: videoCanvasRef.current,
        });
    };

    return (
      <Canvas
        {...otherProps}
        ref={ref}
        gl={{ preserveDrawingBuffer: true }}
        onCreated={(state) => {
          stateRef.current = state;
          maybeNotifyCreated();
        }}
      >
        <VideoCanvasInner
          ref={(videoCanvas) => {
            videoCanvasRef.current = videoCanvas;
            maybeNotifyCreated();
          }}
          fps={fps}
        >
          {children}
        </VideoCanvasInner>
      </Canvas>
    );
  }
);

const VideoCanvasInner = forwardRef<
  VideoCanvasManager,
  {
    fps: number;
    children: ReactNode;
  }
>(({ fps, children }, ref) => {
  const { gl, size } = useThree((state) => ({
    gl: state.gl,
    size: state.size,
  }));
  const [videoCanvas] = useState(() => new VideoCanvasManager(gl, { fps }));

  // useLayoutEffect(() => {
  //   videoCanvas.gl = gl;
  //   videoCanvas.fps = fps;
  // }, [gl, fps]);

  useImperativeHandle(ref, () => videoCanvas);

  useEffect(() => {
    videoCanvas.setFps(fps);
  }, [videoCanvas, fps]);

  useFrame(({ gl, scene, camera, size }) => {
    gl.setSize(even(size.width), even(size.height), false);
    gl.render(scene, camera);
    if (
      videoCanvas.recording instanceof FrameAccurateVideoRecording &&
      videoCanvas.recording.status === VideoRecordingStatus.ReadyForFrames &&
      (videoCanvas.recording.lastCapturedFrame ?? -1) < videoCanvas.frame &&
      !videoCanvas.recording.isCapturingFrame
    ) {
      videoCanvas.recording.captureFrame(videoCanvas.frame).then(() => {
        videoCanvas.setFrame(videoCanvas.frame + 1);
      });
    } else if (
      videoCanvas.recording instanceof RealtimeVideoRecording &&
      videoCanvas.recording.status === VideoRecordingStatus.ReadyForFrames &&
      (videoCanvas.recording.lastCapturedFrame ?? -1) < videoCanvas.frame &&
      !videoCanvas.recording.isCapturingFrame
    ) {
      videoCanvas.recording.captureFrame(videoCanvas.frame);
    }
  }, 1);

  return (
    <VideoCanvasContext.Provider value={videoCanvas}>
      {children}
    </VideoCanvasContext.Provider>
  );
});

interface BaseRecordParams {
  mode: "realtime" | "frame-accurate";
  duration?: Seconds;
  format?: OutputFormat;
  codec?: VideoCodec;
  scale?: ScalePreset;
  quality?: Quality;
}

interface FrameAccurateRecordParams extends BaseRecordParams {
  mode: "frame-accurate";
  duration: Seconds;
}

interface RealtimeRecordParams extends BaseRecordParams {
  mode: "realtime";
  duration?: Seconds;
}

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
    makeObservable(this, {
      isPlaying: observable.ref,
      rawTime: observable.ref,
      recording: observable.ref,
      fps: observable.ref,
      setTime: action,
      setFrame: action,
      setFps: action,
      play: action,
      pause: action,
    });
  }

  toFrame(time: Seconds) {
    return floor(time * this.fps);
  }

  toTime(frame: number) {
    return frame / this.fps;
  }

  get time() {
    return this.toTime(this.frame);
  }

  setTime(time: Seconds) {
    this.setFrame(this.toFrame(time));
  }

  get frame() {
    return this.toFrame(this.rawTime);
  }

  setFrame(frame: number) {
    this.rawTime = this.toTime(floor(frame));
  }

  setFps(fps: number) {
    this.fps = fps;
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

  private loop = action(() => {
    if (!this.isPlaying) return;
    const timestamp = performance.now();
    const delta = timestamp - this.lastTimestamp!;
    this.lastTimestamp = timestamp;
    this.rawTime += delta / 1000;
    this.rafId = requestAnimationFrame(this.loop);
  });

  record({
    mode,
    duration,
    format = new Mp4OutputFormat(),
    codec = "avc",
    scale = "2x",
    quality = QUALITY_HIGH,
  }: FrameAccurateRecordParams | RealtimeRecordParams) {
    return new Promise<Blob>(async (resolve, reject) => {
      const initialPixelRatio = this.gl.getPixelRatio();
      this.gl.setPixelRatio(1 * SCALES[scale]);
      if (mode === "frame-accurate") {
        this.pause();
        this.recording = new FrameAccurateVideoRecording({
          canvas: this.gl.domElement,
          fps: this.fps,
          duration,
          format,
          codec,
          quality,
          onDone: (blob) => {
            this.pause();
            resolve(blob);
            this.recording = null;
            this.gl.setPixelRatio(initialPixelRatio);
          },
          onError: (err) => {
            this.pause();
            reject(err);
            this.recording = null;
            this.gl.setPixelRatio(initialPixelRatio);
          },
        });
      } else {
        this.play();
        this.recording = new RealtimeVideoRecording({
          canvas: this.gl.domElement,
          fps: this.fps,
          duration,
          format,
          codec,
          quality,
          onDone: (blob) => {
            this.pause();
            resolve(blob);
            this.recording = null;
            this.gl.setPixelRatio(initialPixelRatio);
          },
          onError: (err) => {
            this.pause();
            reject(err);
            this.recording = null;
            this.gl.setPixelRatio(initialPixelRatio);
          },
        });
      }
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
  format: OutputFormat;
  codec: VideoCodec;
  quality: Quality;
  onDone: (data: Blob) => void;
  onError: (err: unknown) => void;
};

abstract class VideoRecording {
  protected canvas: HTMLCanvasElement;
  protected output: Output;
  protected canvasSource: CanvasSource;
  protected onDone: (data: Blob) => void;
  protected onError: (err: unknown) => void;
  fps: number;
  format: OutputFormat;
  codec: VideoCodec;
  quality: Quality;
  status: VideoRecordingStatus = VideoRecordingStatus.Initializing;
  firstFrame: number | null = null;
  lastCapturedFrame: number | null = null;
  isCapturingFrame: boolean = false;

  constructor(params: VideoRecordingParams) {
    this.canvas = params.canvas;
    // this.duration = params.duration;
    this.fps = params.fps;
    this.format = params.format;
    this.codec = params.codec;
    this.quality = params.quality;
    this.onDone = params.onDone;
    this.onError = params.onError;

    this.output = new Output({
      format: params.format,
      target: new BufferTarget(),
    });
    this.canvasSource = new CanvasSource(this.canvas, {
      codec: params.codec,
      bitrate: params.quality,
    });
    this.output.addVideoTrack(this.canvasSource, { frameRate: this.fps });
    this.output
      .start()
      .then(() => {
        this.setStatus(VideoRecordingStatus.ReadyForFrames);
      })
      .catch((e) => {
        this.canelWithReason(e || new Error("Unable to initialize recording"));
      });

    makeObservable(this, {
      status: observable.ref,
      // @ts-ignore
      setStatus: action,
    });
  }

  toFrame(time: Seconds) {
    return floor(time * this.fps);
  }

  toTime(frame: number) {
    return frame / this.fps;
  }

  abstract captureFrame(frame: number): Promise<void>;

  protected setStatus(status: VideoRecordingStatus) {
    this.status = status;
  }

  stop = async () => {
    try {
      this.setStatus(VideoRecordingStatus.Finalizing);
      this.canvasSource.close();
      await this.output.finalize();
      const buffer = (this.output.target as BufferTarget).buffer;
      const blob = new Blob([buffer!], {
        type: this.output.format.mimeType,
      });
      this.onDone(blob);
    } catch (err) {
      this.canelWithReason(err);
    }
  };

  protected canelWithReason = async (
    err: unknown = new Error("Recording canceled")
  ) => {
    try {
      this.setStatus(VideoRecordingStatus.Canceling);
      this.canvasSource.close();
      await this.output.cancel();
      this.onError(err);
    } catch (err) {
      this.onError(err);
    }
  };

  cancel = async () => {
    return this.canelWithReason(new Error("Recording canceled"));
  };
}

interface FrameAccurateVideoRecordingParams extends VideoRecordingParams {
  duration: Seconds;
}

class FrameAccurateVideoRecording extends VideoRecording {
  duration: Seconds;

  constructor(params: FrameAccurateVideoRecordingParams) {
    super(params);
    this.duration = params.duration;
  }

  async captureFrame(frame: number) {
    try {
      this.isCapturingFrame = true;
      if (this.firstFrame === null) {
        this.firstFrame = frame;
      }
      await this.canvasSource.add(
        this.toTime(frame) - this.toTime(this.firstFrame),
        this.toTime(1) // time of 1 frame
      );
      this.lastCapturedFrame = frame;
      if (this.toTime(frame - this.firstFrame + 1) >= this.duration) {
        await this.stop();
      }
    } catch (err) {
      await this.canelWithReason(err);
    } finally {
      this.isCapturingFrame = false;
    }
  }
}

interface RealtimeVideoRecordingParams extends VideoRecordingParams {
  duration?: Seconds;
}

class RealtimeVideoRecording extends VideoRecording {
  duration: Seconds | null;

  constructor(params: RealtimeVideoRecordingParams) {
    super(params);
    this.duration = params.duration ?? null;
  }

  async captureFrame(frame: number) {
    try {
      this.isCapturingFrame = true;
      if (this.firstFrame === null) {
        this.firstFrame = frame;
      }
      await this.canvasSource.add(
        this.toTime(frame) - this.toTime(this.firstFrame),
        this.toTime(1) // time of 1 frame
      );
      this.lastCapturedFrame = frame;
      if (
        this.duration !== null &&
        this.toTime(frame - this.firstFrame + 1) >= this.duration
      ) {
        await this.stop();
      }
    } catch (err) {
      await this.canelWithReason(err);
    } finally {
      this.isCapturingFrame = false;
    }
  }
}
