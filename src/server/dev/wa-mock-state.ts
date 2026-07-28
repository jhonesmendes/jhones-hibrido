/**
 * Estado em memória do harness wa-mock (somente dev/test). Vive em globalThis
 * porque o Next recarrega módulos em dev; uma instância = um processo, então
 * o outbox em memória é suficiente para as asserções do self-test.
 */

export type OutboxEntry = {
  n: number;
  phoneNumberId: string;
  to: string;
  type: string;
  body: unknown;
  at: string;
};

export type MockTemplate = {
  id: string;
  name: string;
  language: string;
  category: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  body: string;
};

type WaMockState = {
  outbox: OutboxEntry[];
  templates: MockTemplate[];
  counter: number;
};

const globalForMock = globalThis as unknown as { __waMockState?: WaMockState };

export function getWaMockState(): WaMockState {
  if (!globalForMock.__waMockState) {
    globalForMock.__waMockState = { outbox: [], templates: [], counter: 0 };
  }
  return globalForMock.__waMockState;
}

export function resetWaMockState(): void {
  globalForMock.__waMockState = { outbox: [], templates: [], counter: 0 };
}

export function nextN(): number {
  return ++getWaMockState().counter;
}
