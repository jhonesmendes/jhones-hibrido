"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Backup = {
  id: string;
  filename: string;
  sizeBytes: number | null;
  status: "running" | "done" | "failed";
  kind: "scheduled" | "manual" | "pre_restore";
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

type BackupConfig = { enabled: boolean; hourOfDay: number; retentionCount: number };

type RestoreLog = {
  id: string;
  sourceBackupId: string;
  preRestoreBackupId: string | null;
  status: "running" | "done" | "failed";
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

const KIND_LABEL: Record<Backup["kind"], string> = {
  scheduled: "Automático",
  manual: "Manual",
  pre_restore: "Pré-restauração",
};

function fmtSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: Backup["status"] | RestoreLog["status"] }) {
  const style =
    status === "done"
      ? "border-[#1e3a2a] text-[#4ecb8d]"
      : status === "failed"
        ? "border-[#3a2020] text-[#f07070]"
        : "border-[#2a3560] text-[#7c9ff5]";
  const label = status === "done" ? "Concluído" : status === "failed" ? "Falhou" : "Em andamento…";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] ${style}`}>{label}</span>;
}

export function ClientBackupSection({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [restores, setRestores] = useState<RestoreLog[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetch = useCallback(async () => {
    const [b, c, r] = await Promise.all([
      fetch(`/api/admin/clients/${clientId}/backups`).catch(() => null),
      fetch(`/api/admin/clients/${clientId}/backups/config`).catch(() => null),
      fetch(`/api/admin/clients/${clientId}/backups/restores`).catch(() => null),
    ]);
    if (b?.ok) setBackups(((await b.json()) as { backups: Backup[] }).backups);
    if (c?.ok) setConfig(((await c.json()) as { config: BackupConfig }).config);
    if (r?.ok) setRestores(((await r.json()) as { restores: RestoreLog[] }).restores);
  }, [clientId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Faz polling enquanto houver algo "running" (backup ou restauração) —
  // pra esse painel remoto, não existe canal ao vivo (SSE) entre a
  // instância do cliente e o painel central, só consulta periódica.
  useEffect(() => {
    const anyRunning =
      backups?.some((b) => b.status === "running") || restores.some((r) => r.status === "running");
    if (anyRunning && !pollRef.current) {
      pollRef.current = setInterval(() => void refetch(), 4000);
    } else if (!anyRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [backups, restores, refetch]);

  async function triggerBackup() {
    setTriggering(true);
    setError(null);
    const res = await fetch(`/api/admin/clients/${clientId}/backups`, { method: "POST" }).catch(
      () => null
    );
    setTriggering(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(data?.error?.message ?? "Não foi possível iniciar o backup");
      return;
    }
    void refetch();
  }

  async function removeBackup(id: string) {
    if (!confirm("Excluir este backup? Não pode ser desfeito.")) return;
    const res = await fetch(`/api/admin/clients/${clientId}/backups/${id}`, {
      method: "DELETE",
    }).catch(() => null);
    if (res?.ok) void refetch();
  }

  function downloadUrl(id: string): string {
    return `/api/admin/clients/${clientId}/backups/${id}/download`;
  }

  async function saveConfig(patch: Partial<BackupConfig>) {
    if (!config) return;
    setSavingConfig(true);
    const next = { ...config, ...patch };
    const res = await fetch(`/api/admin/clients/${clientId}/backups/config`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    setSavingConfig(false);
    if (res?.ok) setConfig(next);
  }

  return (
    <div className="space-y-4 rounded-[10px] border border-[#1e2130] bg-[#13161f] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[#c0c8e8]">Backup do banco</p>
        <button
          disabled={triggering}
          onClick={() => void triggerBackup()}
          className="rounded-md border border-[#2a4090] bg-[#1e3080] px-3 py-1.5 text-xs font-medium text-[#7c9ff5] transition-colors hover:bg-[#243898] disabled:opacity-50"
        >
          {triggering ? "Iniciando…" : "Fazer backup agora"}
        </button>
      </div>

      {config && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[#1e2130] pb-3 text-xs">
          <label className="flex items-center gap-1.5 text-[#8890b0]">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => void saveConfig({ enabled: e.target.checked })}
            />
            Backup diário automático
          </label>
          <label className="flex items-center gap-1.5 text-[#8890b0]">
            Horário
            <select
              value={config.hourOfDay}
              disabled={savingConfig}
              onChange={(e) => void saveConfig({ hourOfDay: Number(e.target.value) })}
              className="rounded-md border border-[#1e2130] bg-[#0f1117] px-1.5 py-1 text-[#c0c8e8]"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[#8890b0]">
            Manter últimos
            <input
              type="number"
              min={1}
              max={90}
              value={config.retentionCount}
              disabled={savingConfig}
              onChange={(e) => void saveConfig({ retentionCount: Number(e.target.value) || 1 })}
              className="w-14 rounded-md border border-[#1e2130] bg-[#0f1117] px-1.5 py-1 text-[#c0c8e8]"
            />
          </label>
        </div>
      )}

      {error && <p className="text-sm text-[#f07070]">{error}</p>}

      <div className="space-y-1.5">
        {backups === null && <p className="text-xs text-[#4a5070]">Carregando…</p>}
        {backups?.length === 0 && (
          <p className="text-xs text-[#4a5070]">Nenhum backup ainda.</p>
        )}
        {backups?.map((b) => (
          <div
            key={b.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#1e2130] px-3 py-2 text-xs"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <StatusBadge status={b.status} />
                <span className="text-[#8890b0]">{KIND_LABEL[b.kind]}</span>
                <span className="text-[#4a5070]">{fmtDate(b.startedAt)}</span>
                <span className="text-[#4a5070]">{fmtSize(b.sizeBytes)}</span>
              </div>
              {b.status === "failed" && b.error && (
                <p className="mt-1 truncate text-[#f07070]">{b.error}</p>
              )}
            </div>
            {b.status === "done" && (
              <div className="flex shrink-0 gap-1.5">
                <a
                  href={downloadUrl(b.id)}
                  className="rounded-md border border-[#1e2540] px-2 py-1 text-[#7c9ff5] transition-colors hover:bg-[#1e2540]"
                >
                  Baixar
                </a>
                {b.kind !== "pre_restore" && (
                  <button
                    onClick={() => setRestoreTarget(b)}
                    className="rounded-md border border-[#3a2020] px-2 py-1 text-[#f0a0a0] transition-colors hover:bg-[#2a1818]"
                  >
                    Restaurar
                  </button>
                )}
                <button
                  onClick={() => void removeBackup(b.id)}
                  className="rounded-md border border-[#1e2130] px-2 py-1 text-[#6070a0] transition-colors hover:bg-[#1a1e2e]"
                >
                  Excluir
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {restores.length > 0 && (
        <div className="border-t border-[#1e2130] pt-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-[#4a5070]">
            Restaurações
          </p>
          <div className="space-y-1">
            {restores.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs">
                <StatusBadge status={r.status} />
                <span className="text-[#4a5070]">{fmtDate(r.startedAt)}</span>
                {r.status === "failed" && r.error && (
                  <span className="truncate text-[#f07070]">{r.error}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {restoreTarget && (
        <RestoreConfirmDialog
          backup={restoreTarget}
          clientName={clientName}
          clientId={clientId}
          onClose={() => setRestoreTarget(null)}
          onStarted={() => {
            setRestoreTarget(null);
            void refetch();
          }}
        />
      )}
    </div>
  );
}

function RestoreConfirmDialog({
  backup,
  clientName,
  clientId,
  onClose,
  onStarted,
}: {
  backup: Backup;
  clientName: string;
  clientId: string;
  onClose: () => void;
  onStarted: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = confirmText.trim() === clientName;

  async function confirmRestore() {
    setStarting(true);
    setError(null);
    const res = await fetch(`/api/admin/clients/${clientId}/backups/${backup.id}/restore`, {
      method: "POST",
    }).catch(() => null);
    setStarting(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(data?.error?.message ?? "Não foi possível iniciar a restauração");
      return;
    }
    onStarted();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[10px] border border-[#3a2020] bg-[#13161f] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1.5 text-sm font-semibold text-[#f0a0a0]">Restaurar backup</h3>
        <p className="mb-3 text-xs text-[#8890b0]">
          Isso vai <strong className="text-[#f0a0a0]">substituir todo o banco atual</strong> da
          instância &ldquo;{clientName}&rdquo; pelo conteúdo de{" "}
          <span className="text-[#c0c8e8]">{backup.filename}</span> ({fmtDate(backup.startedAt)}).
          Um snapshot de segurança do estado atual é tirado automaticamente antes de começar, mas
          qualquer dado criado DEPOIS desse backup será perdido. Digite{" "}
          <strong className="text-[#c0c8e8]">{clientName}</strong> pra confirmar.
        </p>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={clientName}
          className="mb-3 w-full rounded-md border border-[#1e2130] bg-[#0f1117] px-3 py-2 text-sm text-[#c0c8e8] outline-none focus:border-[#3a2020]"
        />
        {error && <p className="mb-2 text-sm text-[#f07070]">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={starting}
            className="rounded-md border border-[#1e2130] px-3 py-1.5 text-sm text-[#8890b0] hover:bg-[#1a1e2e]"
          >
            Cancelar
          </button>
          <button
            disabled={!ready || starting}
            onClick={() => void confirmRestore()}
            className="rounded-md border border-[#3a2020] bg-[#2a1818] px-3 py-1.5 text-sm font-medium text-[#f0a0a0] transition-colors hover:bg-[#3a2020] disabled:opacity-50"
          >
            {starting ? "Iniciando…" : "Restaurar e sobrescrever"}
          </button>
        </div>
      </div>
    </div>
  );
}
