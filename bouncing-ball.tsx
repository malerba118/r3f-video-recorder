"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  useVideoCanvas,
  VideoCanvas,
  VideoCanvasManager,
} from "./lib/video-timeline";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Scene() {
  const videoCanvasRef = useRef<VideoCanvasManager>(null);
  return (
    <div className="w-screen h-screen bg-white flex flex-col items-center justify-center">
      <button onClick={() => videoCanvasRef.current?.play()}>Play</button>
      <button onClick={() => videoCanvasRef.current?.pause()}>Pause</button>
      <button
        onClick={() =>
          videoCanvasRef.current
            ?.record({ duration: 10 })
            .then((blob) => download(blob, "myfile"))
            .catch((err) => console.log("ERRRRRRRRORR", err?.message))
        }
      >
        Record
      </button>

      <div className="h-1/2 w-1/2 bg-black">
        <VideoCanvas
          fps={10}
          onVideoCanvasCreated={(videoCanvas) => {
            videoCanvasRef.current = videoCanvas;
          }}
          camera={{ position: [0, 0, 8] }}
          gl={{ preserveDrawingBuffer: true, alpha: false }}
        >
          <color attach="background" args={["black"]} />
          <TwistyCubeShader />
          <OrbitControls
            enablePan={false}
            enableZoom={false}
            enableRotate={false}
          />
        </VideoCanvas>
      </div>
    </div>
  );
}

function TwistyCubeShader() {
  const canvas = useVideoCanvas();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { size, gl } = useThree((s) => ({ size: s.size, gl: s.gl }));

  const noiseTexture = useMemo(() => {
    const width = 8;
    const height = 8;
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const v = Math.floor(Math.random() * 256);
      data[i * 4 + 0] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  }, []);

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
    }
  `;

  const fragmentShader = `
    precision highp float;

    uniform float iTime;
    uniform vec3 iResolution;
    uniform sampler2D iChannel0;

    float t;

    mat2 rot(float a)
    {
        float s = sin(a), c = cos(a);
        return mat2(c,s,-s,c);
    }

    float sdBox( vec3 p, vec3 b )
    {
      p.xz *= rot(t);
      p.yx *= rot(.6*t);
      vec3 d = abs(p) - b;
      return min(max(d.x,max(d.y,d.z)),0.0) + length(max(d,0.0));
    }

    float sdRay(vec3 p, vec3 s, vec3 e){
        e = s + e;
        vec3 l1 = p-s;
        vec3 l2 = (e-s)*(max( dot(l1,(e-s) ) /(dot(e-s,e-s)), 0.) );
        return length(l1-l2)-.2;
    }

    float map(vec3 p){
        float b = sdBox(p-vec3(0.,0.,7.),vec3(2.7));
        return b;
    }

    vec3 norm(vec3 p){
        // Numerical gradient approximation to avoid derivative extensions
        float e = 0.001;
        vec2 k = vec2(1.0, -1.0);
        return normalize(
            k.xyy * map(p + k.xyy * e) +
            k.yyx * map(p + k.yyx * e) +
            k.yxy * map(p + k.yxy * e) +
            k.xxx * map(p + k.xxx * e)
        );
    }

    void mainImage( out vec4 fragColor, in vec2 fragCoord )
    {
        vec2 uv = (2.0*fragCoord - iResolution.xy) / iResolution.y;
        t = iTime + 0.2 * sin(uv.x * 1.76 + uv.y * 1.0 + iTime);

        vec3 ro = vec3(0.0, 0.0, -2.0);
        ro.y += 0.6 * sin(iTime);
        vec3 rd = normalize(vec3(uv, 1.4));

        vec3 p = ro;
        float dist = 0.0;
        float total = 0.0;
        bool hit = false;
        for (int i = 0; i < 64; i++) {
            dist = map(p);
            if (dist < 0.001) { hit = true; break; }
            total += dist;
            if (total > 10.0) break;
            p += rd * dist;
        }

        if (!hit) {
            fragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }

        vec3 n = norm(p);
        vec3 ld = normalize(vec3(0.5, 0.0, -0.4));
        float l = max(0.4, dot(-n, ld));
        float shade = l / (dist * dist + 0.6);
        vec3 col = abs(sin(length(2.0 * cos(p)) * n + t));
        vec4 c = shade * (vec4(0.4) + 0.3 * vec4(col, col.b));

        vec2 q = floor(fragCoord / 2.0);
        vec2 mod8 = mod(q, 8.0);
        vec2 noiseUV = (mod8 + 0.5) / 8.0;
        float b = texture2D(iChannel0, noiseUV).r;
        fragColor = floor(c * 4.0 + 2.0 * b - 1.0) / 4.0;
    }

    void main() {
      vec4 color;
      mainImage(color, gl_FragCoord.xy);
      gl_FragColor = color;
    }
  `;

  useFrame(() => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.iTime.value = canvas.time;
    materialRef.current.uniforms.iResolution.value.set(
      size.width * gl.getPixelRatio(),
      size.height * gl.getPixelRatio(),
      1
    );
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={materialRef}
        depthTest={false}
        depthWrite={false}
        side={THREE.DoubleSide}
        glslVersion={THREE.GLSL1}
        uniforms={{
          iTime: { value: 0 },
          iResolution: {
            value: new THREE.Vector3(
              size.width * gl.getPixelRatio(),
              size.height * gl.getPixelRatio(),
              1
            ),
          },
          iChannel0: { value: noiseTexture },
        }}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </mesh>
  );
}
