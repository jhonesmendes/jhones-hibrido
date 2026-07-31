// Service worker do Vocero — só cuida de Web Push (sem cache/offline: o
// app não precisa funcionar offline, e cache indevido de rotas autenticadas
// seria um risco de dados de outro tenant vazarem entre sessões).

let activeConversationId = null;

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "active-conversation") {
    activeConversationId = event.data.conversationId ?? null;
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const looking =
        activeConversationId &&
        activeConversationId === payload.conversationId &&
        clientList.some((c) => c.focused);
      if (looking) return; // já está vendo essa conversa em tempo real via SSE

      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon,
        tag: `vocero-${payload.conversationId}`,
        data: { url: payload.url },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/inbox";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = clientList.find((c) => c.url.includes(new URL(url, self.location.origin).pathname));
      if (existing) {
        await existing.focus();
      } else {
        await self.clients.openWindow(url);
      }
    })()
  );
});
