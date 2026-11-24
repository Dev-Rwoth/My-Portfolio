"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { ArrowDown } from "lucide-react";

/**
 * HERO - "The machine dreams a face."
 *
 * The AI motion graphic (public/hero-ai.mp4) is the mask. Evans' portrait
 * (public/evans-portrait.png) is composited INTO it on the GPU so the face
 * is never a photo pasted on top - it materialises out of the data stream:
 *
 *   - the face resolves where the clip is energetic (bright data = more face)
 *   - a scan sweep travels up the frame, printing the face as it passes
 *   - the cursor is a clarity lens that parts the mask and sharpens the face
 *   - where the mask wins, the face smears along a flow field and splits into
 *     RGB fringes, so it dissolves back into the stream instead of cutting off
 *
 * The portrait's white studio background is keyed out in-shader (luma + low
 * saturation) and softened by an elliptical falloff, so there is no visible
 * photo rectangle - only the head emerging.
 */

const VIDEO_SRC = "/hero-ai.mp4";
const FACE_SRC = "/evans-portrait.png";

const VERT = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = (a_position + 1.0) * 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
varying vec2 v_uv;

uniform sampler2D u_video;
uniform sampler2D u_face;
uniform vec2  u_res;
uniform vec2  u_videoRes;
uniform vec2  u_mouse;
uniform float u_time;
uniform float u_velocity;
uniform float u_hasVideo;
uniform float u_boxW;
uniform float u_boxH;

