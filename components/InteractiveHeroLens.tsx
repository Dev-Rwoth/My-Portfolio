"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { ArrowDown } from "lucide-react";

/**
 * HERO - the face welded into the mask.
 *
 * This is deliberately NOT "photo layered over video". Two things make the
 * face and the mask read as a single image:
 *
 *  1. ONE shared warp field. Breathing scale, drift, flow-noise and the
 *     cursor parallax are computed once into `pUv`, and BOTH the clip and the
 *     portrait are sampled through it. They cannot drift apart - if the mask
 *     moves, the face moves with it, locked.
 *
 *  2. The face is rebuilt FROM the mask's own pixels. The portrait is used as
 *     a shading/emboss field that reshapes the clip's colour, not as colour
 *     pasted on top. Only FACE_SKIN of real skin tone is mixed back so he
 *     stays recognisable. Every lit pixel of the face is literally mask data.
 *
 * On top of that the clip's luminance gradient pushes the face around, so the
 * mask's moving structures ripple through the portrait as they pass.
 *
 * The eye glow is anchored to the PORTRAIT's eye coordinates (EYE_L / EYE_R
 * below), so the light provably originates at his eyes and the mask's glow
 * reads as emitted from them.
 *
 * ---------------------------------------------------------------------------
 * TUNING - these are the only numbers you should need to touch:
 *   FACE_CENTER  where the portrait sits on screen (x, y; 0..1, y down)
 *   FACE_SCALE   portrait height as a fraction of viewport height
 *   EYE_L/EYE_R  eye centres in PORTRAIT space (0..1 of the image)
 *   FACE_SKIN    0 = face is pure mask data, 1 = full photo colour
 * Nudge FACE_CENTER / FACE_SCALE to line his eyes up with the mask's eyes.
 * ---------------------------------------------------------------------------
 */

const VIDEO_SRC = "/hero-mask.mp4";
const FACE_SRC = "/evans-portrait.png";

const FACE_CENTER = { x: 0.5, y: 0.46 };
const FACE_SCALE = 1.02;
const EYE_L = { x: 0.375, y: 0.42 };
const EYE_R = { x: 0.625, y: 0.42 };
const FACE_SKIN = 0.26;

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
uniform vec2  u_faceCenter;
uniform vec2  u_eyeL;
uniform vec2  u_eyeR;
uniform float u_skin;

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

vec2 coverUv(vec2 uv, vec2 screenRes, vec2 imgRes){
  float sA = screenRes.x / screenRes.y;
  float iA = imgRes.x / imgRes.y;
  vec2 c = uv;
  if (sA > iA) { float s = iA / sA; c.y = (uv.y - 0.5) * s + 0.5; }
  else         { float s = sA / iA; c.x = (uv.x - 0.5) * s + 0.5; }
  return c;
}

vec3 sampleMask(vec2 p){
  vec2 vUv = coverUv(p, u_res, u_videoRes);
  return texture2D(u_video, vUv).rgb;
}

