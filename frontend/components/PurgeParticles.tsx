"use client";

import React, { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export const PurgeParticles = ({ active }: { active: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const requestRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Resize
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    // Explosion Origin (Center of screen effectively, or random)
    // Let's spawn them from the bottom center (Reactor Core location)
    const spawnParticles = () => {
        for (let i = 0; i < 100; i++) {
            particles.current.push({
                x: window.innerWidth / 2,
                y: window.innerHeight - 100, // Near bottom
                vx: (Math.random() - 0.5) * 15,
                vy: (Math.random() - 1) * 20 - 5, // Upward burst
                life: 1.0,
                color: Math.random() > 0.5 ? "#00FF9D" : "#E6007A", // Polkadot Pink + Success Green
                size: Math.random() * 4 + 1
            });
        }
    };

    spawnParticles();

    const animate = () => {
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.current.forEach((p, index) => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.5; // Gravity
            p.life -= 0.01;
            p.size *= 0.95;

            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();

            if (p.life <= 0) {
                particles.current.splice(index, 1);
            }
        });

        if (particles.current.length > 0) {
            requestRef.current = requestAnimationFrame(animate);
        }
    };

    animate();

    return () => {
        window.removeEventListener("resize", resize);
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
    />
  );
};
