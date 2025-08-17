"use client";

import {
  CanvasSource,
  Output,
  Mp4OutputFormat,
  BufferTarget,
  QUALITY_MEDIUM,
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
import { WebGLRenderer } from "three";
import { action, makeObservable, observable } from "mobx";

type Seconds = number;

const EPSILON = 1e-7;

function floor(n: number) {
  return Math.floor(n + EPSILON);
}

function even(n: number) {
  const rounded = Math.round(n);
  return rounded & 1 ? rounded + 1 : rounded; // next even
}

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

export const VideoCanvas = forwardRef<VideoCanvasManager, VideoCanvasProps>(
  ({ fps, onCreated, children, ...otherProps }, ref) => {
    const videoCanvasRef = useRef<VideoCanvasManager>(null);
    return (
      <Canvas
        {...otherProps}
        gl={{ preserveDrawingBuffer: true }}
        onCreated={(state) => {
          onCreated?.({
            ...state,
            videoCanvas: videoCanvasRef.current!,
          });
        }}
        // onCreated={(state) => {
        //   // h264 encoding requires that resolution width & height are even numbers.
        //   // Here we monkey patch the WebGLRenderer setSize function to ensure renderer
        //   // dimensions will always be even numbers.
        //   // @ts-ignore
        //   state.gl.originalSetSize = state.gl.setSize;
        //   state.gl.setSize = function (width, height, updateStyle = true) {
        //     // @ts-ignore
        //     state.gl.originalSetSize(even(width), even(height), updateStyle);
        //   };
        //   state.gl.setSize(state.size.width, state.size.height, false);
        //   otherProps.onCreated?.(state);
        // }}
      >
        <VideoCanvasInner ref={videoCanvasRef} fps={fps}>
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
  useLayoutEffect(() => {
    // @ts-ignore
    gl.originalSetSize = gl.setSize;
    gl.setSize = function (width: number, height: number, updateStyle = true) {
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
});

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

  get time() {
    return this.frame / this.fps;
  }

  setTime(time: Seconds) {
    return this.setFrame(floor(time * this.fps));
  }

  get frame() {
    return floor(this.rawTime * this.fps);
  }

  setFrame(frame: number) {
    return (this.rawTime = floor(frame) / this.fps);
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
