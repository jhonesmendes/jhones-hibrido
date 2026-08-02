import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const nano = customAlphabet(alphabet, 20);

const prefixes = {
  organization: "org",
  contact: "ct",
  conversation: "cv",
  message: "msg",
  lead: "ld",
  stage: "stg",
  credentials: "cred",
  unofficialChannel: "uch",
  agentProfile: "agp",
  kbEntry: "kb",
  template: "tpl",
  testRun: "run",
  testCase: "case",
  campaign: "camp",
  campaignRecipient: "crc",
  pipelineFollowup: "pfu",
  followupSend: "fus",
  messageMedia: "mm",
  memberPermission: "mp",
  memberChannel: "mc",
  inviteToken: "inv",
  smtpConfig: "smtp",
  aiConfig: "aic",
  n8nConfig: "n8n",
  passwordResetToken: "prt",
  auditLog: "aud",
  pushSubscription: "push",
  department: "dep",
  memberDepartment: "mdp",
  memberDepartmentPermission: "mdpp",
} as const;

export type IdKind = keyof typeof prefixes;

export function newId(kind: IdKind): string {
  return `${prefixes[kind]}_${nano()}`;
}
