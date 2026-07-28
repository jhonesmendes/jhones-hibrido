/**
 * Lista fixa de permissões nomeadas (v1: não editável via UI, só a
 * concessão/revogação por membro é dinâmica — ver member_permission).
 */
export const PERMISSIONS = {
  "conversations:view_all": "Ver todas as conversas",
  "conversations:view_assigned": "Ver apenas conversas atribuídas",
  "conversations:reply": "Responder mensagens",
  "conversations:assign": "Atribuir conversas a agentes",

  "pipeline:view": "Ver pipeline",
  "pipeline:move": "Mover contatos no pipeline",

  "contacts:view": "Ver contatos",
  "contacts:create": "Criar contatos",
  "contacts:edit": "Editar contatos",

  "campaigns:view": "Ver campanhas",
  "campaigns:create": "Criar campanhas",
  "campaigns:send": "Disparar campanhas",

  "reports:view": "Ver relatórios",

  "agent:view": "Ver configurações da IA",
  "agent:manage": "Gerenciar agente IA",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export type Role = "owner" | "admin" | "agent";

const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

const AGENT_DEFAULT_PERMISSIONS: Permission[] = [
  "conversations:view_assigned",
  "conversations:reply",
  "pipeline:view",
  "pipeline:move",
  "contacts:view",
];

/** Default de permissões por papel — ponto de partida, ajustável por membro. */
export const DEFAULT_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  agent: AGENT_DEFAULT_PERMISSIONS,
};

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}
