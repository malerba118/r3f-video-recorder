# r3f-video-recorder

This is a video recording framework built on @react-three/fiber and mediabunny which supports both realtime canvas capture as well as frame-accurate video rendering.

Rendering videos reliably across all browsers is quite difficult but this library offers a nice set of guarantees including:

- Render to `mp4/h264` in all browsers.
- A frame-aligned clock so your video preview can appear consistent with your rendered export.
- Fast rendering times while in `frame-accurate` recording mode (eg 10s to render 60s video).
- Adjustable `fps`, `size`, `quality`, `format`, `codec`.

### Installation

I'm going with shadcn-stlye installation on this one so you're going to have to copy/pasta the contents of [r3f-video-recorder.tsx](/r3f-video-recorder.tsx) into your project. (I'm lazy and don't feel like turning this into an official npm package. I also know i will suck at keeping an npm package up-to-date so i think this is the best way atm).

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

## Realtime Rendering

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

## Frame-Accurate Rendering

`frame-accurate` rendering is more robust than `realtime` rendering since it hijacks `videoCanvas.time` and ticks through frame-by-frame, only moving on to render the next frame once the previous frame has been captured.

This is nice because your videos will always be rendered exactly the same regardless of contextual hiccups like low battery power or the user deciding to visit another tab during the recording process.

However, it is imperative when using this mode that your video frames are rendered as a pure function of the current `videoClock.time`. If your frames depend on external variables such as the `THREE.clock.elapsedTime`, or `Math.random()` then there's no guarantee that frame 37 will be rendered identically across two different exports.

```tsx
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { observer } from "mobx-react";
import {
  VideoCanvas,
  VideoCanvasManager,
  useVideoCanvas,
} from "./r3f-video-recorder";

function Box() {
  const videoCanvas = useVideoCanvas();
  const mesh = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!mesh.current) return;
    mesh.current.rotation.x = videoCanvas.time * 0.7;
    mesh.current.rotation.y = videoCanvas.time;
  });

  return (
    <mesh ref={mesh}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="cyan" />
    </mesh>
  );
}

const App = observer(() => {
  const [videoCanvas, setVideoCanvas] = useState<VideoCanvasManager | null>(
    null
  );

  return (
    <main className="h-screen">
      {videoCanvas && (
        <Button
          className="fixed top-4 right-4"
          onClick={() => {
            videoCanvas
              .record({
                mode: "frame-accurate",
                size: "2x",
                duration: 10,
              })
              .then((blob) => {
                FileSaver.saveAs(blob, "video.mp4");
              });
          }}
        >
          Record
        </Button>
      )}
      <VideoCanvas
        fps={60}
        onCreated={({ videoCanvas }) => {
          setVideoCanvas(videoCanvas);
        }}
      >
        <ambientLight intensity={0.6} />
        <Box />
      </VideoCanvas>
    </main>
  );
});
```

### Hacky tip

Since many existing r3f scenes are heavily dependent on `clock.elapsedTime`, you can try syncing `clock.elapsedTime` with `videoCanvas.time` somewhere at the top level in a frame loop.

```tsx
const ClockSync = () => {
  const videoCanvas = useVideoCanvas();
  useFrame(({ clock }) => {
    clock.elapsedTime = videoCanvas.time;
  });
};
```

## API Reference

### `<VideoCanvas>`

An extension of r3f `<Canvas>` so it can be swapped in place. It includes a couple of additional props.

Props:

- `fps: number` — Target frames per second for video preview and recording
- `onCreated?: (state: RootState & { videoCanvas: VideoCanvasManager }) => void` — Called when the canvas is ready
- Accepts all other `@react-three/fiber` `Canvas` props

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
const videoCanvas = useVideoCanvas();
videoCanvas.time; // seconds (derived from frame and fps)
videoCanvas.frame; // integer frame index
```

### `VideoCanvasManager`

Provides control over playback and recording.

Properties (all reactive via mobx):

- `fps: number` target framerate
- `rawTime: number` raw clock time
- `time: number` frame-aligned clock time
- `frame: number` current video frame
- `isPlaying: boolean` current playback state
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
type SizePreset = "1x" | "2x" | "3x" | "4x";

// Deterministic, no dropped frames
record({
  mode: "frame-accurate",
  duration: number,       // seconds, required
  format?: OutputFormat,  // default: new Mp4OutputFormat()
  codec?: VideoCodec,     // default: "avc"
  size?: SizePreset,      // default: "2x"
  quality?: Quality,      // default: QUALITY_HIGH
}): Promise<Blob>

// Realtime, records while playing
record({
  mode: "realtime",
  duration?: number,      // optional auto-stop
  format?: OutputFormat,
  codec?: VideoCodec,
  size?: SizePreset,
  quality?: Quality,
}): Promise<Blob>
```

### Types

- `SizePreset` — "1x" | "2x" | "3x" | "4x"
- `Seconds` — alias of `number`
- `OutputFormat`, `VideoCodec`, `Quality`, `QUALITY_HIGH` — from `mediabunny`
