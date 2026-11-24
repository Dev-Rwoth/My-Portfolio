"use client";

import React, { useEffect, useRef } from "react";

/**
 * DECODING HEADLINE
 *
 * "Hii / I'm Evans. / Decoding ideas into software." - animated as the thing
 * it describes. The lines are never typed; they are DECRYPTED.
 *
 * Cycle (loops forever, ~9s):
 *   MATERIALISE  each cell cycles random cipher glyphs, rising out of blur
 *                with a hard cyan/magenta RGB split, locking top-left to
 *                bottom-right in a wave with a flash as it snaps. A scan bar
 *                sweeps the block and an underline draws beneath it.
 *   HOLD         settled, breathing glow, blinking caret. The word
 *                "Decoding" keeps quietly re-scrambling - the decode never
 *                finishes. Occasional whole-block glitch slice.
 *   DISSOLVE     cells fall back into cipher glyphs and lift away in a
 *                reverse wave, blur and split climbing as they go.
 *
 * Monospace is deliberate: with proportional type, swapping glyphs would
 * reflow the line on every frame.
 *
 * Everything animates by mutating DOM refs inside one rAF loop - no React
 * state per frame, so ~42 cells cost zero re-renders. Honours
 * prefers-reduced-motion and exposes the real sentence to assistive tech.
 */

type LineSpec = {
  text: string;
  className: string;
  /** [from, to) character range that never stops re-scrambling */
  live?: [number, number];
};

const LINES: LineSpec[] = [
  {
    text: "Hii",
    className:
      "font-mono font-semibold tracking-[0.35em] text-fuchsia-300 text-sm sm:text-base md:text-lg",
  },
  {
    text: "I'm Evans.",
    className:
      "font-mono font-bold tracking-tight text-white text-2xl sm:text-3xl md:text-4xl lg:text-5xl leading-[1.15] mt-2",
  },
  {
    text: "Decoding ideas into software.",
    className:
      "font-mono font-semibold tracking-tight text-cyan-200/90 text-base sm:text-xl md:text-2xl lg:text-3xl leading-[1.3] mt-1.5",
    live: [0, 8], // "Decoding"
  },
];

const FULL_TEXT = LINES.map((l) => l.text).join(" ");

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/\\|{}[]=+-_~^*#$%&@";

// One flat, stable list: index here === index in the ref array
const CHARS: { ch: string; live: boolean }[] = [];
const LINE_OFFSETS: number[] = [];
for (const line of LINES) {
  LINE_OFFSETS.push(CHARS.length);
  const chars = line.text.split("");
  for (let i = 0; i < chars.length; i++) {
    const live = !!line.live && i >= line.live[0] && i < line.live[1];
    CHARS.push({ ch: chars[i], live });
  }
}
const N = CHARS.length;

const STAGGER = 55;
const CHAR_IN = 520;
const SETTLE = 320;
const HOLD = 4200;
const OUT_STAGGER = 32;
const CHAR_OUT = 420;

const IN_DUR = N * STAGGER + CHAR_IN + SETTLE;
const OUT_START = IN_DUR + HOLD;
const CYCLE = OUT_START + N * OUT_STAGGER + CHAR_OUT;

const randGlyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

