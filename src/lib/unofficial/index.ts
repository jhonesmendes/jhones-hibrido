import { evolutionAdapter } from "@/lib/unofficial/evolution";
import { wppconnectAdapter } from "@/lib/unofficial/wppconnect";
import { wahaAdapter } from "@/lib/unofficial/waha";
import type {
  UnofficialAdapter,
  UnofficialProvider,
} from "@/lib/unofficial/types";

export * from "@/lib/unofficial/types";

const ADAPTERS: Record<UnofficialProvider, UnofficialAdapter> = {
  evolution: evolutionAdapter,
  wppconnect: wppconnectAdapter,
  waha: wahaAdapter,
};

export function getAdapter(provider: UnofficialProvider): UnofficialAdapter {
  return ADAPTERS[provider];
}

export const PROVIDER_LABELS: Record<UnofficialProvider, string> = {
  evolution: "Evolution API",
  wppconnect: "WPPConnect",
  waha: "WAHA",
};
