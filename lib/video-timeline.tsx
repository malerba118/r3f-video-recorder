"use client";

import {
  CanvasSource,
  Output,
  Mp4OutputFormat,
  BufferTarget,
  QUALITY_HIGH,
  OutputFormat,
  VideoCodec,
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

type Seconds = number;
type ScalePreset = "1x" | "2x" | "3x" | "4x";

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

  // h264 encoding requires that resolution width & height are even numbers.
  // Here we monkey patch the WebGLRenderer setSize function to ensure renderer
  // dimensions will always be even numbers.
  // useLayoutEffect(() => {
  //   // @ts-ignore
  //   gl.__originalSetSize = gl.setSize;
  //   gl.setSize = function (width: number, height: number, updateStyle = true) {
  //     console.log(width, height);
  //     width = even(width);
  //     height = even(height);
  //     const size = gl.getSize(new Vector2());
  //     if (size.x !== width || size.y !== height) {
  //       // @ts-ignore
  //       gl.__originalSetSize(width, height, updateStyle);
  //     }
  //   };
  // }, [gl]);

  // useLayoutEffect(() => {
  //   gl.setSize(even(size.width), even(size.height), false);
  // }, [gl, size.width, size.height]);

  useFrame(({ gl, scene, camera, size }) => {
    gl.setSize(even(size.width), even(size.height), false);
    if (
      videoCanvas.recording instanceof DeterminsticVideoRecording &&
      videoCanvas.recording.status === VideoRecordingStatus.ReadyForFrames &&
      videoCanvas.recording.lastCapturedFrame < videoCanvas.frame &&
      !videoCanvas.recording.isCapturingFrame
    ) {
      videoCanvas.recording.captureFrame(videoCanvas.frame).then(() => {
        videoCanvas.setFrame(videoCanvas.frame + 1);
      });
    } else if (
      videoCanvas.recording instanceof RealtimeVideoRecording &&
      videoCanvas.recording.status === VideoRecordingStatus.ReadyForFrames &&
      videoCanvas.recording.lastCapturedFrame < videoCanvas.frame &&
      !videoCanvas.recording.isCapturingFrame
    ) {
      videoCanvas.recording.captureFrame(videoCanvas.frame);
    }
    gl.render(scene, camera);
  }, 1);

  return (
    <VideoCanvasContext.Provider value={videoCanvas}>
      {children}
    </VideoCanvasContext.Provider>
  );
});

type DeterministicRecordParams = {
  type: "deterministic";
  duration: Seconds;
  startTime?: Seconds;
  format?: OutputFormat;
  codec?: VideoCodec;
  scale?: ScalePreset;
};

type RealtimeRecordParams = {
  type: "realtime";
  duration?: Seconds;
  startTime?: Seconds;
  format?: OutputFormat;
  codec?: VideoCodec;
  scale?: ScalePreset;
};

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
    type,
    duration,
    startTime = this.time,
    format = new Mp4OutputFormat(),
    codec = "avc",
    scale = "1x",
  }: DeterministicRecordParams | RealtimeRecordParams) {
    return new Promise<Blob>(async (resolve, reject) => {
      const initialPixelRatio = this.gl.getPixelRatio();
      this.gl.setPixelRatio(initialPixelRatio * SCALES[scale]);
      if (type === "deterministic") {
        this.pause();
        this.recording = new DeterminsticVideoRecording({
          canvas: this.gl.domElement,
          fps: this.fps,
          duration,
          startTime,
          format,
          codec,
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
          startTime,
          format,
          codec,
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
  startTime: Seconds;
  format: OutputFormat;
  codec: VideoCodec;
  onDone: (data: Blob) => void;
  onError: (err: unknown) => void;
};

abstract class VideoRecording {
  canvas: HTMLCanvasElement;
  fps: number;
  startTime: Seconds;
  lastCapturedFrame: number = -1;
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
    this.startTime = params.startTime;
    // this.duration = params.duration;
    this.fps = params.fps;
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
      bitrate: QUALITY_HIGH,
    });
    this.output.addVideoTrack(this.canvasSource, { frameRate: this.fps });
    this.output
      .start()
      .then(() => {
        this.setStatus(VideoRecordingStatus.ReadyForFrames);
      })
      .catch((e) => {
        this.cancel(e || new Error("Unable to initialize recording"));
      });

    makeObservable(this, {
      frameCount: observable.ref,
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

  protected get startFrame() {
    return this.toFrame(this.startTime);
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
      this.cancel(err);
    }
  };

  cancel = async (err: unknown = new Error("Recording canceled")) => {
    try {
      this.setStatus(VideoRecordingStatus.Canceling);
      this.canvasSource.close();
      await this.output.cancel();
      this.onError(err);
    } catch (err) {
      this.onError(err);
    }
  };
}

interface DeterminsticVideoRecordingParams extends VideoRecordingParams {
  duration: Seconds;
}

class DeterminsticVideoRecording extends VideoRecording {
  duration: Seconds;

  constructor(params: DeterminsticVideoRecordingParams) {
    super(params);
    this.duration = params.duration;
  }

  async captureFrame(frame: number) {
    try {
      this.isCapturingFrame = true;
      await this.canvasSource.add(
        this.toTime(frame) - this.toTime(this.startFrame),
        this.toTime(1) // time of 1 frame
      );
      this.lastCapturedFrame = frame;
      if (this.toTime(frame - this.startFrame) >= this.duration) {
        await this.stop();
      }
    } catch (err) {
      await this.cancel(err);
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
      await this.canvasSource.add(
        this.toTime(frame) - this.toTime(this.startFrame),
        this.toTime(1) // time of 1 frame
      );
      this.lastCapturedFrame = frame;
      if (
        this.duration !== null &&
        this.toTime(frame - this.startFrame) >= this.duration
      ) {
        await this.stop();
      }
    } catch (err) {
      await this.cancel(err);
    } finally {
      this.isCapturingFrame = false;
    }
  }
}
