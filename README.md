# r3f-video-recorder

This is a video recording framework built on @react-three/fiber and mediabunny which supports both realtime canvas capture as well as frame-accurate video rendering.

Rendering videos reliably across all browsers is quite difficult but this library offers a nice set of features including:

- Render to mp4/h264 in all browsers
- A frame-aligned clock so your video preview can appear consistent with your rendered export.
- Fast rendering times while in `frame-accurate` recording mode (eg 10s to render 60s video).
- Adjustable `fps`, `size`, `quality`, `format`, `codec`

### Installation

I'm lazy and don't feel like turning this into an official npm package. I also know i will suck at keeping it up to date so i'm going with shadcn-stlye installation on this one and you're going to have to copy/pasta the contents of [r3f-video-recorder.tsx](/r3f-video-recorder.tsx) into your project.

You'll also need to install peers:

```bash
npm install @react-three/fiber mobx mobx-react mediabunny
```

### Quick Start

```tsx
import { HIGH_QUALITY } from "mediabunny";
import FileSaver from "file-saver";
import { VideoCanvas, VideoCanvasManager } from "./r3f-video-recorder";
import { MyScene } from "./my-scene";

export default function Page() {
  const [videoCanvas, setVideoCanvas] = useState<VideoCanvasManager | null>(
    null
  );

  return (
    <main className="h-screen">
      <Button
        className="fixed top-4 right-4"
        onClick={() => {
          videoCanvas
            ?.record({
              mode: "realtime",
              duration: 30,
              scale: "2x",
              quality: HIGH_QUALITY,
            })
            .then((blob) => {
              FileSaver.saveAs(blob, "video.mp4");
            });
        }}
      >
        Record
      </Button>
      <VideoCanvas
        fps={60}
        camera={{ position: [-15, 0, 10], fov: 25 }}
        onCreated={({ videoCanvas }) => {
          setVideoCanvas(videoCanvas);
        }}
      >
        <MyScene />
      </VideoCanvas>
    </main>
  );
}
```

### Realtime Rendering

`realtime` rendering mode will capture frames from the canvas in real time. This means if you want a two minute video, you'll have to sit there recording for two minutes. This is a good option when you want to capture a user interacting with a scene.

While it's generally easier to set up, it's also inherently less robust than `frame-accurate` rendering since it's subject to lost frames. Contextual factors such as user machine specs, battery level, concurrent cpu/memory usage, navigation away from tab during recording, can all lead to lost frames and affect the integrity of the rendered video.

```tsx
import { HIGH_QUALITY } from "mediabunny";
import FileSaver from "file-saver";
import { observer } from "mobx-react";
import { VideoCanvas, VideoCanvasManager } from "./r3f-video-recorder";
import { MyScene } from "./my-scene";

const App = observer(() => {
  const [videoCanvas, setVideoCanvas] = useState<VideoCanvasManager | null>(
    null
  );

  return (
    <main className="h-screen">
      {videoCanvas && (
        <div className="fixed top-4 right-4 flex gap-3">
          {!videoCanvas.recording && (
            <Button
              onClick={() => {
                videoCanvas
                  .record({
                    mode: "realtime",
                    size: "2x",
                  })
                  .then((blob) => {
                    FileSaver.saveAs(blob, "video.mp4");
                  });
              }}
            >
              Record
            </Button>
          )}
          {videoCanvas.recording && (
            <>
              <Button
                onClick={() => {
                  videoCanvas.recording.cancel();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  videoCanvas.recording.stop();
                }}
              >
                Stop
              </Button>
            </>
          )}
        </div>
      )}
      <VideoCanvas
        fps={60}
        camera={{ position: [-15, 0, 10], fov: 25 }}
        onCreated={({ videoCanvas }) => {
          setVideoCanvas(videoCanvas);
        }}
      >
        <MyScene />
      </VideoCanvas>
    </main>
  );
});
```

If you have not set up R3F, see the R3F docs first.

### Minimal usage

1. Wrap your scene with `VideoCanvas` and set a target `fps`.

2. Inside your scene components, use `useVideoCanvas()` to access the `VideoCanvasManager`. Drive animation using `canvas.time` to make it deterministic.

```tsx
"use client";
import { VideoCanvas, useVideoCanvas } from "r3f-video-recorder";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

function Box() {
  const canvas = useVideoCanvas();
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!mesh.current) return;
    mesh.current.rotation.x = canvas.time * 0.7;
    mesh.current.rotation.y = canvas.time;
  });
  return (
    <mesh ref={mesh}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="cyan" />
    </mesh>
  );
}

export default function Demo() {
  return (
    <div className="h-[60vh]">
      <VideoCanvas fps={60}>
        <ambientLight intensity={0.6} />
        <Box />
      </VideoCanvas>
    </div>
  );
}
```

### Recording

- Realtime (plays and records live):

```tsx
videoCanvas.record({ mode: "realtime" }).then((blob) => {
  // save blob
});
```

- Frame-accurate (deterministic, no dropped frames):

```tsx
videoCanvas
  .record({ mode: "frame-accurate", duration: 5 /* seconds */ })
  .then((blob) => {
    // save blob
  });
```

