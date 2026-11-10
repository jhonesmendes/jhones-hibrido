# Vocero dentro do Sankhya (modo embutido)

Spec: [specs/010-modo-embutido](../specs/010-modo-embutido/spec.md).

O Vocero abre num iframe de um componente do Sankhya (ex.: o gadget
**[CALL CENTER]** feito no Construtor de Componentes de BI). Cada atendente
entra **com o próprio login do Vocero** dentro do quadro: quem atende fica
identificado no Vocero (auditoria, fila, atribuição). Não há SSO com o Sankhya.

## 1. Liberar o Sankhya na instância

Na stack da instância (Portainer → Environment variables):

```
EMBED_ALLOWED_ORIGINS=https://fibraforte.snk.ativy.com:40262
```

- Origem = `https://host[:porta]`, sem caminho e sem barra no fim. Várias:
  separadas por vírgula. Curinga de subdomínio aceito (`https://*.exemplo.com`).
- **Mais de uma base do Sankhya** (ex.: produção na porta 40262 e teste na
  50262): liste as duas
  (`https://fibraforte.snk.ativy.com:40262,https://fibraforte.snk.ativy.com:50262`)
  ou use o curinga de porta: `https://fibraforte.snk.ativy.com:*`.
- No Portainer, o nome e o valor são separados por **um** `=`. Com `==`, o
  valor fica inválido, o app avisa no log e o Sankhya é bloqueado.
- O Vocero precisa estar em **https**.
- Sem a variável, nenhum site de fora consegue embutir o Vocero (proteção contra
  clickjacking, sempre ligada).
- `frame-ancestors` vale para **todos** os quadros acima do Vocero. Se o
  componente HTML5 do Sankhya roda num iframe de outra origem, ela também
  tem de entrar na lista.
- **Diagnóstico ("a conexão foi recusada")**: troque temporariamente o `src`
  do iframe por `https://<vocero>/embed-check`. Essa é a única página que
  qualquer quadro consegue abrir: não tem login nem dados. Ela lista cada
  quadro acima dela (✔ liberado / ✘ fora da lista) e já mostra o valor
  completo de `EMBED_ALLOWED_ORIGINS` para colar na stack.
- Depois de mudar, faça o redeploy da stack e rode
  `scripts/install/vocero-verify.sh https://<vocero>`. A linha "Enquadramento
  restrito" mostra a lista em vigor.

## 2. URLs

| Para | URL |
|---|---|
| Caixa de entrada | `https://<vocero>/inbox?embed=1` |
| Fila | `https://<vocero>/queue?embed=1` |
| Pipeline | `https://<vocero>/pipeline?embed=1` |
| Conversa de um telefone | `https://<vocero>/inbox?embed=1&phone=<telefone>&name=<nome>` |

- `phone` aceita o formato do Sankhya (`(64) 99283-5887`), com ou sem 55.
  O link abre a conversa existente, ou cria o contato e a conversa, **sem enviar
  nada**. Se o contato está com outro atendente, o Vocero pergunta antes de
  assumir.
- `name` é usado só quando o contato ainda não existe.
- O modo embutido fica lembrado dentro do quadro. `?embed=0` desliga.

## 3. No componente HTML5 do Sankhya

```html
<iframe id="vocero" src="https://<vocero>/inbox?embed=1"
        allow="microphone; clipboard-write; autoplay"
        style="width:100%;height:100%;border:0"></iframe>
<script>
  var VOCERO = "https://<vocero>";
  // Botão "WhatsApp motorista": abre a conversa do motorista no quadro.
  function abrirWhatsAppVocero(telefone, nome) {
    document.getElementById("vocero").src =
      VOCERO + "/inbox?embed=1&phone=" + encodeURIComponent(telefone) +
      "&name=" + encodeURIComponent(nome || "");
  }
</script>
```

- `allow="microphone"` é o que permite gravar áudio dentro do quadro.
- As notificações do navegador (push) não funcionam dentro de iframe, porque
  o navegador bloqueia; o aviso sonoro e o contador continuam. Quem quiser
  push abre o Vocero direto (ícone ↗ na barra, que abre em nova aba).

## 4. Login e cookies

Com a variável preenchida, o cookie de sessão vira
`SameSite=None; Secure; Partitioned`. Particionado quer dizer que o login feito
dentro do Sankhya vale só dentro do Sankhya, e o Vocero aberto direto tem o seu
próprio login. Na primeira vez depois de ligar a variável, quem já estava
logado pode precisar entrar de novo.