void main(){
  float sA = u_res.x / u_res.y;
  float t  = u_time;

  /* =====================================================================
     ONE SHARED WARP - everything downstream samples through pUv, so the
     mask and the face are welded into a single moving image.
     ===================================================================== */
  vec2 flow = vec2(
    fbm(v_uv * 2.6 + vec2( t * 0.09,  t * 0.06)),
    fbm(v_uv * 2.6 + vec2(-t * 0.08,  t * 0.10))
  );

  float breathe = 1.0 + sin(t * 0.50) * 0.022;
  vec2  drift   = vec2(sin(t * 0.21), cos(t * 0.17)) * 0.010;
  vec2  parallax = (u_mouse - 0.5) * 0.030;

  vec2 pUv = (v_uv - 0.5) / breathe + 0.5;
  pUv += drift + flow * 0.016 + parallax;

  /* ---------------- THE MASK ---------------- */
  vec3 maskCol = sampleMask(pUv);

  float neb = fbm(v_uv * 2.4 + flow * 0.5 + vec2(t * 0.05, -t * 0.04));
  vec3 proc = mix(vec3(0.03, 0.00, 0.09), vec3(0.20, 0.03, 0.36), neb * 0.5 + 0.5);
  proc += vec3(0.0, 0.32, 0.52) * pow(max(0.0, 1.0 - length(v_uv - vec2(0.5,0.45)) * 1.8), 3.0) * 0.5;

  vec3 base = mix(proc, maskCol, u_hasVideo);

  /* ---------------- MASK-DRIVEN PUSH ----------------
     The clip's luminance gradient shoves the face, so the mask's moving
     structures ripple through the portrait as they travel across it.      */
  vec2 px = vec2(1.6 / u_res.x, 1.6 / u_res.y);
  float lx1 = luma(sampleMask(pUv + vec2(px.x, 0.0)));
  float lx0 = luma(sampleMask(pUv - vec2(px.x, 0.0)));
  float ly1 = luma(sampleMask(pUv + vec2(0.0, px.y)));
  float ly0 = luma(sampleMask(pUv - vec2(0.0, px.y)));
  vec2 maskPush = vec2(lx1 - lx0, ly1 - ly0) * 0.055;

  /* ---------------- THE PORTRAIT, IN THE SAME SPACE ---------------- */
  vec2 fUv = (pUv - u_faceCenter) / vec2(u_boxW, u_boxH) + 0.5;
  fUv += maskPush;

  float ca = 0.0030 + u_velocity * 0.010;
  vec3 faceCol;
  faceCol.r = texture2D(u_face, fUv + vec2(ca, 0.0)).r;
  faceCol.g = texture2D(u_face, fUv).g;
  faceCol.b = texture2D(u_face, fUv - vec2(ca, 0.0)).b;

  /* ---------------- KEY THE WHITE STUDIO BACKDROP ---------------- */
  float fl  = luma(faceCol);
  float mx  = max(faceCol.r, max(faceCol.g, faceCol.b));
  float mn  = min(faceCol.r, min(faceCol.g, faceCol.b));
  float sat = mx - mn;
  float keyA = 1.0 - smoothstep(0.60, 0.88, fl) * (1.0 - smoothstep(0.09, 0.24, sat));

  vec2  e   = (fUv - vec2(0.5, 0.43)) / vec2(0.47, 0.52);
  float ell = 1.0 - smoothstep(0.72, 1.04, length(e));

  vec2 inB = step(vec2(0.0), fUv) * step(fUv, vec2(1.0));
  float faceAlpha = keyA * ell * inB.x * inB.y;

  /* ---------------- PRESENCE ----------------
     Kept high and steady: he is embedded in the mask, not flickering in
     and out of it. The cursor only adds local clarity.                    */
  float dMouse = length((v_uv - u_mouse) * vec2(sA, 1.0));
  float lens   = 1.0 - smoothstep(0.10, 0.50, dMouse);
  float grain  = fbm(v_uv * 3.4 + vec2(t * 0.07, -t * 0.05)) * 0.5 + 0.5;
  float breath = 0.5 + 0.5 * sin(t * 0.55);

  float presence = 0.74 + grain * 0.10 + lens * 0.22 + breath * 0.05;
  presence = clamp(presence, 0.0, 1.0);

  /* =====================================================================
     FUSE: rebuild the face OUT OF the mask's pixels.
     'emboss' is the portrait's shading; it reshapes the clip's own colour,
     so every lit pixel of the face is mask data, not photo data.
     ===================================================================== */
  float emboss = fl - 0.48;

  vec3 fused = base * (1.0 + emboss * 2.3);
  fused += base * pow(max(fl - 0.44, 0.0), 1.4) * 1.5;
  fused += vec3(0.10, 0.55, 0.85) * max(emboss, 0.0) * 0.45;

  // a little true skin so he stays recognisably himself
  fused = mix(fused, faceCol * 1.06, u_skin);

  float m = presence * faceAlpha;
  vec3 color = mix(base, fused, m);

  /* ---------------- SILHOUETTE RIM ---------------- */
  float rim = pow(1.0 - abs(faceAlpha * 2.0 - 1.0), 4.0) * presence;
  color += mix(vec3(0.05, 0.85, 1.0), vec3(1.0, 0.25, 0.70), breath) * rim * 0.38;

  /* =====================================================================
     EYE EMISSION - anchored to the PORTRAIT's eyes, so the glow provably
     originates from his eyes and the mask's light reads as coming out of
     them. Drawn additively and NOT gated by the ellipse falloff, so the
     eyes stay the brightest point of the whole frame.
     ===================================================================== */
  // portrait-space -> screen-space scale, so the glow stays circular
  vec2 eyeScale = vec2(u_boxW * sA, u_boxH);

  float pulse = 0.72 + 0.28 * sin(t * 1.9);
  float flick = 0.92 + 0.08 * fbm(vec2(t * 2.4, 0.0));
  float ePow  = pulse * flick;

  vec2 dLv = (fUv - u_eyeL) * eyeScale;
  vec2 dRv = (fUv - u_eyeR) * eyeScale;
  float dL = length(dLv);
  float dR = length(dRv);
  float dE = min(dL, dR);

  float inFace = inB.x * inB.y;

  // tight core + wide bloom
  float core  = exp(-dE * dE * 2600.0) * 1.20;
  float bloom = exp(-dE * dE * 120.0)  * 0.55;
  float halo  = exp(-dE * 7.0)         * 0.22;

  // horizontal anamorphic streak through the eye line
  float useL   = step(dL, dR);
  vec2  dS     = mix(dRv, dLv, useL);
  float streak = exp(-abs(dS.x) * 9.0) * exp(-abs(dS.y) * 150.0) * 0.45;

  float emit = (core + bloom + halo + streak) * ePow * inFace;

  // tint the emission with the mask's own light at the eye, so the glow
  // belongs to the clip rather than being a separate coloured lamp
  vec3 eyeLight = base * 1.4 + vec3(0.35, 0.85, 1.0);
  color += eyeLight * emit;
  color += vec3(1.0) * core * ePow * inFace * 0.5;

  /* ---------------- CRT FINISH ---------------- */
  float sl = sin(v_uv.y * u_res.y * 1.5) * 0.5 + 0.5;
  color *= 1.0 - sl * 0.05;

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
      faceCenter: gl.getUniformLocation(program, "u_faceCenter"),
      eyeL: gl.getUniformLocation(program, "u_eyeL"),
      eyeR: gl.getUniformLocation(program, "u_eyeR"),
      skin: gl.getUniformLocation(program, "u_skin"),
    };

    // The vertex shader already flips v (top-left origin), which matches the
    // default upload order. Flipping here too would invert both textures.
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
    let boxH = FACE_SCALE;

    const sizeBox = () => {
      const sAspect = canvas.width / Math.max(1, canvas.height);
      boxH = FACE_SCALE;
      boxW = (boxH * faceAspect) / sAspect;
      if (boxW > 0.88) {
        boxW = 0.88;
        boxH = (boxW * sAspect) / faceAspect;
      }
    };

    const resize = () => {
      const el = containerRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = el ? el.clientWidth : window.innerWidth;
      const h = el ? el.clientHeight : window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
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
      gl.uniform2f(U.faceCenter, FACE_CENTER.x, FACE_CENTER.y);
      gl.uniform2f(U.eyeL, EYE_L.x, EYE_L.y);
      gl.uniform2f(U.eyeR, EYE_R.x, EYE_R.y);
      gl.uniform1f(U.skin, FACE_SKIN);

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

      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

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
            className="absolute left-1/2 top-1/2 h-[92%] -translate-x-1/2 -translate-y-1/2 object-contain mix-blend-screen opacity-75"
            style={{
              WebkitMaskImage:
                "radial-gradient(ellipse 46% 52% at 50% 43%, #000 55%, transparent 100%)",
              maskImage:
                "radial-gradient(ellipse 46% 52% at 50% 43%, #000 55%, transparent 100%)",
            }}
          />
        </div>
      )}

      <div className="absolute inset-x-0 top-0 h-32 z-[12] pointer-events-none bg-gradient-to-b from-black/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[45%] z-[12] pointer-events-none bg-gradient-to-t from-black/90 via-black/35 to-transparent" />

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
