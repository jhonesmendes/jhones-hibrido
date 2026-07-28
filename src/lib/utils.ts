import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Iniciais (máx 2) para o avatar de um contato. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase() || "?";
}

/* Paleta dessaturada do handoff (AV): sóbria sobre fundo claro. */
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

/** Cor estável por contato: hash simples do id/telefone → sempre a mesma classe. */
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
 * Celular BR (55 + DDD de 2 dígitos + 8 dígitos locais, sem o 9º dígito) é
 * completado pro formato de 13 dígitos. O WhatsApp é inconsistente sobre
 * qual formato usa pro mesmo contato dependendo da via (JID direto vs.
 * resolvido de um LID, ver `memory/sprint4_baileys_native_engine.md`) — sem
 * essa normalização em TODA entrada de telefone (digitada ou vinda de uma
 * mensagem real), o mesmo contato vira dois. Outros formatos (já com 9, ou
 * não-BR) voltam sem alteração.
 */
export function ensureBrNinthDigit(digits: string): string {
  if (digits.length === 12 && digits.startsWith("55")) {
    return `55${digits.slice(2, 4)}9${digits.slice(4)}`;
  }
  return digits;
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
  if (digits.length === 10) return `55${digits.slice(0, 2)}9${digits.slice(2)}`;
  if (digits.length === 11) return `55${digits}`;
  return ensureBrNinthDigit(digits);
}
