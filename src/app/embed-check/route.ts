import { parseEmbedOrigins } from "@/lib/embed";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico do modo embutido (spec 010). Única página que QUALQUER site
 * pode enquadrar (o middleware libera só este caminho): não tem login nem
 * dados, só mostra a cadeia de quadros acima dela (`ancestorOrigins`) e
 * quais origens estão fora de EMBED_ALLOWED_ORIGINS — o que o navegador não
 * diz quando recusa o iframe. A lista exibida é a mesma que já sai no
 * cabeçalho CSP de toda resposta (não é segredo).
 */
export function GET() {
  const { valid, invalid } = parseEmbedOrigins(process.env.EMBED_ALLOWED_ORIGINS);
  const data = JSON.stringify({ allowed: valid, invalid }).replace(/</g, "\\u003c");
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vocero · diagnóstico do iframe</title>
<style>
body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:16px;background:#f7f8fa;color:#111}
h1{font-size:16px;margin:0 0 12px}code{background:#eceff3;padding:1px 5px;border-radius:4px;word-break:break-all}
li{margin:4px 0}.ok{color:#15803d}.bad{color:#b91c1c;font-weight:600}.box{background:#fff;border:1px solid #e3e6ea;border-radius:8px;padding:12px;margin:10px 0}
</style></head><body>
<h1>Vocero · diagnóstico do iframe</h1>
<div class="box"><b>Cadeia de quadros acima desta página</b> (do mais próximo ao topo):<ul id="chain"></ul></div>
<div class="box"><b>EMBED_ALLOWED_ORIGINS em vigor:</b><ul id="allowed"></ul><div id="invalid"></div></div>
<div class="box" id="verdict"></div>
<script>
(function(){
  var d=${data};
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
  function matches(o){
    if(o===location.origin) return true;
    return d.allowed.some(function(a){
      var m=a.match(/^(https?):\\/\\/(\\*\\.)?([^:]+)(?::(\\d+|\\*))?$/); if(!m) return false;
      var u; try{u=new URL(o)}catch(e){return false}
      if(u.protocol!==m[1]+":") return false;
      var host=m[3], okHost=m[2]?(u.hostname.endsWith("."+host)):(u.hostname===host);
      var port=u.port||(u.protocol==="https:"?"443":"80"), wantPort=m[4]||(m[1]==="https"?"443":"80");
      return okHost&&(wantPort==="*"||port===wantPort);
    });
  }
  var chain=[];
  if(location.ancestorOrigins&&location.ancestorOrigins.length){for(var i=0;i<location.ancestorOrigins.length;i++)chain.push(location.ancestorOrigins[i]);}
  else if(window.self!==window.top&&document.referrer){try{chain.push(new URL(document.referrer).origin+" (pelo referrer; navegador sem ancestorOrigins)")}catch(e){}}
  var ul=document.getElementById("chain");
  if(window.self===window.top){ul.innerHTML="<li>Nenhuma: esta página foi aberta direto, não dentro de um iframe.</li>";}
  var bad=[];
  chain.forEach(function(o){var origin=o.split(" ")[0];var ok=matches(origin);if(!ok)bad.push(origin);
    ul.innerHTML+='<li class="'+(ok?"ok":"bad")+'">'+(ok?"✔ ":"✘ ")+"<code>"+esc(o)+"</code>"+(ok?"":" — fora da lista")+"</li>";});
  document.getElementById("allowed").innerHTML=d.allowed.length?d.allowed.map(function(a){return "<li><code>"+esc(a)+"</code></li>"}).join(""):"<li>(vazia: ninguém de fora pode embutir)</li>";
  if(d.invalid.length)document.getElementById("invalid").innerHTML='<p class="bad">Valores ignorados por estarem mal escritos: '+d.invalid.map(function(a){return "<code>"+esc(a)+"</code>"}).join(", ")+"</p>";
  var v=document.getElementById("verdict");
  if(window.self===window.top){v.textContent="Abra esta URL dentro do iframe do ERP para ver a cadeia.";}
  else if(!bad.length){v.innerHTML='<span class="ok">✔ Todas as origens estão liberadas: o Vocero deve abrir neste quadro.</span>';}
  else{var all=d.allowed.concat(bad.filter(function(b,i){return bad.indexOf(b)===i}));
    v.innerHTML='<span class="bad">✘ O Vocero será recusado aqui.</span> Acrescente na stack:<p><code>EMBED_ALLOWED_ORIGINS='+esc(all.join(","))+"</code></p>";}
})();
</script></body></html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
