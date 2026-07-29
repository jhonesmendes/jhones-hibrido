/**
 * Conteúdo estático da Documentação (menu → Documentação). Mantido em código
 * (não editável pelo cliente) porque é guia de uso da própria plataforma,
 * não dado de organização. Cada seção tem um `slug` estável — telas usam
 * esse slug para linkar direto (`/documentacao#slug`) via <HelpLink>.
 */

export type DocBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "fields"; items: { name: string; desc: string }[] }
  | { type: "warning"; text: string }
  | { type: "tip"; text: string };

export type DocSection = {
  slug: string;
  title: string;
  summary: string;
  blocks: DocBlock[];
};

export const DOC_SECTIONS: DocSection[] = [
  {
    slug: "inbox",
    title: "Caixa de entrada",
    summary: "Onde você atende as conversas do WhatsApp em tempo real.",
    blocks: [
      {
        type: "p",
        text: "Cada contato tem UMA conversa, que segue o canal (Oficial ou WhatsApp Web) por onde ele escreveu por último. Se ambos os canais estiverem conectados, um seletor \"Enviar via:\" aparece acima da caixa de resposta para você escolher pontualmente por qual canal enviar aquela mensagem — vale só para aquele envio.",
      },
      {
        type: "fields",
        items: [
          { name: "Digite / na resposta", desc: "abre o seletor de modelos aprovados; a variável {{1}} já vem selecionada pra você sobrescrever." },
          { name: "Janela de 24h fechada", desc: "no canal Oficial, sem mensagem do cliente nas últimas 24h só dá pra reabrir a conversa enviando um modelo aprovado. O WhatsApp Web não tem essa janela." },
          { name: "IA nesta conversa", desc: "alternador no painel de detalhes; pausa/retoma o agente só para aquele contato, sem afetar as demais." },
          { name: "Notas internas", desc: "campo no painel de detalhes, visível só pela equipe, nunca enviado ao cliente." },
        ],
      },
      {
        type: "tip",
        text: "Sem permissão \"Ver todas as conversas\", cada agente só enxerga as conversas atribuídas a ele — configurável em Equipe.",
      },
    ],
  },
  {
    slug: "pipeline",
    title: "Pipeline",
    summary: "Funil visual de leads por etapa, com follow-up automático opcional.",
    blocks: [
      {
        type: "p",
        text: "Cada organização tem um pipeline com etapas customizáveis (ex.: Novo, Em conversa, Cliente, Perdido). Arraste um lead entre etapas para atualizar seu estágio.",
      },
      {
        type: "fields",
        items: [
          { name: "Follow-up automático", desc: "reenvia uma mensagem sozinho quando um lead fica parado numa etapa-gatilho por tempo demais. Configurado em Configurações → Pipeline: etapa que ativa, intervalo, mensagem, e para onde o lead vai em caso de sucesso ou expiração." },
          { name: "Intervalo do follow-up", desc: "nunca é um valor fixo escondido no código — sempre editável por você." },
        ],
      },
    ],
  },
  {
    slug: "contatos",
    title: "Contatos",
    summary: "Cadastro de quem já escreveu (ou vai escrever) para o seu WhatsApp.",
    blocks: [
      {
        type: "p",
        text: "Contatos são criados automaticamente na primeira mensagem recebida. Você também pode criar/editar um contato manualmente para já deixá-lo pronto antes do primeiro contato (útil para campanhas).",
      },
    ],
  },
  {
    slug: "campanhas",
    title: "Campanhas",
    summary: "Disparo de mensagem para vários contatos de uma vez, importando uma lista por CSV.",
    blocks: [
      {
        type: "p",
        text: "Existem dois canais de disparo, com regras bem diferentes:",
      },
      {
        type: "fields",
        items: [
          {
            name: "Oficial (Meta Cloud API)",
            desc: "usa um MODELO aprovado pela Meta (não texto livre) e o CSV tem a coluna 2 preenchendo a variável {{1}} do modelo. Sem risco de banimento.",
          },
          {
            name: "WhatsApp Web",
            desc: "texto livre com variáveis nomeadas (ex.: {{nome}}, {{empresa}} — cada uma vira uma coluna no CSV com esse nome). Exige confirmar o aviso de risco de banimento antes de criar, e você define o intervalo entre envios (nunca fixo no código) — recomendado 5–10s.",
          },
        ],
      },
      {
        type: "warning",
        text: "Campanha pelo WhatsApp Web é enviada pelo seu número real de WhatsApp Web — disparo em massa é contra os termos da Meta para esse tipo de conexão e pode banir o número. Use um número secundário.",
      },
    ],
  },
  {
    slug: "automacoes-n8n",
    title: "Automações N8N",
    summary: "Executa workflows de uma instância N8N própria, direto de dentro do Vocero.",
    blocks: [
      {
        type: "p",
        text: "Recurso opcional: você conecta a URL e a API key de uma instância N8N que você mesmo hospeda (Configurações → API → Create API Key, no painel do N8N). Sem configurar, a aba fica só com a tela de conexão — nada quebra.",
      },
      {
        type: "fields",
        items: [
          { name: "Executar agora", desc: "dispara o workflow escolhido com um clique, sem precisar abrir o N8N." },
          { name: "Painel embutido", desc: "mostra o próprio painel N8N via iframe, com atalho para abrir em tela cheia caso a instância bloqueie incorporação." },
          { name: "Quem pode configurar", desc: "só owner/admin editam a conexão; qualquer um com permissão de ver campanhas enxerga a lista de workflows." },
        ],
      },
    ],
  },
  {
    slug: "agente",
    title: "Agente IA",
    summary: "Comportamento e conhecimento do assistente que responde pelo WhatsApp.",
    blocks: [
      {
        type: "fields",
        items: [
          { name: "Comportamento", desc: "nome do agente, tom de voz, instruções gerais, regras de escalonamento (quando ele deve passar pra um humano) e a saudação de conversas novas." },
          { name: "Knowledge base", desc: "a ÚNICA fonte de verdade do agente — perguntas & respostas ou blocos de texto livre (horários, políticas, endereços). O que não estiver aqui, ele não afirma." },
          { name: "Liga/desliga geral", desc: "no topo da tela; se desligado, o agente não responde em NENHUMA conversa real (o Laboratório continua testando mesmo assim)." },
        ],
      },
      {
        type: "tip",
        text: "Sem provedor de IA configurado (Configurações → Inteligência IA), essa tela mostra um aviso e o agente fica indisponível — mas o resto do CRM funciona normalmente.",
      },
    ],
  },
  {
    slug: "laboratorio",
    title: "Laboratório",
    summary: "Autoavaliação do agente: simula conversas com personas de clientes e dá nota.",
    blocks: [
      {
        type: "p",
        text: "Roda casos de teste contra personas (ex.: cliente decidido, cliente fora da base de conhecimento) usando o comportamento e a knowledge base ATUAIS do agente — sem tocar a API real do WhatsApp em nenhum momento (sandbox).",
      },
      {
        type: "fields",
        items: [
          { name: "Veredito", desc: "verde/amarelo/vermelho por caso, com evidência do que saiu errado (alucinação, saiu da base, deveria ter escalado, tom)." },
          { name: "Score", desc: "% de casos verdes+meio-amarelos sobre o total; casos que falharam por erro do provedor de IA (não da resposta) não entram na conta." },
        ],
      },
    ],
  },
  {
    slug: "auditoria",
    title: "Auditoria",
    summary: "Histórico de ações sensíveis da organização — só owner/admin.",
    blocks: [
      {
        type: "p",
        text: "Registra login, criação/uso de convites, conexão/desconexão de canais, disparo de campanhas, mudanças de papel/permissão e alterações de configuração sensível (SMTP, IA, N8N). Cada entrada mostra quem fez, quando e o quê.",
      },
    ],
  },
  {
    slug: "canais",
    title: "Configurações → Canais",
    summary: "Conectar o número de WhatsApp — oficial e/ou WhatsApp Web.",
    blocks: [
      {
        type: "fields",
        items: [
          {
            name: "Oficial (Meta API)",
            desc: "cole WABA ID, Phone Number ID e o token da Cloud API — validado direto na Meta ANTES de salvar. Depois de salvar, copie a URL de webhook e o verify token para o painel da Meta (ou o override da sua agência).",
          },
          {
            name: "WhatsApp Web",
            desc: "sem URL nem chave — só clicar em Conectar e escanear o QR no celular do número (de preferência secundário, não o principal do negócio).",
          },
        ],
      },
      {
        type: "warning",
        text: "Hoje cada organização conecta no máximo 1 número oficial + 1 WhatsApp Web. Suportar mais de um por tipo é uma evolução futura já mapeada, ainda não implementada.",
      },
    ],
  },
  {
    slug: "inteligencia-ia",
    title: "Configurações → Inteligência IA",
    summary: "Provedor, chave de API e modelo que o agente usa para responder.",
    blocks: [
      {
        type: "p",
        text: "Sobrepõe (por organização) as variáveis de ambiente OPENROUTER_* da instância — útil quando você (agência) quer um provedor/modelo diferente por cliente sem mexer no servidor.",
      },
      {
        type: "fields",
        items: [
          { name: "URL base do provedor", desc: "qualquer endpoint compatível com a API de chat da OpenAI (OpenRouter, OpenAI direto, ou outro gateway), com ou sem sufixo /v1." },
          { name: "Testar", desc: "faz uma chamada mínima real com a chave colada — não salva nada, só confirma que a conexão funciona." },
          { name: "Modelo de fallback", desc: "usado também como juiz do Laboratório quando definido." },
          { name: "Temperatura / Máx. tokens / Histórico de contexto", desc: "controlam criatividade, tamanho da resposta e quantas mensagens anteriores entram no contexto de cada turno." },
        ],
      },
    ],
  },
  {
    slug: "marca",
    title: "Configurações → Marca",
    summary: "Nome, ícone e cor do CRM — aparecem em toda a interface e no login.",
    blocks: [
      {
        type: "p",
        text: "Pensado para agências fazerem white-label: coloque o nome e o ícone do SEU cliente aqui. O crédito \"Vocero CRM · WhatsApp\" continua visível embaixo, discreto.",
      },
      {
        type: "fields",
        items: [
          { name: "Cor de destaque", desc: "escolha um preset ou uma cor personalizada — os tons derivados (hover, fundos suaves, contraste) são calculados sozinhos, para claro e escuro." },
          { name: "Ícone", desc: "PNG/JPEG/WebP/SVG até ~170KB. Sem ícone, aparece a inicial do nome — inclusive no favicon da aba do navegador." },
        ],
      },
    ],
  },
  {
    slug: "modelos",
    title: "Configurações → Modelos",
    summary: "Modelos de mensagem aprovados pela Meta, para o canal Oficial.",
    blocks: [
      {
        type: "p",
        text: "Fora da janela de 24h, o canal Oficial só permite reabrir a conversa com um modelo aprovado — não texto livre. Modelos entram \"Em análise\" até a Meta aprovar; até lá não podem ser usados.",
      },
    ],
  },
  {
    slug: "equipe",
    title: "Configurações → Equipe",
    summary: "Quem acessa o CRM, com qual papel e quais permissões.",
    blocks: [
      {
        type: "fields",
        items: [
          { name: "Criar conta de equipe", desc: "só o proprietário; gera e-mail + senha temporária mostrada UMA única vez." },
          { name: "Convidar por link", desc: "gera um link de cadastro com papel, e-mail (opcional, restringe o convite) e prazo de expiração definidos por você." },
          { name: "Permissões por membro", desc: "granulares — ver todas as conversas, responder, mover pipeline, criar/disparar campanhas, ver relatórios, gerenciar agente — e acesso por canal (ver/enviar) separado entre Oficial e WhatsApp Web." },
          { name: "Convites pendentes", desc: "lista com prazo de expiração e botão pra revogar antes que alguém use o link." },
        ],
      },
    ],
  },
  {
    slug: "email",
    title: "Configurações → Email (SMTP)",
    summary: "Servidor de e-mail próprio, para convites e recuperação de senha.",
    blocks: [
      {
        type: "p",
        text: "Opcional e exclusivo do proprietário — é o SEU servidor SMTP (Gmail, próprio, etc.), nunca um serviço de terceiro embutido no produto. Sem SMTP configurado, convites e recuperação de senha continuam funcionando, só que de forma manual (você gera e envia o link pelo painel).",
      },
      {
        type: "fields",
        items: [
          { name: "Testar configuração", desc: "envia um e-mail de teste real para o seu próprio e-mail de proprietário." },
        ],
      },
    ],
  },
];

export function getDocSection(slug: string): DocSection | undefined {
  return DOC_SECTIONS.find((s) => s.slug === slug);
}