Use `file-saver` or a URL download to save:

```ts
import FileSaver from "file-saver";
FileSaver.saveAs(blob, "video.mp4");
```

### Notes

- Use `canvas.time` (and/or `canvas.frame`) to drive your animations so frame-accurate recordings are deterministic.
- The recorder ensures even canvas dimensions and temporarily scales pixel ratio during recording via the `scale` option.
- Requires a browser with WebCodecs support (via `mediabunny`).

## API Reference

### `VideoCanvas`

React component that wraps your R3F scene and wires up recording.

Props:

- `fps: number` — Target frames per second for time and recording
- `onCreated?: (state: RootState & { videoCanvas: VideoCanvasManager }) => void` — Called when the canvas is ready
- Accepts all other `@react-three/fiber` `Canvas` props (except `onCreated`)

Usage:

```tsx
<VideoCanvas
  fps={60}
  onCreated={({ videoCanvas }) => {
    /* ... */
  }}
>
  {/* your scene */}
</VideoCanvas>
```

### `useVideoCanvas()`

Hook to access the active `VideoCanvasManager`. Must be used inside children of `VideoCanvas`.

```ts
const canvas = useVideoCanvas();
canvas.time; // seconds (derived from frame and fps)
canvas.frame; // integer frame index
```

### `VideoCanvasManager`

Provides control over playback and recording.

Properties:

- `fps: number`
- `time: number` (seconds)
- `frame: number`
- `isPlaying: boolean`
- `recording: { stop(): Promise<void>; cancel(): Promise<void>; status: "initializing" | "ready-for-frames" | "finalizing" | "canceling" } | null`

Methods:

- `setFps(fps: number): void`
- `setTime(seconds: number): void`
- `setFrame(frame: number): void`
- `play(): void`
- `pause(): void`
- `record(options): Promise<Blob>`

`record(options)`

```ts
type ScalePreset = "1x" | "2x" | "3x" | "4x";

// Deterministic, no dropped frames
record({
  mode: "frame-accurate",
  duration: number,       // seconds, required
  format?: OutputFormat,  // default: new Mp4OutputFormat()
  codec?: VideoCodec,     // default: "avc"
  scale?: ScalePreset,    // default: "2x"
  quality?: Quality,      // default: QUALITY_HIGH
}): Promise<Blob>

// Realtime, records while playing
record({
  mode: "realtime",
  duration?: number,      // optional auto-stop
  format?: OutputFormat,
  codec?: VideoCodec,
  scale?: ScalePreset,
  quality?: Quality,
}): Promise<Blob>
```

Behavior:

- In `frame-accurate` mode, playback is paused and frames are generated deterministically based on `fps` and your scene’s use of `canvas.time`.
- In `realtime` mode, playback continues while frames are captured; you can call `recording.stop()` or `recording.cancel()`.
- During recording, the renderer pixel ratio is set to `1 * scale` and restored afterwards. Width/height are coerced to even values for encoder compatibility.

### Types

- `ScalePreset` — "1x" | "2x" | "3x" | "4x"
- `Seconds` — alias of `number`
- `OutputFormat`, `VideoCodec`, `Quality`, `QUALITY_HIGH` — from `mediabunny`

## Examples

### Realtime recording with UI controls

```tsx
"use client";
import { useState, useRef } from "react";
import {
  VideoCanvas,
  useVideoCanvas,
  VideoCanvasManager,
} from "r3f-video-recorder";
import FileSaver from "file-saver";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

function Box() {
  const canvas = useVideoCanvas();
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.rotation.x = canvas.time * 0.8;
    ref.current.rotation.y = canvas.time;
  });
  return (
    <mesh ref={ref}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="hotpink" />
    </mesh>
  );
}

export default function RealtimeExample() {
  const [vc, setVc] = useState<VideoCanvasManager | null>(null);
  return (
    <>
      <div className="h-[55vh] bg-gray-50">
        <VideoCanvas
          fps={60}
          onCreated={({ videoCanvas }) => setVc(videoCanvas)}
        >
          <ambientLight intensity={0.6} />
          <Box />
        </VideoCanvas>
      </div>
      <button
        onClick={() =>
          vc
            ?.record({ mode: "realtime" })
            .then((blob) => FileSaver.saveAs(blob, "video.mp4"))
        }
        disabled={!vc || !!vc.recording}
      >
        {vc?.recording ? "Recording…" : "Record"}
      </button>
    </>
  );
}
```

### Frame-accurate 5s export

```tsx
vc.record({ mode: "frame-accurate", duration: 5 }).then((blob) =>
  FileSaver.saveAs(blob, "clip.mp4")
);
```

### Custom format/codec/scale/quality

```ts
import { Mp4OutputFormat, QUALITY_HIGH } from "mediabunny";

vc.record({
  mode: "realtime",
  format: new Mp4OutputFormat(),
  codec: "avc",
  scale: "2x",
  quality: QUALITY_HIGH,
});
```

### Status

This is experimental and requires browsers with WebCodecs support (used by `mediabunny`).
