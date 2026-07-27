import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Iniciales (máx 2) para el avatar de un contacto. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase() || "?";
}

/* Paleta desaturada del handoff (AV): sobria sobre fondo claro. */
const AVATAR_COLORS = [
  "bg-[#5b7291]", // steel
  "bg-[#647082]", // slate
  "bg-[#6f8378]", // sage
  "bg-[#8c7d68]", // taupe
  "bg-[#9c7169]", // clay
  "bg-[#77708c]", // dusk
  "bg-[#4f7d78]", // tealm
  "bg-[#6b7280]", // graphite
] as const;

/** Color estable por contacto: hash simple del id/teléfono → misma clase siempre. */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

export function formatPhone(phone: string): string {
  return `+${phone}`;
}

/**
 * Normaliza um telefone digitado livre para dígitos com código do país.
 * Ex.: "66 99674-6147" → "5566996746147". 10–11 dígitos (fixo/celular BR
 * com DDD) ganham prefixo 55. Devolve null se não parecer telefone.
 */
export function normalizePhoneInput(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  // Sem sinal de texto junto (busca por nome não vira telefone)
  if (/[a-zA-Z]{2,}/.test(input)) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}
