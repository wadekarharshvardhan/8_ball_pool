// Procedural Custom 3D Pool Ball Texture Generator
import { SOLID_COLORS, BallKind } from "./poolPhysics";

export type BallThemeId = "tournament" | "neon" | "dragon" | "luxury";

export interface BallTheme {
  id: BallThemeId;
  name: string;
  description: string;
  previewColor: string;
}

export const BALL_THEMES: BallTheme[] = [
  { id: "tournament", name: "Pro Tournament Gloss", description: "Lustrous high-gloss resin with gold-rimmed badges", previewColor: "#2563eb" },
  { id: "neon", name: "Cyber Neon Glow", description: "Futuristic dark obsidian balls with electric neon stripes", previewColor: "#06b6d4" },
  { id: "dragon", name: "Fire & Ice Elemental", description: "Magma flame solids and arctic frost stripes", previewColor: "#ef4444" },
  { id: "luxury", name: "Royal Gold Marble", description: "Polished gold leaf badges with luxury marble textures", previewColor: "#eab308" },
];

const LUXURY_COLORS: Record<number, string> = {
  1: "#d97706", // Amber Gold
  2: "#1d4ed8", // Royal Sapphire
  3: "#b91c1c", // Deep Ruby
  4: "#6d28d9", // Imperial Amethyst
  5: "#c2410c", // Burnt Topaz
  6: "#047857", // Emerald Green
  7: "#78350f", // Tiger Eye Brown
};

const NEON_COLORS: Record<number, string> = {
  1: "#facc15", // Electric Yellow
  2: "#38bdf8", // Cyber Cyan
  3: "#f43f5e", // Neon Pink
  4: "#a855f7", // Electric Purple
  5: "#fb923c", // Neon Orange
  6: "#4ade80", // Neon Green
  7: "#ec4899", // Magenta
};

