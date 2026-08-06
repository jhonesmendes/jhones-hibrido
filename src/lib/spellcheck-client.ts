import type { SpellcheckMatch } from "@/workers/spellcheck.worker";

/**
 * Ponte pra worker de correção ortográfica — o dicionário pesado (~5MB)
 * carrega e roda numa thread separada (ver spellcheck.worker.ts), nunca no
 * main thread, então nunca trava a digitação. Um único worker por aba,
 * reusado entre chamadas; IDs incrementais casam pedido/resposta.
 */

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, (matches: SpellcheckMatch[]) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/spellcheck.worker.ts", import.meta.url));
    worker.onmessage = (e: MessageEvent<{ id: number; matches: SpellcheckMatch[] }>) => {
      const resolve = pending.get(e.data.id);
      if (!resolve) return;
      pending.delete(e.data.id);
      resolve(e.data.matches);
    };
  }
  return worker;
}

/** Só funciona no navegador — `Worker` não existe em SSR. Chame de dentro
 * de um efeito/handler, nunca durante a renderização do servidor. */
export function checkSpelling(text: string): Promise<SpellcheckMatch[]> {
  if (typeof window === "undefined") return Promise.resolve([]);
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage({ id, text });
  });
}
