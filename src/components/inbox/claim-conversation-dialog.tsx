"use client";

import { Button } from "@/components/ui/button";

/**
 * Confirmação de "assumir conversa" (ver requiresClaim em
 * POST /api/conversations) — mesmo padrão visual dos outros modais do
 * sistema (overlay + card, ver FollowupManager), no lugar do
 * window.confirm() nativo do navegador.
 */
export function ClaimConversationDialog({
  ownerName,
  /** Preenchido quando a conversa achada é de OUTRO departamento (mesmo
   * número compartilhado, sem número próprio pro departamento ativo) —
   * mostra uma explicação extra pra não parecer um bug. */
  departmentName,
  onConfirm,
  onCancel,
}: {
  ownerName: string;
  departmentName?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1.5 font-semibold">Conversa já em atendimento</h3>
        <p className="mb-1.5 text-sm text-muted-foreground">
          Este contato já está em atendimento com{" "}
          <strong className="font-medium text-foreground">{ownerName}</strong>
          {departmentName ? (
            <>
              {" "}
              no departamento{" "}
              <strong className="font-medium text-foreground">{departmentName}</strong>
            </>
          ) : null}
          .
        </p>
        {departmentName && (
          <p className="mb-4 text-xs text-muted-foreground">
            Esse departamento usa o mesmo número de WhatsApp — o WhatsApp só
            permite uma conversa por contato por número, então não dá pra
            abrir uma separada aqui.
          </p>
        )}
        <p className="mb-4 text-sm">Deseja assumir a conversa?</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={onConfirm}>Assumir conversa</Button>
        </div>
      </div>
    </div>
  );
}
