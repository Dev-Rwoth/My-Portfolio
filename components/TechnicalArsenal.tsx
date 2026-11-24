"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Atom } from "lucide-react";

/**
 * TECHNICAL ARSENAL - full-bleed orbital galaxy.
 *
 * The old layout put a filter bar, an inspector strip and a 28-chip grid in a
 * left column beside a small radar. All of that is gone. The names are now
 * carried BY the galaxy itself:
 *
 *   - A focus travels the orbit on its own, one technology every 2.2s. The
 *     focused node lifts, glows and unfurls its name on a label that stays
 *     upright while the ring keeps turning.
 *   - The core reads out the focused technology and its domain, so the whole
 *     stack announces itself over one slow pass instead of sitting in a list.
 *   - A resonance ring springs from the core out to whichever orbit holds the
 *     focused node, linking centre to node.
 *   - Hovering any node seizes focus and pauses the orbits (pause-on-hover),
 *     so it can still be read deliberately rather than only watched.
 *
 * The section breaks out of the page's padded container (left-1/2 / w-screen)
 * so the wheel fills the viewport edge to edge.
 */

interface SkillItem {
  name: string;
  category: "Languages" | "Frameworks" | "AI & Tools" | "Cloud & Data" | "Tools & Systems";
  icon: string;
  ring: 1 | 2 | 3;
  angle: number;
}