// Generate custom ball texture on an offscreen canvas
export function renderCustomBallSprite(
  number: number,
  kind: BallKind,
  themeId: BallThemeId,
  size = 256
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const radius = size / 2;
  const center = size / 2;

  // 1. Circular Masking
  ctx.beginPath();
  ctx.arc(center, center, radius - 1, 0, Math.PI * 2);
  ctx.clip();

  if (themeId === "neon") {
    // --- CYBER NEON THEME ---
    const baseColor = number === 0 ? "#0f172a" : NEON_COLORS[number <= 7 ? number : number - 8] || "#38bdf8";

    // Dark obsidian background
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, size, size);

    if (kind === "stripe") {
      // Glowing Neon Waist Stripe
      ctx.fillStyle = baseColor;
      ctx.shadowColor = baseColor;
      ctx.shadowBlur = 12;
      ctx.fillRect(0, size * 0.28, size, size * 0.44);
      ctx.shadowBlur = 0;
    } else if (kind === "solid") {
      // Neon Outer Glow Ring
      ctx.strokeStyle = baseColor;
      ctx.shadowColor = baseColor;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(center, center, radius - 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Number Badge
    if (number !== 0) {
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(center, center, radius * 0.46, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = baseColor;
      ctx.shadowColor = baseColor;
      ctx.shadowBlur = 8;
      ctx.font = `bold ${Math.round(size * 0.34)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(number), center, center + 1);
      ctx.shadowBlur = 0;
    } else {
      // Cyber Cue Ball Target Reticle
      ctx.strokeStyle = "#38bdf8";
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 8;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(center, center, radius * 0.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  } else if (themeId === "luxury") {
    // --- ROYAL GOLD MARBLE THEME ---
    const primaryColor = number === 0 ? "#f8fafc" : number === 8 ? "#090d16" : LUXURY_COLORS[number <= 7 ? number : number - 8] || "#d97706";

    // Marble texture background
    const bgGrad = ctx.createRadialGradient(center * 0.6, center * 0.6, 2, center, center, radius);
    bgGrad.addColorStop(0, "#ffffff");
    bgGrad.addColorStop(0.3, primaryColor);
    bgGrad.addColorStop(1, "#020617");

    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, size, size);

    if (kind === "stripe") {
      // Pearl white stripe
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, size * 0.28, size, size * 0.44);

      ctx.fillStyle = primaryColor;
      ctx.fillRect(0, size * 0.34, size, size * 0.32);
    }

    if (number !== 0) {
      // Gold Foil Badge Ring
      const goldGrad = ctx.createLinearGradient(0, 0, size, size);
      goldGrad.addColorStop(0, "#fef08a");
      goldGrad.addColorStop(0.5, "#eab308");
      goldGrad.addColorStop(1, "#854d0e");

      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(center, center, radius * 0.46, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = goldGrad;
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = goldGrad;
      ctx.font = `bold ${Math.round(size * 0.34)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(number), center, center + 1);
    }
  } else if (themeId === "dragon") {
    // --- FIRE & ICE ELEMENTAL THEME ---
    if (kind === "stripe") {
      // Arctic Frost Ice Stripe
      const iceGrad = ctx.createLinearGradient(0, 0, size, size);
      iceGrad.addColorStop(0, "#083344");
      iceGrad.addColorStop(0.5, "#06b6d4");
      iceGrad.addColorStop(1, "#e0f2fe");

      ctx.fillStyle = "#030712";
      ctx.fillRect(0, 0, size, size);

      ctx.fillStyle = iceGrad;
      ctx.fillRect(0, size * 0.28, size, size * 0.44);
    } else {
      // Fire Magma Flame
      const fireGrad = ctx.createRadialGradient(center * 0.5, center * 0.5, 4, center, center, radius);
      fireGrad.addColorStop(0, "#fef08a");
      fireGrad.addColorStop(0.3, "#f97316");
      fireGrad.addColorStop(0.7, "#dc2626");
      fireGrad.addColorStop(1, "#450a0a");

      ctx.fillStyle = number === 0 ? "#fff1f2" : number === 8 ? "#090d16" : fireGrad;
      ctx.fillRect(0, 0, size, size);
    }

    if (number !== 0) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(center, center, radius * 0.45, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#0f172a";
      ctx.font = `bold ${Math.round(size * 0.34)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(number), center, center + 1);
    }
  } else {
    // --- PRO TOURNAMENT GLOSS (DEFAULT) ---
    const ballColor = number === 0 ? "#f8fafc" : number === 8 ? "#0f172a" : SOLID_COLORS[number <= 7 ? number : number - 8] || "#2563eb";

    ctx.fillStyle = kind === "stripe" ? "#ffffff" : ballColor;
    ctx.fillRect(0, 0, size, size);

    if (kind === "stripe") {
      ctx.fillStyle = ballColor;
      ctx.fillRect(0, size * 0.28, size, size * 0.44);
    }

    if (number !== 0) {
      // Gold-rimmed badge
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(center, center, radius * 0.46, 0, Math.PI * 2);
      ctx.fill();

      const goldBorder = ctx.createLinearGradient(0, 0, size, size);
      goldBorder.addColorStop(0, "#fef08a");
      goldBorder.addColorStop(0.5, "#d97706");
      goldBorder.addColorStop(1, "#78350f");

      ctx.strokeStyle = goldBorder;
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = "#0f172a";
      ctx.font = `900 ${Math.round(size * 0.36)}px "Bebas Neue", Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(number), center, center + 2);
    }
  }

  // 2. Add 3D Spherical Volume Shading & Specular Glare Arc
  const sphereShade = ctx.createRadialGradient(center * 0.65, center * 0.45, radius * 0.05, center, center, radius);
  sphereShade.addColorStop(0, "rgba(255, 255, 255, 0.60)"); // Top-left specular spot
  sphereShade.addColorStop(0.35, "rgba(255, 255, 255, 0.12)");
  sphereShade.addColorStop(0.8, "rgba(0, 0, 0, 0.15)");
  sphereShade.addColorStop(1, "rgba(0, 0, 0, 0.78)"); // Dark spherical rim shadow

  ctx.fillStyle = sphereShade;
  ctx.fillRect(0, 0, size, size);

  // 3. Crisp Photorealistic Glossy Reflection Lens Oval Arc
  const glareGrad = ctx.createLinearGradient(center * 0.3, center * 0.2, center * 0.7, center * 0.5);
  glareGrad.addColorStop(0, "rgba(255, 255, 255, 0.65)");
  glareGrad.addColorStop(0.6, "rgba(255, 255, 255, 0.15)");
  glareGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.fillStyle = glareGrad;
  ctx.beginPath();
  ctx.ellipse(center * 0.62, center * 0.38, radius * 0.32, radius * 0.16, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}
