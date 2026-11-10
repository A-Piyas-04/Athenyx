const BRAND_MARK =
  '<svg viewBox="0 0 28 28"><rect x="1" y="1" width="26" height="26" rx="5" fill="#412201" stroke="#1a1206" stroke-width="1.5"/><rect x="6" y="7" width="16" height="3.4" rx="0.8" fill="#FFD60A"/><rect x="6" y="12.3" width="11.5" height="3.4" rx="0.8" fill="#E1C802"/><rect x="6" y="17.6" width="7" height="3.4" rx="0.8" fill="#A28900"/></svg>';

document.querySelectorAll("[data-brand]").forEach((el) => {
  el.innerHTML = BRAND_MARK + "<span>Athenyx</span>";
});

function seeded(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scatters confetti inside the given rectangles ([x, y, w, h] in CSS px). */
function confetti({ seed = 1, count = 40, zones, colors }) {
  const rand = seeded(seed);
  const palette = colors || ["#ff7b5c", "#7cc8ff", "#8ee6b9", "#c4a8ff", "#ff9ec7", "#ffffff", "#1a1206"];
  const shapes = ["dot", "rect", "squiggle", "star", "ring"];
  for (let i = 0; i < count; i++) {
    const [zx, zy, zw, zh] = zones[Math.floor(rand() * zones.length)];
    const x = zx + rand() * zw;
    const y = zy + rand() * zh;
    const c = palette[Math.floor(rand() * palette.length)];
    const shape = shapes[Math.floor(rand() * shapes.length)];
    const rot = Math.floor(rand() * 360);
    const s = 10 + rand() * 14;
    const el = document.createElement("div");
    el.className = "confetti";
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.transform = `rotate(${rot}deg)`;
    const stroke = c === "#1a1206" ? "#1a1206" : "#1a1206";
    if (shape === "dot") el.innerHTML = `<svg width="${s}" height="${s}" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="${c}" stroke="${stroke}" stroke-width="1.6"/></svg>`;
    if (shape === "rect") el.innerHTML = `<svg width="${s * 1.4}" height="${s * 0.7}" viewBox="0 0 14 7"><rect x="1" y="1" width="12" height="5" rx="1.2" fill="${c}" stroke="${stroke}" stroke-width="1.4"/></svg>`;
    if (shape === "squiggle") el.innerHTML = `<svg width="${s * 1.8}" height="${s}" viewBox="0 0 18 10"><path d="M1 5 Q4 0 7 5 T13 5 T17 5" fill="none" stroke="${c === "#ffffff" ? "#1a1206" : c}" stroke-width="2.6" stroke-linecap="round"/></svg>`;
    if (shape === "star") el.innerHTML = `<svg width="${s * 1.3}" height="${s * 1.3}" viewBox="0 0 20 20"><path d="M10 1 L12.4 7.6 L19 10 L12.4 12.4 L10 19 L7.6 12.4 L1 10 L7.6 7.6 Z" fill="${c}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    if (shape === "ring") el.innerHTML = `<svg width="${s}" height="${s}" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3.4" fill="none" stroke="${c === "#ffffff" ? "#1a1206" : c}" stroke-width="2.2"/></svg>`;
    document.body.appendChild(el);
  }
}
