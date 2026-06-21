"use client";
import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  z: number;
  origX: number;
  origY: number;
  origZ: number;
  text?: string;
  color: string;
}

const LANGUAGES = ["EN", "ES", "FR", "ZH", "JP", "RU", "DE", "IT", "KO", "TR", "UZ", "AR", "PT", "HI", "SV"];

export default function Interactive3DBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollYRef = useRef(0);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Track scroll
    const handleScroll = () => {
      scrollYRef.current = window.scrollY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });

    // Track mouse
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.targetX = (e.clientX - width / 2) * 0.1;
      mouseRef.current.targetY = (e.clientY - height / 2) * 0.1;
    };
    window.addEventListener("mousemove", handleMouseMove);

    // Handle resize
    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Initialize 3D particles on a sphere surface (globe)
    const particles: Particle[] = [];
    const numParticles = 160;
    const sphereRadius = 260;

    for (let i = 0; i < numParticles; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      
      const x = sphereRadius * Math.sin(phi) * Math.cos(theta);
      const y = sphereRadius * Math.sin(phi) * Math.sin(theta);
      const z = sphereRadius * Math.cos(phi);

      const isText = i < LANGUAGES.length * 2;
      const text = isText ? LANGUAGES[i % LANGUAGES.length] : undefined;
      const color = isText ? "var(--accent)" : "var(--primary-light)";

      particles.push({
        x,
        y,
        z,
        origX: x,
        origY: y,
        origZ: z,
        text,
        color,
      });
    }

    let angleX = 0.002;
    let angleY = 0.003;
    const focalLength = 400;

    // Animation Loop
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Smooth scroll parallax and zoom
      const scrollVal = scrollYRef.current;
      const zoom = Math.max(0.3, 1 - scrollVal * 0.0008);
      const zoomRadiusOffset = scrollVal * 0.25;

      // Smooth mouse interpolation
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.05;

      // Dynamically adjust rotation speed on scroll
      const rotSpeedModifier = 1 + scrollVal * 0.005;
      const currentAngleX = angleX * rotSpeedModifier;
      const currentAngleY = angleY * rotSpeedModifier;

      const cosX = Math.cos(currentAngleX);
      const sinX = Math.sin(currentAngleX);
      const cosY = Math.cos(currentAngleY);
      const sinY = Math.sin(currentAngleY);

      // Map rotated and projected coordinates
      const projected: { px: number; py: number; pz: number; part: Particle }[] = [];

      particles.forEach((p) => {
        // Rotate around Y (horizontal)
        let x1 = p.x * cosY - p.z * sinY;
        let z1 = p.z * cosY + p.x * sinY;

        // Rotate around X (vertical)
        let y1 = p.y * cosX - z1 * sinX;
        let z2 = z1 * cosX + p.y * sinX;

        // Save rotated state
        p.x = x1;
        p.y = y1;
        p.z = z2;

        // Apply scroll-zoom and scroll-spread
        const rx = x1 * zoom + mouseRef.current.x;
        const ry = y1 * zoom + mouseRef.current.y;
        const rz = z2 * zoom - (scrollVal * 0.4); // Push back on scroll

        // Translate and project
        const sz = rz + focalLength + 100;
        if (sz > 0) {
          const scale = focalLength / sz;
          const px = rx * scale + width / 2;
          const py = ry * scale + height / 2;
          projected.push({ px, py, pz: sz, part: p });
        }
      });

      // Sort by depth (back to front) for correct rendering
      projected.sort((a, b) => b.pz - a.pz);

      // Draw connection lines for close nodes (constellations)
      ctx.lineWidth = 0.5;
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const nodeA = projected[i];
          const nodeB = projected[j];
          
          // Connect nodes that are close to each other
          const dx = nodeA.px - nodeB.px;
          const dy = nodeA.py - nodeB.py;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 80 && !nodeA.part.text && !nodeB.part.text) {
            const alpha = (1 - dist / 80) * 0.15 * (zoom * 0.8);
            ctx.strokeStyle = `rgba(96, 165, 250, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(nodeA.px, nodeA.py);
            ctx.lineTo(nodeB.px, nodeB.py);
            ctx.stroke();
          }
        }
      }

      // Draw particles (nodes / language labels)
      projected.forEach(({ px, py, pz, part }) => {
        const size = (6 / (pz / 200)) * zoom;
        if (size <= 0) return;

        if (part.text) {
          // Render language code node
          ctx.font = `bold ${Math.max(10, 14 * zoom)}px var(--font)`;
          ctx.fillStyle = part.color;
          ctx.shadowColor = "rgba(16, 185, 129, 0.4)";
          ctx.shadowBlur = 8;
          ctx.fillText(part.text, px - 8, py + 4);
          ctx.shadowBlur = 0; // Reset
        } else {
          // Render simple constellation star
          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.fillStyle = part.color;
          ctx.fill();
        }
      });

      // Draw subtle orbital rings
      ctx.strokeStyle = "rgba(59, 130, 246, 0.03)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(width / 2 + mouseRef.current.x, height / 2 + mouseRef.current.y, sphereRadius * zoom, 0, Math.PI * 2);
      ctx.stroke();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: -1,
        opacity: 0.85,
      }}
    />
  );
}
