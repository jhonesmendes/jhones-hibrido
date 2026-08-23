// Service worker do Vocero — só cuida de Web Push (sem cache/offline: o
// app não precisa funcionar offline, e cache indevido de rotas autenticadas
// seria um risco de dados de outro tenant vazarem entre sessões).

let activeConversationId = null;

// Sem isso, uma versão nova do SW fica "esperando" até TODAS as abas do
// Vocero fecharem e reabrirem pra assumir — na prática, "implantei mas não
// mudou nada" até o usuário fechar o navegador inteiro. `skipWaiting` ativa
// a versão nova assim que ela termina de instalar; `clients.claim` faz ela
// assumir o controle das abas já abertas, sem precisar de F5.
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Sem cache/offline (ver comentário acima): o listener existe só porque o
// Chrome exige um handler de `fetch` registrado para oferecer "Instalar
// app". Nunca intercepta — deixa a rede seguir o caminho normal.
self.addEventListener("fetch", () => {});

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

      // `tag` agrupa notificações da mesma conversa (não empilha uma em
      // cima da outra) — mas sem `renotify: true` o navegador troca o
      // conteúdo da notificação existente SEM alertar de novo (sem som/
      // popup), então a segunda mensagem seguida na mesma conversa ficava
      // muda mesmo tendo chegado.
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon,
        tag: `vocero-${payload.conversationId}`,
        renotify: true,
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
