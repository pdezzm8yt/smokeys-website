/**
 * Things the sky draws once (and again on resize), never per frame: the star
 * field, split over three canvases that twinkle out of step (CSS opacity, on
 * the compositor), and the moon.
 */

/** Deterministic random numbers: the same sky on every visit, no flicker on resize. */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Size a canvas to its CSS box in device pixels, capped (stars are under 2 CSS px with soft halos: 1.5x is crisp). */
function fit(canvas: HTMLCanvasElement, maxDpr = 1.5) {
  const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return { w, h, dpr };
}

/**
 * Stars of many brightnesses (most faint, a few bright with a soft halo),
 * slightly warm or blue, thinning toward the horizon. Spread over the groups
 * round-robin so each group twinkles a third of them.
 */
export function paintStars(groups: HTMLCanvasElement[], count: number) {
  const rand = random(20251028);
  const contexts = groups.map((c) => ({ ...fit(c), ctx: c.getContext("2d") }));
  for (const { ctx, w, h } of contexts) ctx?.clearRect(0, 0, w, h);
  const tints = ["255,255,255", "255,255,255", "255,247,232", "226,236,255"];
  for (let i = 0; i < count; i++) {
    const g = contexts[i % contexts.length];
    if (!g?.ctx) continue;
    const x = rand() * g.w;
    // More stars high up: a squared distribution, thinning toward the horizon.
    const y = rand() ** 1.6 * g.h * 0.92;
    const b = rand() ** 3; // brightness: most faint
    const r = (0.45 + b * 1.1) * g.dpr;
    const alpha = 0.35 + b * 0.65;
    const tint = tints[Math.floor(rand() * tints.length)] ?? "255,255,255";
    if (b > 0.7) {
      const halo = g.ctx.createRadialGradient(x, y, 0, x, y, r * 5);
      halo.addColorStop(0, `rgba(${tint},${alpha * 0.35})`);
      halo.addColorStop(1, `rgba(${tint},0)`);
      g.ctx.fillStyle = halo;
      g.ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
    }
    g.ctx.fillStyle = `rgba(${tint},${alpha})`;
    g.ctx.beginPath();
    g.ctx.arc(x, y, r, 0, Math.PI * 2);
    g.ctx.fill();
  }
}

/**
 * A detailed moon: a pale disk darkening toward its limb, the dark "seas"
 * roughly where they sit on the real moon, scattered craters with lit rims,
 * fine grain. Drawn once at 2x.
 */
export function paintMoon(canvas: HTMLCanvasElement) {
  const { w } = fit(canvas, 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const r = w / 2;
  const rand = random(7);
  ctx.clearRect(0, 0, w, w);
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r * 0.98, 0, Math.PI * 2);
  ctx.clip();
  const base = ctx.createRadialGradient(r * 0.85, r * 0.8, r * 0.1, r, r, r);
  base.addColorStop(0, "#f4f1e8");
  base.addColorStop(0.7, "#ddd8ca");
  base.addColorStop(1, "#b9b3a3");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, w);
  // Maria (the dark seas), as soft blobs: [x, y, rx, ry] in units of the radius.
  const maria: [number, number, number, number][] = [
    [0.68, 0.62, 0.3, 0.24], // Imbrium
    [1.02, 0.66, 0.2, 0.17], // Serenitatis
    [1.18, 0.9, 0.22, 0.2], // Tranquillitatis
    [0.62, 1.05, 0.32, 0.36], // Procellarum
    [1.12, 1.25, 0.16, 0.14], // Nectaris
    [0.95, 1.2, 0.14, 0.12], // Nubium
    [1.38, 0.72, 0.1, 0.12], // Crisium
  ];
  for (const [mx, my, rx, ry] of maria) {
    const g = ctx.createRadialGradient(mx * r, my * r, 0, mx * r, my * r, Math.max(rx, ry) * r);
    g.addColorStop(0, "rgba(120,117,106,0.55)");
    g.addColorStop(0.7, "rgba(130,126,114,0.35)");
    g.addColorStop(1, "rgba(130,126,114,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(mx * r, my * r, rx * r, ry * r, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Craters: a darker floor, a lit rim on the side facing the light (upper left).
  for (let i = 0; i < 46; i++) {
    const cr = (0.015 + rand() ** 2 * 0.075) * r;
    const cx = rand() * w;
    const cy = rand() * w;
    ctx.fillStyle = "rgba(90,86,78,0.22)";
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,253,245,0.35)";
    ctx.lineWidth = Math.max(0.6, cr * 0.18);
    ctx.beginPath();
    ctx.arc(cx, cy, cr, Math.PI * 0.9, Math.PI * 1.7);
    ctx.stroke();
  }
  // Tycho: a bright young crater with rays.
  const tx = 0.86 * r;
  const ty = 1.62 * r;
  for (let i = 0; i < 12; i++) {
    const a = rand() * Math.PI * 2;
    ctx.strokeStyle = "rgba(255,255,250,0.12)";
    ctx.lineWidth = r * 0.012;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + Math.cos(a) * r * (0.3 + rand() * 0.5), ty + Math.sin(a) * r * (0.3 + rand() * 0.5));
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,250,0.7)";
  ctx.beginPath();
  ctx.arc(tx, ty, r * 0.035, 0, Math.PI * 2);
  ctx.fill();
  // Fine grain.
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rand() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(60,58,52,0.05)";
    ctx.fillRect(rand() * w, rand() * w, 1.2, 1.2);
  }
  // Limb darkening on top of everything.
  const limb = ctx.createRadialGradient(r, r, r * 0.55, r, r, r);
  limb.addColorStop(0, "rgba(0,0,0,0)");
  limb.addColorStop(1, "rgba(40,38,48,0.35)");
  ctx.fillStyle = limb;
  ctx.fillRect(0, 0, w, w);
  ctx.restore();
}
