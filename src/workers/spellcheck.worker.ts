/// <reference lib="webworker" />
import Typo from "typo-js";

/**
 * Corretor ortográfico PT-BR — roda numa worker thread de propósito: o
 * dicionário (~5MB, ~310 mil palavras) é pesado pra montar (a primeira vez
 * que `new Typo(...)` parseia o `.aff`/`.dic`), e isso NUNCA pode travar a
 * digitação do agente na Caixa de Entrada. Depois de montado uma vez, fica
 * em memória aqui dentro — cada checagem seguinte é só busca em mapa,
 * praticamente grátis.
 */

declare const self: DedicatedWorkerGlobalScope;

export type SpellcheckMatch = {
  word: string;
  index: number;
  suggestions: string[];
};

type Request = { id: number; text: string };
type Response = { id: number; matches: SpellcheckMatch[] };

let dictionary: Typo | null = null;
let loading: Promise<Typo> | null = null;

async function loadDictionary(): Promise<Typo> {
  if (dictionary) return dictionary;
  if (!loading) {
    loading = Promise.all([
      fetch("/dict/pt-BR.aff").then((r) => r.text()),
      fetch("/dict/pt-BR.dic").then((r) => r.text()),
    ]).then(([aff, dic]) => {
      dictionary = new Typo("pt_BR", aff, dic);
      return dictionary;
    });
  }
  return loading;
}

// Só letras (com acento) e apóstrofo/hífen internos — ignora pontuação,
// números, emoji, `{{variáveis de modelo}}`.
const WORD_RE = /\p{L}+(?:['’-]\p{L}+)*/gu;
const MIN_WORD_LENGTH = 3;
const MAX_SUGGESTIONS = 3;

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, text } = e.data;
  const dict = await loadDictionary();

  const matches: SpellcheckMatch[] = [];
  const seen = new Set<string>();
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(text))) {
    const word = m[0];
    if (word.length < MIN_WORD_LENGTH) continue;
    const key = word.toLowerCase();
    if (seen.has(key) || dict.check(word)) continue;
    seen.add(key);
    matches.push({ word, index: m.index, suggestions: dict.suggest(word, MAX_SUGGESTIONS) });
  }

  const response: Response = { id, matches };
  self.postMessage(response);
};
