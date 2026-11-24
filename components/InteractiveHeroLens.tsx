"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { ArrowDown, Sparkles } from "lucide-react";

/**
 * HERO MEDIA - "Birth of Artificial Intelligence" (futuristic / synthwave duotone)
 *
 * Reference clip: iStock #1145176105 (royalty-free, licence required).
 * Drop the licensed download at `public/hero-ai.mp4` (optionally `public/hero-ai.webm`
 * and a still at `public/hero-ai-poster.jpg`) and it becomes the hero background
 * automatically - this component probes for it on mount.
 *
 * Until that file exists, the same look is generated live on canvas: a duotone
 * magenta/cyan neural network igniting from a central core over a synthwave grid.
 */

const VIDEO_SRC = "/hero-ai.mp4";
const VIDEO_SRC_WEBM = "/hero-ai.webm";
const POSTER_SRC = "/hero-ai-poster.jpg";

type NeuralNode = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
  depth: number;
};

type Signal = { a: number; b: number; t: number; speed: number };

export default function InteractiveHeroLens() {
  const containerRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [hasPoster, setHasPoster] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [mouseVelocity, setMouseVelocity] = useState(0);

  const mouseRef = useRef({ targetX: 0.5, targetY: 0.5, speed: 0 });
  // Once the clip is actually painting frames the generated field is torn down,
  // so the footage shows exactly as authored and nothing burns CPU behind it.
  const videoReadyRef = useRef(false);

  const markVideoReady = useCallback(() => {
    videoReadyRef.current = true;
    setVideoReady(true);
  }, []);

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

  /* ---------------- PROBE FOR THE LICENSED STOCK CLIP ---------------- */
  useEffect(() => {
    let cancelled = false;

    const probe = async (url: string) => {
      try {
        const res = await fetch(url, { method: "HEAD" });
        const type = res.headers.get("content-type") || "";
        return res.ok && !type.includes("text/html");
      } catch {
        return false;
      }
    };

    (async () => {
      const [mp4, webm, poster] = await Promise.all([
        probe(VIDEO_SRC),
        probe(VIDEO_SRC_WEBM),
        probe(POSTER_SRC),
      ]);
      if (cancelled) return;
      setHasPoster(poster);
      if (mp4 || webm) {
        setVideoSrc(mp4 ? VIDEO_SRC : VIDEO_SRC_WEBM);
        setHasVideo(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------- GENERATED "BIRTH OF AI" NEURAL FIELD ---------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let frame = 0;
    let nodes: NeuralNode[] = [];
    let signals: Signal[] = [];

    const NODE_COUNT = 120;
    const LINK_DIST = 170;

    const seed = () => {
      nodes = [];
      for (let i = 0; i < NODE_COUNT; i++) {
        // Bias toward a dense core so the network reads as a mind forming
        const a = Math.random() * Math.PI * 2;
        const rad = Math.pow(Math.random(), 0.65);
        const depth = 0.35 + Math.random() * 0.65;
        nodes.push({
          x: width * 0.5 + Math.cos(a) * rad * width * 0.46,
          y: height * 0.46 + Math.sin(a) * rad * height * 0.44,
          vx: (Math.random() - 0.5) * 0.28,
          vy: (Math.random() - 0.5) * 0.28,
          r: 0.7 + Math.random() * 1.9,
          phase: Math.random() * Math.PI * 2,
          depth,
        });
      }
      signals = Array.from({ length: 26 }, () => ({
        a: Math.floor(Math.random() * NODE_COUNT),
        b: Math.floor(Math.random() * NODE_COUNT),
        t: Math.random(),
        speed: 0.004 + Math.random() * 0.012,
      }));
    };

    const resize = () => {
      const el = containerRef.current;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = el ? el.clientWidth : window.innerWidth;
      height = el ? el.clientHeight : window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    window.addEventListener("resize", resize);
    resize();

    // Duotone synthwave ramp: hot magenta -> electric cyan
    const duotone = (t: number, alpha: number) => {
      const c = Math.max(0, Math.min(1, t));
      const r = Math.round(255 * (1 - c) + 24 * c);
      const g = Math.round(45 * (1 - c) + 229 * c);
      const b = Math.round(149 * (1 - c) + 255 * c);
      return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
    };

    let mx = 0.5;
    let my = 0.5;
    let vel = 0;
    let raf = 0;

    const render = () => {
      // The licensed clip has taken over - stop drawing and stop rescheduling.
      if (videoReadyRef.current) return;

      frame++;
      const time = frame * 0.016;

      mx += (mouseRef.current.targetX - mx) * 0.07;
      my += (mouseRef.current.targetY - my) * 0.07;
      vel += (mouseRef.current.speed - vel) * 0.1;
      mouseRef.current.speed *= 0.94;

      const px = (mx - 0.5) * 2;

      /* ---- VOID BACKDROP ---- */
      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, "#05000f");
      bg.addColorStop(0.55, "#0d0124");
      bg.addColorStop(1, "#16002e");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      /* ---- HORIZON SUN BLOOM ---- */
      const hy = height * 0.74;
      const sunX = width * 0.5 - px * 26;
      const sun = ctx.createRadialGradient(sunX, hy, 0, sunX, hy, Math.max(width, height) * 0.5);
      sun.addColorStop(0, "rgba(255,70,160,0.30)");
      sun.addColorStop(0.35, "rgba(140,30,180,0.16)");
      sun.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, width, height);

      /* ---- SYNTHWAVE PERSPECTIVE GRID ---- */
      ctx.save();
      ctx.lineWidth = 1;
      const scroll = (time * 0.35) % 1;
      for (let i = 1; i <= 16; i++) {
        const k = (i - scroll) / 16;
        if (k <= 0) continue;
        const y = hy + Math.pow(k, 2.3) * (height - hy) * 1.9;
        if (y > height + 2) continue;
        ctx.strokeStyle = "rgba(0,229,255," + (0.22 * (1 - k) + 0.04) + ")";
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      const vpx = width * 0.5 - px * 60;
      for (let i = -14; i <= 14; i++) {
        const spread = i * width * 0.12;
        ctx.strokeStyle = "rgba(255,45,149," + Math.max(0.03, 0.2 - Math.abs(i) * 0.012) + ")";
        ctx.beginPath();
        ctx.moveTo(vpx, hy);
        ctx.lineTo(vpx + spread * 2.4, height);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(0,229,255,0.45)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, hy);
      ctx.lineTo(width, hy);
      ctx.stroke();
      ctx.restore();

      /* ---- NEURAL NETWORK: THE BIRTH ---- */
      const cx = width * 0.5;
      const cy = height * 0.44;
      const pulse = 0.5 + 0.5 * Math.sin(time * 0.7);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      // Drifting nodes, gently orbiting the core and pushed by the cursor
      for (const n of nodes) {
        if (!prefersReduced) {
          n.x += n.vx * n.depth;
          n.y += n.vy * n.depth;

          const dcx = n.x - cx;
          const dcy = n.y - cy;
          const dc = Math.sqrt(dcx * dcx + dcy * dcy) || 1;
          n.vx -= (dcx / dc) * 0.0022 * (dc / (width * 0.5));
          n.vy -= (dcy / dc) * 0.0022 * (dc / (height * 0.5));

          const mdx = n.x - mx * width;
          const mdy = n.y - my * height;
          const md = Math.sqrt(mdx * mdx + mdy * mdy) || 1;
          if (md < 260) {
            const push = ((260 - md) / 260) * (0.5 + vel * 2.6);
            n.vx += (mdx / md) * push * 0.09;
            n.vy += (mdy / md) * push * 0.09;
          }

          n.vx *= 0.985;
          n.vy *= 0.985;
        }

        if (n.x < -40) n.x = width + 40;
        if (n.x > width + 40) n.x = -40;
        if (n.y < -40) n.y = height + 40;
        if (n.y > height + 40) n.y = -40;
      }

      // Synapses
      ctx.lineWidth = 0.9;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK_DIST * LINK_DIST) continue;
          const d = Math.sqrt(d2);
          const fade = 1 - d / LINK_DIST;
          const tint = (a.y / height) * 0.85 + 0.08;
          ctx.strokeStyle = duotone(tint, fade * 0.26);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // Travelling impulses - the network thinking
      for (const s of signals) {
        const a = nodes[s.a];
        const b = nodes[s.b];
        if (!a || !b) continue;
        if (!prefersReduced) s.t += s.speed;
        if (s.t > 1) {
          s.t = 0;
          s.a = s.b;
          s.b = Math.floor(Math.random() * nodes.length);
        }
        const sx = a.x + (b.x - a.x) * s.t;
        const sy = a.y + (b.y - a.y) * s.t;
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 16);
        glow.addColorStop(0, "rgba(255,255,255,0.95)");
        glow.addColorStop(0.3, duotone(sy / height, 0.6));
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sx, sy, 16, 0, Math.PI * 2);
        ctx.fill();
      }

      // Node cores
      for (const n of nodes) {
        const tw = 0.55 + 0.45 * Math.sin(time * 1.6 + n.phase);
        const rr = n.r * (0.8 + tw * 0.6);
        ctx.fillStyle = duotone(n.y / height, 0.5 + tw * 0.45);
        ctx.beginPath();
        ctx.arc(n.x, n.y, rr, 0, Math.PI * 2);
        ctx.fill();
      }

      // The core igniting + expanding consciousness rings
      const coreR = 230 + pulse * 60;
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      core.addColorStop(0, "rgba(255,255,255," + (0.26 + pulse * 0.16) + ")");
      core.addColorStop(0.18, "rgba(255,45,149," + (0.2 + pulse * 0.1) + ")");
      core.addColorStop(0.55, "rgba(0,229,255,0.10)");
      core.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const t = (time * 0.22 + i / 3) % 1;
        const rad = t * Math.max(width, height) * 0.55;
        ctx.strokeStyle = "rgba(0,229,255," + (1 - t) * 0.26 + ")";
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,45,149," + (1 - t) * 0.18 + ")";
        ctx.beginPath();
        ctx.arc(cx, cy, rad * 0.82, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();

      /* ---- CRT SCANLINES + VIGNETTE ---- */
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "#000";
      for (let y = 0; y < height; y += 3) ctx.fillRect(0, y, width, 1);
      ctx.restore();

      const vig = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        Math.min(width, height) * 0.25,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.78
      );
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.72)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, width, height);

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
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
      {/* ---------------- GENERATED FIELD (pre-roll only, fades out under the clip) ---------------- */}
      <canvas
        ref={canvasRef}
        className={
          "absolute inset-0 w-full h-full pointer-events-none z-10 transition-opacity duration-700 " +
          (videoReady ? "opacity-0" : "opacity-100")
        }
      />

      {/* ---------------- THE HERO CLIP: full-bleed, ungraded, exactly as authored ---------------- */}
      {hasVideo && videoSrc && (
        <video
          key={videoSrc}
          className={
            "absolute inset-0 w-full h-full object-cover pointer-events-none z-[11] transition-opacity duration-700 " +
            (videoReady ? "opacity-100" : "opacity-0")
          }
          src={videoSrc}
          poster={hasPoster ? POSTER_SRC : undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onPlaying={markVideoReady}
          onCanPlay={markVideoReady}
          onError={() => {
            videoReadyRef.current = false;
            setVideoReady(false);
            setHasVideo(false);
          }}
        />
      )}

      {/* ---------------- LEGIBILITY SCRIMS ONLY (no colour grade over the footage) ---------------- */}
      <div className="absolute inset-x-0 top-0 h-32 z-[12] pointer-events-none bg-gradient-to-b from-black/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[60%] z-[12] pointer-events-none bg-gradient-to-t from-black/90 via-black/45 to-transparent" />

      {/* ---------------- SEAMLESS FULL-BLEED BOTTOM TRANSITION ---------------- */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none z-20" />

      {/* ---------------- TOP SUBTLE NAVIGATION BAR (ARTIFACT HUD) ---------------- */}
      <header className="absolute top-6 left-6 right-6 z-40 flex items-center justify-between text-xs font-mono uppercase tracking-widest text-zinc-400 pointer-events-auto">
        <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-xl">
          <span className="w-2 h-2 rounded-full bg-fuchsia-400 animate-pulse" />
          <span className="text-white font-bold tracking-wider">EVANS RWOTHOMIO</span>
          <span className="text-zinc-500">/</span>
          <span className="text-cyan-400 hidden sm:inline">
            {hasVideo ? "BIRTH OF A.I. [FOOTAGE]" : "BIRTH OF A.I. [GENERATED]"}
          </span>
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

      {/* ---------------- MASTER ARTIFACT TYPOGRAPHY ---------------- */}
      <div className="absolute left-6 sm:left-12 md:left-16 lg:left-24 bottom-16 sm:bottom-20 md:bottom-24 z-30 max-w-4xl pointer-events-auto">
        {/* Status Pill Badge */}
        <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-fuchsia-400/40 text-fuchsia-300 text-[11px] sm:text-xs font-mono uppercase tracking-widest mb-6 shadow-2xl">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
          <span>Birth of Artificial Intelligence</span>
        </div>

        {/* Cinematic Header */}
        <h1 className="font-extrabold text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-white uppercase tracking-tight leading-[0.95] drop-shadow-[0_6px_25px_rgba(0,0,0,0.95)] select-none">
          EXP<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-fuchsia-500">LO</span>RE<br />
          WHAT&apos;S<br />
          <span className="relative inline-block">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 via-rose-400 to-cyan-400">P</span>OSSIBLE
          </span>
        </h1>

        {/* Minimalist Subtitle */}
        <p className="mt-5 sm:mt-7 text-zinc-300 font-medium text-xs sm:text-sm md:text-base max-w-lg drop-shadow-lg leading-relaxed">
          A synthwave neural core igniting in real time. Move your cursor through the
          field to disturb the synapses and watch the network re-form.
        </p>

        {/* Call to Action Bar */}
        <div className="mt-7 flex flex-wrap items-center gap-4">
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
            <span className="hidden sm:inline">Neural field active</span>
            <span className="sm:hidden">Swipe the field</span>
          </div>
        </div>
      </div>

      {/* ---------------- BOTTOM RIGHT WATERMARK / HUD ---------------- */}
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

      {/* ---------------- FLOATING BOTTOM CENTER SCROLL INDICATOR ---------------- */}
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
