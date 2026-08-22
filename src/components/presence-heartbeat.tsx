"use client";

import { useEffect, useRef } from "react";

/** Depois de ficar assim sem interação no CLIENTE, para de mandar heartbeat
 * (o sweeper do servidor marca "away" independente disso, mas parar de
 * bater aqui evita reafirmar presença de uma aba esquecida aberta). */
const CLIENT_IDLE_MS = 4 * 60_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Sinal de "estou usando o sistema" — sem UI própria. Junto com o sweeper
 * de servidor (`src/server/presence/sweeper.ts`), substitui o toggle
 * manual online/ausente: usar o app volta o status pra "online"
 * automaticamente; parar de usar (aba em segundo plano ou sem interação)
 * deixa o sweeper marcar "away" sozinho depois de alguns minutos.
 */
export function PresenceHeartbeat() {
  const lastInteractionRef = useRef(Date.now());

  useEffect(() => {
    const markActive = () => {
      lastInteractionRef.current = Date.now();
    };
    const events: (keyof WindowEventMap)[] = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    for (const ev of events) window.addEventListener(ev, markActive, { passive: true });

    const beat = () => {
      void fetch("/api/presence/heartbeat", { method: "POST" }).catch(() => {});
    };

    const tick = () => {
      const idleFor = Date.now() - lastInteractionRef.current;
      if (document.visibilityState === "visible" && idleFor < CLIENT_IDLE_MS) {
        beat();
      }
    };

    // Primeiro heartbeat imediato (abriu o app = está usando) + ao voltar
    // pra aba depois de estar em outra.
    beat();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        markActive();
        beat();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const interval = setInterval(tick, HEARTBEAT_INTERVAL_MS);
    return () => {
      for (const ev of events) window.removeEventListener(ev, markActive);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
    };
  }, []);

  return null;
}
