/** Localização recebida numa mensagem, nos dois canais. */
export type MessageLocation = {
  latitude: number;
  longitude: number;
  name: string | null;
  address: string | null;
};

/** Normaliza o que o canal mandou; `null` se faltar coordenada válida. */
export function normalizeLocation(input: {
  latitude?: unknown;
  longitude?: unknown;
  name?: unknown;
  address?: unknown;
} | null | undefined): MessageLocation | null {
  if (!input) return null;
  const { latitude, longitude } = input;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90) return null;
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  const label = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return { latitude, longitude, name: label(input.name), address: label(input.address) };
}

/** Texto da mensagem: sem ele, o atendente veria um balão vazio. */
export function formatLocationText(location: MessageLocation): string {
  const place = [location.name, location.address].filter(Boolean).join(" - ");
  const coordinates = `${location.latitude}, ${location.longitude}`;
  return place ? `📍 ${place} (${coordinates})` : `📍 ${coordinates}`;
}