/* ---- simplex noise ---- */
vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec2 mod289(vec2 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float fbm(vec2 p){
  float v = 0.0;
  v += 0.5000 * snoise(p); p *= 2.02;
  v += 0.2500 * snoise(p); p *= 2.03;
  v += 0.1250 * snoise(p);
  return v;
}

float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

/* object-fit: cover */
vec2 coverUv(vec2 uv, vec2 screenRes, vec2 imgRes){
  float sA = screenRes.x / screenRes.y;
  float iA = imgRes.x / imgRes.y;
  vec2 c = uv;
  if (sA > iA) { float s = iA / sA; c.y = (uv.y - 0.5) * s + 0.5; }
  else         { float s = sA / iA; c.x = (uv.x - 0.5) * s + 0.5; }
  return c;
}

void main(){
  float sA = u_res.x / u_res.y;
  float t  = u_time;

  /* ---------------- THE MASK: the AI clip ---------------- */
  vec2 flow = vec2(
    fbm(v_uv * 3.0 + vec2( t * 0.10, t * 0.07)),
    fbm(v_uv * 3.0 + vec2(-t * 0.09, t * 0.11))
  );

  vec2 vUv = coverUv(v_uv, u_res, u_videoRes);
  vec3 videoCol = texture2D(u_video, vUv).rgb;

  // Procedural synthwave nebula: carries the look before the clip decodes
  float neb = fbm(v_uv * 2.4 + flow * 0.5 + vec2(t * 0.05, -t * 0.04));
  vec3 proc = mix(vec3(0.03, 0.00, 0.09), vec3(0.22, 0.03, 0.38), neb * 0.5 + 0.5);
  proc += vec3(0.00, 0.35, 0.55) * pow(max(0.0, 1.0 - length(v_uv - vec2(0.5, 0.45)) * 1.8), 3.0) * 0.5;

  vec3 base = mix(proc, videoCol, u_hasVideo);
  float energy = luma(base);

  /* ---------------- THE PORTRAIT BOX ---------------- */
  vec2 faceCenter = vec2(0.5, 0.47);
  vec2 fUv = (v_uv - faceCenter) / vec2(u_boxW, u_boxH) + 0.5;

  /* ---------------- THE REVEAL MASK ---------------- */
  float dMouse = length((v_uv - u_mouse) * vec2(sA, 1.0));
  float lens   = 1.0 - smoothstep(0.08, 0.46, dMouse);

  float grain  = fbm(v_uv * 3.6 + vec2(t * 0.08, -t * 0.06)) * 0.5 + 0.5;
  float breath = 0.5 + 0.5 * sin(t * 0.55);

  // Printing sweep: travels up the frame, resolving the face as it passes
  float scanY = fract(t * 0.13);
  float scan  = exp(-abs(v_uv.y - scanY) * 7.0);

  float reveal = 0.42
               + energy * 0.40
               + grain  * 0.18
               + lens   * 0.45
               + breath * 0.10
               + scan   * 0.30;
  reveal = smoothstep(0.38, 0.74, reveal);

  /* ---------------- SAMPLE THE FACE ---------------- */
  // Where the mask wins, the face smears along the flow field
  vec2 fUvD = fUv + flow * (1.0 - reveal) * 0.055;

  // RGB dispersion: strongest at the dissolving edges and under fast cursor motion
  float ca = 0.0035 + u_velocity * 0.012 + (1.0 - reveal) * 0.010;
  vec3 faceCol;
  faceCol.r = texture2D(u_face, fUvD + vec2(ca, 0.0)).r;
  faceCol.g = texture2D(u_face, fUvD).g;
  faceCol.b = texture2D(u_face, fUvD - vec2(ca, 0.0)).b;

  /* ---------------- KEY OUT THE WHITE STUDIO BACKDROP ---------------- */
  float fl  = luma(faceCol);
  float mx  = max(faceCol.r, max(faceCol.g, faceCol.b));
  float mn  = min(faceCol.r, min(faceCol.g, faceCol.b));
  float sat = mx - mn;

  // bright + desaturated => backdrop, drop it
  float keyA = 1.0 - smoothstep(0.60, 0.88, fl) * (1.0 - smoothstep(0.09, 0.24, sat));

  // elliptical falloff centred on the head, so nothing reads as a photo edge
  vec2  e   = (fUv - vec2(0.5, 0.43)) / vec2(0.47, 0.52);
  float ell = 1.0 - smoothstep(0.74, 1.04, length(e));

  // stay inside the portrait box
  vec2 inside = step(vec2(0.0), fUvD) * step(fUvD, vec2(1.0));
  float faceAlpha = keyA * ell * inside.x * inside.y;

  /* ---------------- GRADE THE FACE INTO THE PALETTE ---------------- */
  vec3 duo = mix(vec3(0.16, 0.02, 0.30), vec3(0.58, 0.93, 1.0), fl);
  vec3 graded = mix(faceCol * 1.12, duo, 0.38);
  // let the data stream glow through the skin
  graded += base * 0.18;

  /* ---------------- COMPOSITE ---------------- */
  float m = reveal * faceAlpha;
  vec3 color = mix(base, graded, m);

  // Materialising fringe where the face is half-resolved
  float edge = pow(1.0 - abs(reveal * 2.0 - 1.0), 3.0);
  vec3 fringe = mix(vec3(1.0, 0.18, 0.60), vec3(0.10, 0.90, 1.0), grain);
  color += fringe * edge * faceAlpha * 0.55;

  // Rim light tracing the keyed silhouette
  float rim = pow(1.0 - abs(faceAlpha * 2.0 - 1.0), 4.0) * reveal;
  color += mix(vec3(0.05, 0.85, 1.0), vec3(1.0, 0.25, 0.70), breath) * rim * 0.40;

  /* ---------------- CRT FINISH ---------------- */
  float sl = sin(v_uv.y * u_res.y * 1.5) * 0.5 + 0.5;
  color *= 1.0 - sl * 0.055;

  float vig = length(v_uv - 0.5);
  color *= 1.0 - smoothstep(0.42, 0.95, vig) * 0.55;

  gl_FragColor = vec4(color, 1.0);
}
`;

export default function InteractiveHeroLens() {
  const containerRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [glFailed, setGlFailed] = useState(false);
  const [mouseVelocity, setMouseVelocity] = useState(0);

  const mouseRef = useRef({ targetX: 0.5, targetY: 0.42, speed: 0 });

  const scrollToStory = () => {
    const el = document.getElementById("story");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let clientX = 0;
      let clientY = 0;

      if ("touches" in e) {
        if (e.touches.length > 0) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        }
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const nx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const ny = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

      const dx = nx - mouseRef.current.targetX;
      const dy = ny - mouseRef.current.targetY;

      mouseRef.current.targetX = nx;
      mouseRef.current.targetY = ny;
      mouseRef.current.speed = Math.min(Math.sqrt(dx * dx + dy * dy) * 18, 1);
      setMouseVelocity(mouseRef.current.speed);
    },
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas) return;

    const gl = (canvas.getContext("webgl", {
      alpha: false,
      antialias: true,
      powerPreference: "high-performance",
    }) ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;

    if (!gl) {
      setGlFailed(true);
      return;
    }

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("shader:", gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      setGlFailed(true);
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      setGlFailed(true);
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("link:", gl.getProgramInfoLog(program));
      setGlFailed(true);
      return;
    }
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const U = {
      video: gl.getUniformLocation(program, "u_video"),
      face: gl.getUniformLocation(program, "u_face"),
      res: gl.getUniformLocation(program, "u_res"),
      videoRes: gl.getUniformLocation(program, "u_videoRes"),
      mouse: gl.getUniformLocation(program, "u_mouse"),
      time: gl.getUniformLocation(program, "u_time"),
      velocity: gl.getUniformLocation(program, "u_velocity"),
      hasVideo: gl.getUniformLocation(program, "u_hasVideo"),
      boxW: gl.getUniformLocation(program, "u_boxW"),
      boxH: gl.getUniformLocation(program, "u_boxH"),
    };

    // The vertex shader already flips v so that v_uv is top-left origin, which
    // matches the default upload order (row 0 = top of image). Flipping here as
    // well would invert both the clip and the portrait.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

    const makeTex = () => {
      const tx = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([8, 2, 20, 255])
      );
      return tx;
    };

    const videoTex = makeTex();
    const faceTex = makeTex();

    // Portrait aspect drives the box; refined once the PNG reports its size
    let faceAspect = 765 / 1024;
    let faceLoaded = false;

    const faceImg = new Image();
    faceImg.src = FACE_SRC;
    faceImg.onload = () => {
      faceAspect = (faceImg.naturalWidth || 765) / (faceImg.naturalHeight || 1024);
      gl.bindTexture(gl.TEXTURE_2D, faceTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, faceImg);
      faceLoaded = true;
      sizeBox();
    };

    let boxW = 0.42;
    let boxH = 1.0;

    // Fit the portrait: full height where there is room, shrunk on narrow screens
    const sizeBox = () => {
      const sAspect = canvas.width / Math.max(1, canvas.height);
      boxH = 1.02;
      boxW = (boxH * faceAspect) / sAspect;
      if (boxW > 0.88) {
        boxW = 0.88;
        boxH = (boxW * sAspect) / faceAspect;
      }
    };

    let width = 0;
    let height = 0;
    const resize = () => {
      const el = containerRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = el ? el.clientWidth : window.innerWidth;
      height = el ? el.clientHeight : window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      sizeBox();
    };
    window.addEventListener("resize", resize);
    resize();

    let videoReady = false;
    let videoW = 1920;
    let videoH = 1080;
    const onVideoReady = () => {
      if (!video) return;
      videoW = video.videoWidth || 1920;
      videoH = video.videoHeight || 1080;
      videoReady = true;
    };
    if (video) {
      video.addEventListener("loadeddata", onVideoReady);
      video.addEventListener("playing", onVideoReady);
      const p = video.play();
      if (p && typeof p.catch === "function") p.catch(() => undefined);
    }

    let mx = 0.5;
    let my = 0.42;
    let vel = 0;
    const start = performance.now();
    let raf = 0;

    const render = (now: number) => {
      const t = (now - start) * 0.001;

      mx += (mouseRef.current.targetX - mx) * 0.08;
      my += (mouseRef.current.targetY - my) * 0.08;
      vel += (mouseRef.current.speed - vel) * 0.1;
      mouseRef.current.speed *= 0.94;

      // Pull the current video frame onto the GPU
      let hasVideo = 0;
      if (video && videoReady && video.readyState >= 2) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, videoTex);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
          hasVideo = 1;
        } catch {
          hasVideo = 0;
        }
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, videoTex);
      gl.uniform1i(U.video, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, faceTex);
      gl.uniform1i(U.face, 1);

      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform2f(U.videoRes, videoW, videoH);
      gl.uniform2f(U.mouse, mx, my);
      gl.uniform1f(U.time, t);
      gl.uniform1f(U.velocity, vel);
      gl.uniform1f(U.hasVideo, hasVideo);
      gl.uniform1f(U.boxW, boxW);
      gl.uniform1f(U.boxH, faceLoaded ? boxH : 0.0001);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      if (video) {
        video.removeEventListener("loadeddata", onVideoReady);
        video.removeEventListener("playing", onVideoReady);
      }
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteTexture(videoTex);
      gl.deleteTexture(faceTex);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <section
      id="hero-lens"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onTouchMove={handleMouseMove}
      className="relative w-full h-screen min-h-screen overflow-hidden select-none bg-black cursor-crosshair"
    >
      {/* Source clip: decoded off-screen and sampled into the shader each frame */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none"
        src={VIDEO_SRC}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      />

      {/* The composite: mask + face, resolved on the GPU */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* Plain fallback if WebGL is unavailable */}
      {glFailed && (
        <div className="absolute inset-0 z-10">
          <video
            className="absolute inset-0 w-full h-full object-cover"
            src={VIDEO_SRC}
            autoPlay
            muted
            loop
            playsInline
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={FACE_SRC}
            alt="Evans Rwothomio"
            className="absolute left-1/2 top-1/2 h-[90%] -translate-x-1/2 -translate-y-1/2 object-contain mix-blend-screen opacity-80"
            style={{
              WebkitMaskImage:
                "radial-gradient(ellipse 46% 52% at 50% 43%, #000 55%, transparent 100%)",
              maskImage:
                "radial-gradient(ellipse 46% 52% at 50% 43%, #000 55%, transparent 100%)",
            }}
          />
        </div>
      )}

      {/* Legibility scrims */}
      <div className="absolute inset-x-0 top-0 h-32 z-[12] pointer-events-none bg-gradient-to-b from-black/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[45%] z-[12] pointer-events-none bg-gradient-to-t from-black/90 via-black/35 to-transparent" />

      {/* ---------------- TOP HUD ---------------- */}
      <header className="absolute top-6 left-6 right-6 z-40 flex items-center justify-between text-xs font-mono uppercase tracking-widest text-zinc-400 pointer-events-auto">
        <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-xl">
          <span className="w-2 h-2 rounded-full bg-fuchsia-400 animate-pulse" />
          <span className="text-white font-bold tracking-wider">EVANS RWOTHOMIO</span>
          <span className="text-zinc-500">/</span>
          <span className="text-cyan-400 hidden sm:inline">SIGNAL ACQUIRED</span>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="mailto:evansrwothomio20@gmail.com?subject=Hello%20Evans%20-%20Portfolio%20Inquiry"
            className="hidden sm:inline-flex items-center gap-1.5 bg-cyan-500/20 hover:bg-cyan-400 text-cyan-300 hover:text-black font-semibold px-4 py-2 rounded-full backdrop-blur-md border border-cyan-500/30 transition-all duration-300 text-xs tracking-wider shadow-lg"
          >
            <span>Email Evans</span>
          </a>
          <button
            onClick={scrollToStory}
            className="bg-white/10 hover:bg-white text-white hover:text-black font-semibold px-4 sm:px-5 py-2 rounded-full backdrop-blur-md border border-white/15 transition-all duration-300 text-xs tracking-wider cursor-pointer shadow-lg"
          >
            Story &amp; Works &#8595;
          </button>
        </div>
      </header>

      {/* ---------------- CTA ---------------- */}
      <div className="absolute left-6 sm:left-12 md:left-16 lg:left-24 bottom-16 sm:bottom-20 md:bottom-24 z-30 pointer-events-auto">
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={scrollToStory}
            className="px-7 sm:px-9 py-3.5 sm:py-4 rounded-full bg-white text-zinc-950 font-bold text-xs sm:text-sm uppercase tracking-wider hover:bg-cyan-400 hover:text-black transition-all duration-300 shadow-2xl shadow-fuchsia-500/25 flex items-center gap-2.5 group cursor-pointer"
          >
            <span>Enter Portfolio</span>
            <ArrowDown className="w-4 h-4 group-hover:translate-y-1 transition-transform" />
          </button>

          <div className="flex items-center gap-2.5 text-xs font-mono text-zinc-300 bg-black/60 backdrop-blur-md px-4 py-3 rounded-full border border-white/10 shadow-lg">
            <span
              className={
                "w-2 h-2 rounded-full " +
                (mouseVelocity > 0.15 ? "bg-fuchsia-400 animate-ping" : "bg-cyan-400")
              }
            />
            <span className="hidden sm:inline">Move to resolve</span>
            <span className="sm:hidden">Swipe to resolve</span>
          </div>
        </div>
      </div>

      {/* ---------------- BOTTOM RIGHT HUD ---------------- */}
      <div className="absolute right-6 sm:right-12 bottom-8 sm:bottom-12 z-30 hidden md:flex flex-col items-end pointer-events-none text-right font-mono">
        <span className="text-[11px] text-cyan-400 uppercase tracking-widest font-semibold">
          {"// FUTURISTIC / SYNTHWAVE / DUOTONE"}
        </span>
        <span className="text-white font-extrabold text-sm sm:text-base mt-1 drop-shadow-md">
          EVANS RWOTHOMIO
        </span>
        <span className="text-zinc-400 text-xs">
          Full-Stack Systems Engineer &bull; Uganda
        </span>
      </div>

      {/* ---------------- SCROLL INDICATOR ---------------- */}
      <button
        onClick={scrollToStory}
        aria-label="Scroll to main content"
        className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-30 text-zinc-400 hover:text-cyan-400 transition-colors p-2 cursor-pointer flex flex-col items-center gap-1 group"
      >
        <span className="text-[10px] font-mono tracking-widest uppercase opacity-0 group-hover:opacity-100 transition-opacity">
          SCROLL
        </span>
        <ArrowDown className="w-4 h-4 animate-bounce" />
      </button>
    </section>
  );
}
