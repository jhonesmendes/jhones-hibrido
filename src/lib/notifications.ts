"use client";

/**
 * Alerta de mensagem nova (som + notificação do navegador), no mesmo
 * espírito do WhatsApp Web — só dispara para quem está com a Caixa de
 * entrada aberta no navegador (sem push server-side, sem service worker:
 * autohospedado, sem dependência externa). O som é sintetizado via Web
 * Audio API pra não depender de um arquivo de áudio embutido.
 */

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  return Notification.requestPermission();
}

export function showMessageNotification(
  title: string,
  body: string,
  icon?: string
): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body,
      tag: "vocero-message",
      silent: true,
      icon,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // alguns navegadores lançam se a página não estiver em contexto seguro
  }
}

let audioCtx: AudioContext | null = null;

export function playNotificationSound(): void {
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    if (audioCtx.state === "suspended") void audioCtx.resume();

    const ctx = audioCtx;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    gain.connect(ctx.destination);

    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      const start = now + i * 0.09;
      osc.start(start);
      osc.stop(start + 0.28);
    });
  } catch {
    // som é cortesia, nunca deve quebrar o fluxo de mensagens
  }
}
