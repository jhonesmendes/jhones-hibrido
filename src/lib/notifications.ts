"use client";

/**
 * Alerta de mensagem nova: som (Web Audio, sintetizado — sem arquivo
 * embutido) + Web Push real via Service Worker, pra notificar mesmo com o
 * navegador fechado/minimizado (o servidor de push é o do próprio
 * navegador do usuário — inerente ao padrão, não uma dependência externa
 * escolhida pelo operador). A notificação em si é sempre mostrada pelo
 * Service Worker (`public/sw.js`), que decide se deve exibir olhando se
 * a conversa já está aberta em foco (evita duplicar o que a UI já mostra
 * ao vivo via SSE).
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

/**
 * Registra o Service Worker (idempotente) e inscreve a Push API com a
 * chave VAPID pública da instância, enviando a inscrição ao backend. Se
 * o servidor não tiver Web Push configurado (`publicKey: null`), é um
 * no-op silencioso — o resto do produto segue funcionando normalmente.
 */
export async function ensurePushSubscription(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const res = await fetch("/api/push/public-key");
    if (!res.ok) return;
    const { publicKey } = (await res.json()) as { publicKey: string | null };
    if (!publicKey) return;

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    }).catch(() => null);
  } catch {
    // navegador sem suporte pleno, permissão negada a meio caminho, etc.
  }
}

/** Informa ao Service Worker qual conversa está aberta em foco agora, para
 * ele não duplicar uma notificação que a UI já mostra ao vivo via SSE. */
export function setActiveConversationForPush(conversationId: string | null): void {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({
    type: "active-conversation",
    conversationId,
  });
}

function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
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
