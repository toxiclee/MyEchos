"use client";

import { useEffect, useMemo, useState } from "react";

const GRAIN_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

type Particle = {
  left: string;
  top: string;
  size: number;
  duration: number;
  delay: number;
  dx: string;
  dy: string;
  opacity: number;
};

export function LandingAtmosphere() {
  /** Decorative layers only run after mount so SSR HTML always matches first client paint (no hydration drift). */
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: 32 }, (_, i) => {
      const x = ((i * 47 + 13) % 100) / 100;
      const y = ((i * 61 + 29) % 100) / 100;
      return {
        left: `${8 + x * 84}%`,
        top: `${6 + y * 88}%`,
        size: 1 + (i % 3),
        duration: 52 + (i % 11) * 6,
        delay: -i * 1.4,
        dx: `${-20 + (i % 7) * 7}px`,
        dy: `${-35 - (i % 6) * 12}px`,
        opacity: 0.08 + (i % 5) * 0.035,
      };
    });
  }, []);

  if (!mounted) {
    return (
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[#f5efe8]" />
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {/* Cream base */}
      <div className="absolute inset-0 bg-[#f5efe8]" />

      {/* Slow drifting washes — peach, blush, warm paper */}
      <div className="landing-atmo-drift-a absolute top-[-15%] left-[-20%] h-[85%] w-[90%] rounded-[50%] bg-[radial-gradient(ellipse,rgba(232,200,180,0.55)_0%,transparent_62%)] blur-[2px] motion-reduce:animate-none" />
      <div className="landing-atmo-drift-b absolute right-[-25%] bottom-[-20%] h-[75%] w-[80%] rounded-[50%] bg-[radial-gradient(ellipse,rgba(220,200,230,0.22)_0%,transparent_58%)] blur-[3px] motion-reduce:animate-none" />
      <div className="landing-atmo-drift-c absolute top-[35%] left-[15%] h-[55%] w-[70%] rounded-[50%] bg-[radial-gradient(ellipse,rgba(212,184,150,0.28)_0%,transparent_55%)] blur-sm motion-reduce:animate-none" />

      {/* Soft bloom — daylight through linen */}
      <div className="absolute left-1/2 top-[18%] -translate-x-1/2">
        <div className="landing-atmo-bloom h-[min(85vw,560px)] w-[min(95vw,640px)] rounded-full bg-[radial-gradient(circle,rgba(255,236,220,0.75)_0%,rgba(245,220,200,0.28)_42%,transparent_68%)] blur-[80px] motion-reduce:animate-none motion-reduce:opacity-60" />
      </div>
      <div className="landing-atmo-bloom-soft absolute right-[8%] bottom-[12%] h-[40vmin] w-[40vmin] rounded-full bg-[radial-gradient(circle,rgba(230,200,210,0.2)_0%,transparent_70%)] blur-3xl motion-reduce:animate-none motion-reduce:opacity-50" />

      {/* Gentle vignette — depth without going dark */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_42%,transparent_0%,rgba(212,196,180,0.14)_72%,rgba(190,175,160,0.22)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[40%] bg-linear-to-t from-[#e8dfd4]/55 via-[#f5efe8]/12 to-transparent" />
      <div className="absolute inset-y-0 left-0 w-[32%] bg-linear-to-r from-[#ebe3d8]/35 to-transparent" />
      <div className="absolute inset-y-0 right-0 w-[32%] bg-linear-to-l from-[#ebe3d8]/35 to-transparent" />

      {/* Dust / memory motes */}
      <div className="absolute inset-0 motion-reduce:hidden">
        {particles.map((p, i) => (
          <span
            key={i}
            className="landing-atmo-particle absolute rounded-full bg-[#dcc8b8] shadow-[0_0_8px_rgba(255,248,240,0.65)]"
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              opacity: p.opacity,
              ["--landing-dx" as string]: p.dx,
              ["--landing-dy" as string]: p.dy,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Film grain — lighter on cream */}
      <div
        className="landing-atmo-grain absolute -inset-full opacity-[0.055] mix-blend-multiply motion-reduce:animate-none motion-reduce:opacity-[0.03]"
        style={{
          backgroundImage: GRAIN_SVG,
          backgroundRepeat: "repeat",
          backgroundSize: "220px 220px",
        }}
      />
    </div>
  );
}
