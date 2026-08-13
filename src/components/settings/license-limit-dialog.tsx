"use client";

export type LicenseLimitInfo = {
  plan: string;
  resource: string;
  contact: { whatsapp: string | null; email: string | null };
};

const PLAN_LABEL: Record<string, string> = {
  trial: "Trial",
  starter: "Starter",
  business: "Business",
  enterprise: "Enterprise",
};

/** Modal exibido quando uma ação bate no limite do plano (403
 * `license_limit_reached`) — orienta o cliente a falar com o operador em
 * vez de só mostrar um erro sem saída. */
export function LicenseLimitDialog({
  plan,
  resource,
  contact,
  onClose,
}: LicenseLimitInfo & { onClose: () => void }) {
  const waLink = contact.whatsapp
    ? `https://wa.me/${contact.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Olá! Preciso aumentar o limite de ${resource} no meu plano.`
      )}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
        <div className="mb-4 text-center">
          <h2 className="text-lg font-bold">Limite do plano atingido</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Seu plano <strong>{PLAN_LABEL[plan] ?? plan}</strong> não permite
            adicionar mais {resource}.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] py-2.5 font-semibold text-white transition hover:opacity-90"
            >
              Solicitar upgrade via WhatsApp
            </a>
          )}
          {contact.email && (
            <a
              href={`mailto:${contact.email}?subject=${encodeURIComponent("Upgrade de plano")}`}
              className="flex items-center justify-center gap-2 rounded-xl border py-2.5 font-medium text-foreground transition hover:bg-accent"
            >
              Enviar e-mail
            </a>
          )}
          {!waLink && !contact.email && (
            <p className="text-center text-xs text-muted-foreground">
              Fale com quem administra esta instância para liberar mais {resource}.
            </p>
          )}
          <button
            onClick={onClose}
            className="mt-1 text-sm text-muted-foreground hover:text-foreground"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