const ALL_SKILLS: SkillItem[] = [
  // Ring 1 - core foundations
  { name: "TypeScript", category: "Languages", icon: "https://cdn.simpleicons.org/typescript/3178C6", ring: 1, angle: 0 },
  { name: "React", category: "Frameworks", icon: "https://cdn.simpleicons.org/react/61DAFB", ring: 1, angle: 90 },
  { name: "Python", category: "Languages", icon: "https://cdn.simpleicons.org/python/3776AB", ring: 1, angle: 180 },
  { name: "Next.js", category: "Frameworks", icon: "https://cdn.simpleicons.org/nextdotjs/white", ring: 1, angle: 270 },

  // Ring 2
  { name: "JavaScript", category: "Languages", icon: "https://cdn.simpleicons.org/javascript/F7DF1E", ring: 2, angle: 25 },
  { name: "FastAPI", category: "Frameworks", icon: "https://cdn.simpleicons.org/fastapi/009688", ring: 2, angle: 70 },
  { name: "Tailwind CSS", category: "Frameworks", icon: "https://cdn.simpleicons.org/tailwindcss/06B6D4", ring: 2, angle: 115 },
  { name: "Supabase", category: "Cloud & Data", icon: "https://cdn.simpleicons.org/supabase/3FCF8E", ring: 2, angle: 160 },
  { name: "Node.js", category: "Frameworks", icon: "https://cdn.simpleicons.org/nodedotjs/5FA04E", ring: 2, angle: 205 },
  { name: "SQL", category: "Languages", icon: "https://cdn.simpleicons.org/mysql/4479A1", ring: 2, angle: 250 },
  { name: "Claude AI", category: "AI & Tools", icon: "https://cdn.simpleicons.org/anthropic/CC9B7A", ring: 2, angle: 295 },
  { name: "Git", category: "Tools & Systems", icon: "https://cdn.simpleicons.org/git/F05032", ring: 2, angle: 340 },

  // Ring 3
  { name: "Google Antigravity", category: "AI & Tools", icon: "https://cdn.simpleicons.org/google/4285F4", ring: 3, angle: 0 },
  { name: "C", category: "Languages", icon: "https://cdn.simpleicons.org/c/A8B9CC", ring: 3, angle: 22.5 },
  { name: "Gemini API", category: "AI & Tools", icon: "https://cdn.simpleicons.org/googlegemini/8E75B2", ring: 3, angle: 45 },
  { name: "HTML5", category: "Languages", icon: "https://cdn.simpleicons.org/html5/E34F26", ring: 3, angle: 67.5 },
  { name: "CSS3", category: "Languages", icon: "https://cdn.simpleicons.org/css/1572B6", ring: 3, angle: 90 },
  { name: "LangChain", category: "AI & Tools", icon: "https://cdn.simpleicons.org/langchain/1C3C3C", ring: 3, angle: 112.5 },
  { name: "Huawei Cloud", category: "Cloud & Data", icon: "https://cdn.simpleicons.org/huawei/FF0000", ring: 3, angle: 135 },
  { name: "Vercel", category: "Cloud & Data", icon: "https://cdn.simpleicons.org/vercel/white", ring: 3, angle: 157.5 },
  { name: "MySQL", category: "Cloud & Data", icon: "https://cdn.simpleicons.org/mysql/4479A1", ring: 3, angle: 180 },
  { name: "MiniPay / Web3", category: "Cloud & Data", icon: "https://cdn.simpleicons.org/ethereum/3C3C3D", ring: 3, angle: 202.5 },
  { name: "VS Code", category: "Tools & Systems", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vscode/vscode-original.svg", ring: 3, angle: 225 },
  { name: "GitHub", category: "Tools & Systems", icon: "https://cdn.simpleicons.org/github/white", ring: 3, angle: 247.5 },
  { name: "Figma", category: "Tools & Systems", icon: "https://cdn.simpleicons.org/figma/F24E1E", ring: 3, angle: 270 },
  { name: "Draw.io", category: "Tools & Systems", icon: "https://cdn.simpleicons.org/diagramsdotnet/F08705", ring: 3, angle: 292.5 },
  { name: "MySQL Workbench", category: "Tools & Systems", icon: "https://cdn.simpleicons.org/mysql/4479A1", ring: 3, angle: 315 },
  { name: "SAD / DFD & ERD", category: "Tools & Systems", icon: "https://cdn.simpleicons.org/diagramsdotnet/F08705", ring: 3, angle: 337.5 },
];

const RING_CONFIG = {
  1: {
    size: "32%",
    ringClass: "orbit-ring-1",
    counterClass: "orbit-counter-1",
    border: "border-cyan-500/25",
    glow: "border-cyan-400 bg-cyan-500/20 shadow-cyan-500/40",
    label: "text-cyan-200 border-cyan-400/40",
    node: "w-11 h-11 sm:w-13 sm:h-13 md:w-16 md:h-16",
    img: "w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7",
  },
  2: {
    size: "62%",
    ringClass: "orbit-ring-2",
    counterClass: "orbit-counter-2",
    border: "border-blue-500/20",
    glow: "border-blue-400 bg-blue-500/20 shadow-blue-500/40",
    label: "text-blue-200 border-blue-400/40",
    node: "w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14",
    img: "w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6",
  },
  3: {
    size: "92%",
    ringClass: "orbit-ring-3",
    counterClass: "orbit-counter-3",
    border: "border-purple-500/20 border-dashed",
    glow: "border-purple-400 bg-purple-500/20 shadow-purple-500/40",
    label: "text-purple-200 border-purple-400/40",
    node: "w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12",
    img: "w-4 h-4 sm:w-5 sm:h-5",
  },
} as const;

const DWELL_MS = 2200;

export default function TechnicalArsenal() {
  const [cursor, setCursor] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);

  // The focus walks the galaxy on its own; hovering takes the wheel.
  useEffect(() => {
    if (hovered) return;
    const id = window.setInterval(
      () => setCursor((c) => (c + 1) % ALL_SKILLS.length),
      DWELL_MS
    );
    return () => window.clearInterval(id);
  }, [hovered]);

  const focused = useMemo(
    () => ALL_SKILLS.find((s) => s.name === hovered) ?? ALL_SKILLS[cursor],
    [hovered, cursor]
  );

  const renderRing = (ring: 1 | 2 | 3) => {
    const cfg = RING_CONFIG[ring];
    return (
      <div
        className={`absolute rounded-full border ${cfg.border} ${cfg.ringClass} pointer-events-none`}
        style={{ width: cfg.size, height: cfg.size }}
      >
        {ALL_SKILLS.filter((s) => s.ring === ring).map((skill) => {
          const rad = (skill.angle * Math.PI) / 180;
          const left = 50 + 50 * Math.cos(rad);
          const top = 50 + 50 * Math.sin(rad);
          const isFocused = focused.name === skill.name;

          return (
            <div
              key={skill.name}
              style={{ left: `${left}%`, top: `${top}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
            >
              {/* counter-rotation keeps the node and its label upright */}
              <div className={cfg.counterClass}>
                <div className="relative flex flex-col items-center">
                  <div
                    onMouseEnter={() => setHovered(skill.name)}
                    onMouseLeave={() => setHovered(null)}
                    className={`relative rounded-2xl glass-card flex items-center justify-center p-2 border transition-all duration-500 cursor-pointer ${cfg.node} ${
                      isFocused
                        ? `${cfg.glow} scale-125 shadow-xl z-30`
                        : "border-white/10 bg-zinc-900/80 hover:border-white/40 hover:scale-110 opacity-70"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={skill.icon}
                      alt={skill.name}
                      className={`${cfg.img} object-contain`}
                      loading="lazy"
                    />
                  </div>

                  {/* the name travels with the node */}
                  <span
                    className={`absolute top-full mt-2 whitespace-nowrap rounded-md border bg-zinc-950/90 px-2 py-0.5 text-[10px] sm:text-[11px] font-mono backdrop-blur-sm transition-all duration-500 ${cfg.label} ${
                      isFocused
                        ? "opacity-100 translate-y-0"
                        : "opacity-0 -translate-y-1 pointer-events-none"
                    }`}
                  >
                    {skill.name}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section
      id="skills"
      className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden min-h-screen flex flex-col items-center justify-center py-16"
    >
      {/* ambient depth */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-[1100px] max-h-[1100px] rounded-full bg-gradient-to-b from-purple-600/12 via-cyan-500/8 to-transparent blur-3xl pointer-events-none" />

      <h2 className="relative z-10 text-center text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight text-white">
        Technical{" "}
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500">
          Arsenal
        </span>
      </h2>

      {/* ---------------- THE GALAXY ---------------- */}
      <div className="relative z-10 mt-6 flex items-center justify-center pause-on-hover">
        <div
          className="relative flex items-center justify-center"
          style={{ width: "min(94vw, 78vh)", height: "min(94vw, 78vh)" }}
        >
          {/* crosshairs */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-full h-px bg-gradient-to-r from-transparent via-cyan-500/15 to-transparent" />
            <div className="absolute h-full w-px bg-gradient-to-b from-transparent via-cyan-500/15 to-transparent" />
          </div>

          {/* resonance ring: springs from the core out to the focused orbit */}
          <div
            key={focused.name}
            className="absolute rounded-full border border-cyan-400/40 resonance pointer-events-none"
            style={{
              width: RING_CONFIG[focused.ring].size,
              height: RING_CONFIG[focused.ring].size,
            }}
          />

          {renderRing(3)}
          {renderRing(2)}
          {renderRing(1)}

          {/* ---------------- CORE READOUT ---------------- */}
          <div className="relative z-20 flex flex-col items-center justify-center text-center pointer-events-none px-4">
            <div className="absolute w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-cyan-500/15 blur-2xl" />
            <Atom className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-400/80 mb-3" />
            <div key={focused.name} className="core-swap">
              <div className="text-white font-bold tracking-tight text-lg sm:text-2xl md:text-3xl max-w-[9ch] sm:max-w-none leading-tight">
                {focused.name}
              </div>
              <div className="mt-1.5 text-[10px] sm:text-xs font-mono uppercase tracking-[0.25em] text-cyan-400/90">
                {focused.category}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