export default function DecodingHeadline() {
  const cellEls = useRef<(HTMLSpanElement | null)[]>([]);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const scanRef = useRef<HTMLDivElement | null>(null);
  const ruleRef = useRef<HTMLDivElement | null>(null);
  const caretRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const paint = (
      i: number,
      ch: string,
      opacity: number,
      ty: number,
      blur: number,
      split: number,
      bright: number
    ) => {
      const el = cellEls.current[i];
      if (!el) return;
      if (el.textContent !== ch) el.textContent = ch;
      el.style.opacity = String(opacity);
      el.style.transform = `translate3d(0,${ty}px,0)`;
      el.style.filter = blur > 0.02 ? `blur(${blur}px)` : "none";
      el.style.textShadow =
        split > 0.05
          ? `${-split}px 0 rgba(255,45,149,0.95), ${split}px 0 rgba(0,229,255,0.95), 0 0 ${
              10 + bright * 26
            }px rgba(120,230,255,${0.3 + bright * 0.5})`
          : "0 0 14px rgba(120,230,255,0.40)";
    };

    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      for (let i = 0; i < N; i++) {
        paint(i, CHARS[i].ch === " " ? " " : CHARS[i].ch, 1, 0, 0, 0, 0);
      }
      if (ruleRef.current) ruleRef.current.style.transform = "scaleX(1)";
      if (scanRef.current) scanRef.current.style.opacity = "0";
      if (caretRef.current) caretRef.current.style.opacity = "1";
      return;
    }

    let raf = 0;
    const start = performance.now();

    const render = (now: number) => {
      const t = (now - start) % CYCLE;

      // ---- rare, brief whole-block glitch slice ----
      if (wrapRef.current) {
        const g = Math.sin(t * 0.013) * Math.sin(t * 0.0071) * Math.sin(t * 0.0031);
        if (g > 0.955) {
          const sh = (Math.random() - 0.5) * 14;
          const top = Math.random() * 70;
          wrapRef.current.style.transform = `translate3d(${sh}px,0,0)`;
          wrapRef.current.style.clipPath = `polygon(0 0,100% 0,100% ${top}%,0 ${top}%,0 ${
            top + 8
          }%,100% ${top + 8}%,100% 100%,0 100%)`;
        } else {
          wrapRef.current.style.transform = "translate3d(0,0,0)";
          wrapRef.current.style.clipPath = "none";
        }
      }

      const inPhase = t < IN_DUR;
      const outPhase = t >= OUT_START;

      for (let i = 0; i < N; i++) {
        if (CHARS[i].ch === " ") {
          paint(i, " ", 1, 0, 0, 0, 0);
          continue;
        }

        if (inPhase) {
          const local = t - i * STAGGER;
          if (local <= 0) {
            paint(i, randGlyph(), 0, 16, 7, 6, 0);
          } else if (local < CHAR_IN) {
            const p = local / CHAR_IN;
            const e = 1 - Math.pow(1 - p, 3);
            const flick = Math.floor(local / 45);
            paint(
              i,
              GLYPHS[(flick * 7 + i * 13) % GLYPHS.length],
              e,
              16 * (1 - e),
              7 * (1 - e),
              6 * (1 - e),
              1 - e
            );
          } else {
            const since = local - CHAR_IN;
            const flash = Math.max(0, 1 - since / 260);
            paint(i, CHARS[i].ch, 1, 0, 0, 0.6 + flash * 2.4, flash);
          }
          continue;
        }

        if (outPhase) {
          const local = t - OUT_START - (N - 1 - i) * OUT_STAGGER;
          if (local <= 0) {
            paint(i, CHARS[i].ch, 1, 0, 0, 0.6, 0);
          } else if (local < CHAR_OUT) {
            const p = local / CHAR_OUT;
            paint(
              i,
              GLYPHS[(Math.floor(local / 40) * 5 + i * 11) % GLYPHS.length],
              1 - p,
              -18 * p,
              9 * p,
              7 * p,
              p * 0.6
            );
          } else {
            paint(i, " ", 0, -18, 9, 0, 0);
          }
          continue;
        }

        // ---- HOLD: "Decoding" never settles; the rest breathes ----
        if (CHARS[i].live) {
          const seed =
            Math.sin((t + i * 311) * 0.004) * Math.sin((t + i * 97) * 0.011);
          if (seed > 0.86) {
            paint(i, randGlyph(), 1, 0, 0, 2.2, 0.55);
            continue;
          }
        }
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.0022 + i * 0.25);
        paint(i, CHARS[i].ch, 1, 0, 0, 0.6, pulse * 0.22);
      }

      // ---- scan bar sweeps while the block resolves ----
      if (scanRef.current) {
        if (inPhase) {
          const p = t / IN_DUR;
          scanRef.current.style.opacity = String(0.9 * (1 - Math.abs(p * 2 - 1)));
          scanRef.current.style.transform = `translate3d(0,${p * 100}%,0)`;
        } else {
          scanRef.current.style.opacity = "0";
        }
      }

      // ---- underline draws in, retracts on the way out ----
      if (ruleRef.current) {
        let s: number;
        let origin: string;
        if (inPhase) {
          s = Math.min(1, t / (IN_DUR * 0.82));
          origin = "left";
        } else if (outPhase) {
          s = Math.max(0, 1 - (t - OUT_START) / (CYCLE - OUT_START));
          origin = "right";
        } else {
          s = 1;
          origin = "left";
        }
        ruleRef.current.style.transformOrigin = origin;
        ruleRef.current.style.transform = `scaleX(${s})`;
      }

      // ---- caret blinks only while settled ----
      if (caretRef.current) {
        const on = !inPhase && !outPhase && Math.floor(t / 480) % 2 === 0;
        caretRef.current.style.opacity = on ? "1" : "0.05";
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  const cell = (globalIndex: number) => (
    <span
      key={globalIndex}
      ref={(el) => {
        cellEls.current[globalIndex] = el;
      }}
      className="inline-block text-center will-change-transform"
      style={{ width: "1ch", opacity: 0 }}
    >
      {" "}
    </span>
  );

  return (
    <div className="relative">
      {/* The real sentence, for assistive tech and search engines */}
      <h1 className="sr-only">{FULL_TEXT}</h1>

      <div ref={wrapRef} aria-hidden="true" className="relative will-change-transform">
        <div
          ref={scanRef}
          className="pointer-events-none absolute left-0 right-0 top-0 h-[2px] opacity-0"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(0,229,255,0.95) 20%, rgba(255,255,255,0.95) 50%, rgba(255,45,149,0.95) 80%, transparent)",
            boxShadow: "0 0 18px rgba(0,229,255,0.85)",
          }}
        />

        {LINES.map((line, li) => (
          <div key={li} className={line.className}>
            {line.text.split("").map((_, i) => cell(LINE_OFFSETS[li] + i))}
            {li === LINES.length - 1 && (
              <span
                ref={caretRef}
                className="ml-1 inline-block align-middle bg-cyan-300"
                style={{
                  width: "0.55ch",
                  height: "1em",
                  boxShadow: "0 0 14px rgba(0,229,255,0.9)",
                }}
              />
            )}
          </div>
        ))}

        <div className="relative mt-4 h-px w-full max-w-[34ch]">
          <div
            ref={ruleRef}
            className="h-px w-full origin-left"
            style={{
              transform: "scaleX(0)",
              background:
                "linear-gradient(90deg, rgba(0,229,255,0.9), rgba(255,45,149,0.75), transparent)",
              boxShadow: "0 0 12px rgba(0,229,255,0.55)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
