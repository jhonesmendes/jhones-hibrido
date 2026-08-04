/**
 * Horário de funcionamento (Cenário 6, gap #6 resolvido — Sprint Q4).
 * `timezone` é um fuso IANA (`department.timezone`, default
 * `America/Sao_Paulo`); `businessHours` vem de `department.business_hours`
 * (jsonb). Sem overnight (start > end) — simplificação documentada, um
 * departamento 22h-02h precisaria de dois blocos, não suportado ainda.
 */

export type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export type BusinessHoursDay = { enabled: boolean; start: string; end: string };

export type BusinessHours = Partial<Record<DayKey, BusinessHoursDay>>;

function currentDayAndTime(now: Date, timezone: string): { day: DayKey; time: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(now);
  const weekday = (parts.find((p) => p.type === "weekday")?.value ?? "Sun")
    .toLowerCase()
    .slice(0, 3) as DayKey;
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return { day: weekday, time: `${hour}:${minute}` };
}

/** Sem `business_hours` configurado: sempre aberto (não trava quem nunca
 * mexeu nessa aba). Com configuração: dia ausente/`enabled:false` = fechado. */
export function isWithinBusinessHours(
  businessHours: unknown,
  timezone: string,
  now: Date = new Date()
): boolean {
  if (!businessHours || typeof businessHours !== "object") return true;
  const hours = businessHours as BusinessHours;
  const { day, time } = currentDayAndTime(now, timezone || "America/Sao_Paulo");
  const config = hours[day];
  if (!config || !config.enabled) return false;
  return time >= config.start && time <= config.end;
}
