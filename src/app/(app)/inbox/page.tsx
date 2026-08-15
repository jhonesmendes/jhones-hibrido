import { InboxClient } from "@/components/inbox/inbox-client";
import { getSessionOrNull } from "@/lib/auth/session";
import { resolvePermissions } from "@/lib/auth/require-permission";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const session = await getSessionOrNull();
  let canDeleteConversation = false;
  if (session) {
    canDeleteConversation =
      session.role === "owner" ||
      (await resolvePermissions(session.memberId, session.role)).has(
        "conversations:delete"
      );
  }
  return <InboxClient canDeleteConversation={canDeleteConversation} />;
}
