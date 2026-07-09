/**
 * 文件：src/lib/fireworks.ts
 * 职责：轻量烟花动效。在屏幕顶层渲染一块 pointer-events:none 的 canvas，
 *       动画持续 durationMs（默认 1000ms）后自动停止并清理，避免 DOM/CPU 泄漏。
 *       调用即发即忘，可在按钮 onClick 中直接触发。
 * 依赖：无（仅依赖浏览器 canvas / rAF）
 * 导出：triggerFireworks
 */

/**
 * Lightweight firework burst effect.
 *
 * Renders a full-screen, pointer-events-none canvas overlay and animates a few
 * firework shells that explode into fading particles. The animation runs for
 * `durationMs` (default 1000ms) and then stops — cancelling the rAF loop and
 * removing the canvas so it never leaks DOM nodes or keeps the CPU busy.
 *
 * It is fire-and-forget: callers can invoke it inside a button's onClick
 * without awaiting; the original handler keeps running normally.
 */

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

const PALETTE = [
  'oklch(0.7 0.17 255)', // blue
  'oklch(0.75 0.16 195)', // cyan
  'oklch(0.78 0.16 142)', // green
  'oklch(0.78 0.15 95)', // yellow
  'oklch(0.72 0.17 25)', // red
  'oklch(0.7 0.16 285)', // purple
  'oklch(0.82 0.13 60)', // amber
];

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export const triggerFireworks = (durationMs = 1000): void => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (typeof requestAnimationFrame === 'undefined') return;

  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;

  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;';

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(dpr, dpr);
  document.body.appendChild(canvas);

  const particles: Particle[] = [];
  // Burst launch times as fractions of the total duration.
  const burstFractions = [0.08, 0.3, 0.52, 0.74];
  let nextBurst = 0;

  const spawnBurst = (x: number, y: number) => {
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const count = Math.floor(rand(56, 88));
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + rand(-0.15, 0.15);
      const speed = rand(2.2, 6);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: rand(650, 1150),
        color,
        size: rand(1.4, 3),
      });
    }
  };

  const start = performance.now();
  let rafId = 0;

  const tick = (now: number) => {
    const elapsed = now - start;

    while (nextBurst < burstFractions.length && elapsed >= burstFractions[nextBurst] * durationMs) {
      spawnBurst(w * rand(0.2, 0.8), h * rand(0.18, 0.5));
      nextBurst++;
    }

    ctx.clearRect(0, 0, w, h);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += 16;
      p.vy += 0.05; // gravity
      p.vx *= 0.99;
      p.vy *= 0.99;
      p.x += p.vx;
      p.y += p.vy;

      const t = p.life / p.maxLife;
      if (t >= 1) {
        particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (elapsed < durationMs) {
      rafId = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(rafId);
      canvas.remove();
    }
  };

  rafId = requestAnimationFrame(tick);
};
