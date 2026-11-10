<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" isELIgnored="false" %>

<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fechamento de Viagens</title>
<script src="https://cdn.jsdelivr.net/gh/wansleynery/SankhyaJX@d097c255290321100dac9ba435b048f21ed46ad4/jx.min.js"
        integrity="sha384-otm8oUVTzeRLqmqI9HBn5SMNoQoEWe9vZsO7NGWVd4/gTB2h8akzNLthHYG0nbSw"
        crossorigin="anonymous"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap">
<style>
button.gwt-Button.chartConfigButton,button.chartConfigButton{display:none !important}
#dx{
  --color--ocean-green-800:#00523C;--color--ocean-green-700:#00684C;--color--ocean-green-600:#008561;
  --color--ocean-green-400:#42A58A;--color--ocean-green-100:#BDDFD6;--color--ocean-green-90:#E6F3EF;
  --color--petroleum-900:#141B27;--color--petroleum-800:#1B2434;--color--petroleum-700:#222D42;--color--petroleum-600:#2B3A54;
  --color--petroleum-500:#404E65;--color--petroleum-400:#626D80;--color--petroleum-300:#848D9C;
  --color--petroleum-100:#C8CCD3;--color--petroleum-90:#EAEBEE;--color--petroleum-80:#F4F6F9;
  --color--gray-80:#F9F9F9;--color--gray-70:#FFFFFF;
  --color--green-600:#157A00;--color--yellow-700:#BF8E02;--color--red-500:#CA3351;
  --font--pattern:'Roboto',-apple-system,'Segoe UI',sans-serif;
  --font-size--xsmall:10px;--font-size--small:12px;--font-size--default:14px;--font-size--medium:16px;--font-size--large:18px;--font-size--xlarge:20px;
  --border--radius-small:6px;--border--radius-medium:12px;--border--radius-large:24px;

  --bg:var(--color--petroleum-90);--bg2:var(--color--petroleum-80);--card:var(--color--gray-70);--card2:#F5F7F7;
  --bd:var(--color--petroleum-100);--bd2:#EDEFF2;
  --t1:var(--color--petroleum-500);--t2:var(--color--petroleum-400);--t3:var(--color--petroleum-300);
  --accent:var(--color--ocean-green-600);--accentL:var(--color--ocean-green-90);--accentH:var(--color--ocean-green-800);
  --topbar:var(--color--gray-80);--ghead:#F5F7F7;--ghbd:#BDC3C7;--ghover:var(--color--ocean-green-100);--brandp:var(--color--petroleum-600);
  --pos:var(--color--green-600);--neg:var(--color--red-500);--warn:var(--color--yellow-700);
  --font:var(--font--pattern);
  --sh:0 1px 2px rgba(16,24,40,.06),0 6px 20px rgba(16,24,40,.08);
}
#dx.theme-dark{
  --bg:var(--color--petroleum-900);--bg2:var(--color--petroleum-800);--card:var(--color--petroleum-700);--card2:#283450;
  --bd:#33415c;--bd2:#2b3852;
  --t1:var(--color--petroleum-80);--t2:#cbd3e1;--t3:#8b96ac;
  --accent:var(--color--ocean-green-400);--accentL:rgba(0,133,97,.20);--accentH:var(--color--ocean-green-100);
  --topbar:var(--color--petroleum-800);--ghead:#283450;--ghbd:#33415c;--ghover:#2c3850;
  --pos:#5fcf9c;--neg:#E599A8;--warn:#F5D068;
  --sh:0 1px 3px rgba(0,0,0,.35),0 4px 18px rgba(0,0,0,.22);
}
* { box-sizing: border-box; }
html, body { height: 100vh; margin: 0; overflow: hidden; }
#dx{font-family:var(--font);background:var(--bg);color:var(--t1);height:100vh;font-size:var(--font-size--default);line-height:1.43;display:flex;flex-direction:column}
#dx button{font-family:var(--font)}
#dx [hidden]{display:none !important}

/* topo */
#dx header{position:sticky;top:0;z-index:30;background:var(--topbar);border-bottom:1px solid var(--bd);padding:8px 16px;display:flex;align-items:center;gap:12px}
#dx .brand{display:flex;align-items:center;gap:10px;min-width:0}
#dx .brand .brand-logo{height:34px;max-width:130px;object-fit:contain;flex:none}
#dx.theme-dark .brand .brand-logo{background:#fff;border-radius:var(--border--radius-small);padding:2px 6px}
#dx .brand .ic{width:32px;height:32px;border-radius:var(--border--radius-small);background:var(--brandp);display:grid;place-items:center;color:#fff;flex:none}
#dx .brand h1{font-size:var(--font-size--medium);font-weight:600;margin:0;white-space:nowrap;color:var(--t1)}
#dx .brand small{display:block;font-size:var(--font-size--xsmall);color:var(--t3);letter-spacing:.3px;text-transform:uppercase;font-weight:700}
#dx .sp{flex:1 1 auto}
#dx .cfg{font-size:var(--font-size--small);color:var(--t3);white-space:nowrap}
#dx .cfg b{color:var(--t2)}
#dx .iconbtn{position:relative;border:1px solid var(--bd);background:var(--card);color:var(--t2);width:32px;height:32px;border-radius:var(--border--radius-small);cursor:pointer;display:grid;place-items:center}
#dx .iconbtn:hover{color:var(--t1);border-color:var(--accent)}
#dx .iconbtn.on{color:var(--accent);border-color:var(--accent);background:var(--accentL)}
#dx .fbadge{position:absolute;top:-5px;right:-5px;min-width:16px;height:16px;border-radius:999px;background:var(--accent);color:#fff;font-size:var(--font-size--xsmall);font-weight:800;display:none;align-items:center;justify-content:center;padding:0 4px;line-height:1}
#dx .fbadge.on{display:inline-flex}

/* gaveta de filtros */
#dx .body{flex:1;display:flex;min-height:0;position:relative}
#dx .fdrawer{position:fixed;left:0;top:49px;bottom:0;width:272px;background:var(--bg2);border-right:1px solid var(--bd);box-shadow:2px 0 16px rgba(0,0,0,.18);z-index:40;display:flex;flex-direction:column;transform:translateX(-100%);transition:transform .25s ease}
#dx .fdrawer.open{transform:none}
#dx .fd-hd{padding:12px 16px;font-weight:700;border-bottom:1px solid var(--bd)}
#dx .fd-body{padding:16px;display:flex;flex-direction:column;gap:14px;overflow:auto;flex:1}
#dx .fd-group{display:flex;flex-direction:column;gap:4px}
#dx .fd-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#dx .fd-lb{font-size:var(--font-size--xsmall);font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--t3)}
#dx .fd-body input,#dx .fd-body select{width:100%;font-family:var(--font);font-size:var(--font-size--default);padding:8px;border:1px solid var(--bd);border-radius:var(--border--radius-small);background:var(--card);color:var(--t1)}
#dx .fd-chk{display:flex;align-items:center;gap:8px;font-size:var(--font-size--small);color:var(--t2);cursor:pointer}
#dx .fd-chk input{width:auto}
#dx .fd-foot{display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--bd)}
#dx .fd-apply{flex:1;height:38px;border:0;border-radius:var(--border--radius-small);background:var(--accent);color:#fff;font-weight:700;cursor:pointer}
#dx .fd-apply:hover{background:var(--accentH)}
#dx .fd-ghost{height:38px;padding:0 12px;border:1px solid var(--bd);border-radius:var(--border--radius-small);background:var(--card);color:var(--t2);cursor:pointer}

/* conteúdo */
#dx main{flex:1;min-width:0;display:flex;flex-direction:column;padding:16px;gap:14px;overflow:auto}
#dx .kpis{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:12px}
#dx .kpi{background:var(--card);border:1px solid var(--bd);border-radius:var(--border--radius-medium);padding:12px 14px;box-shadow:var(--sh);cursor:pointer;position:relative;overflow:hidden;transition:transform .12s,border-color .12s;text-align:left;color:inherit}
#dx .kpi:hover{transform:translateY(-1px);border-color:var(--accent)}
#dx .kpi.on{border-color:var(--accent);background:var(--accentL)}
#dx .kpi::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--k,var(--accent))}
#dx .kpi .lb{font-size:var(--font-size--xsmall);font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--t3)}
#dx .kpi .vl{font-size:26px;font-weight:700;line-height:1.2;margin-top:2px;font-variant-numeric:tabular-nums}
#dx .kpi .sub{font-size:var(--font-size--small);color:var(--t2)}
#dx .k-acao{--k:var(--neg)} #dx .k-and{--k:var(--warn)} #dx .k-fin{--k:#3b82f6} #dx .k-ok{--k:var(--pos)} #dx .k-vlr{--k:var(--brandp)}

#dx .card{background:var(--card);border:1px solid var(--bd);border-radius:var(--border--radius-medium);box-shadow:var(--sh);display:flex;flex-direction:column;min-height:0}
#dx .lista{flex:1;min-height:280px}
#dx .bar{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--bd2);flex-wrap:wrap}
#dx .bar h2{font-size:var(--font-size--default);margin:0 8px 0 0}
#dx .chips{display:flex;gap:6px;flex-wrap:wrap}
#dx .chip{border:1px solid var(--bd);background:var(--card);color:var(--t2);border-radius:999px;padding:4px 12px;font-size:var(--font-size--small);cursor:pointer;font-weight:500}
#dx .chip:hover{border-color:var(--accent);color:var(--t1)}
#dx .chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
#dx .chip .n{opacity:.75;margin-left:4px;font-variant-numeric:tabular-nums}
#dx .busca{margin-left:auto;position:relative}
#dx .busca input{width:260px;padding:7px 10px 7px 30px;border:1px solid var(--bd);border-radius:var(--border--radius-small);background:var(--card);color:var(--t1);font-family:var(--font)}
#dx .busca svg{position:absolute;left:9px;top:9px;color:var(--t3)}
#dx .tbl{overflow:auto;flex:1;min-height:0}
#dx table{border-collapse:collapse;width:100%;font-size:var(--font-size--small)}
#dx thead{position:sticky;top:0;z-index:2}
#dx thead th{background:var(--ghead);color:var(--t1);font-weight:700;text-align:left;padding:8px 10px;border-bottom:1px solid var(--ghbd);white-space:nowrap;cursor:pointer;user-select:none}
#dx thead th:hover,#dx thead th.sorted{color:var(--accent)}
#dx tbody td{padding:8px 10px;border-bottom:1px solid var(--bd2);vertical-align:middle}
#dx tbody tr{cursor:pointer}
#dx tbody tr:hover td{background:var(--ghover)}
#dx tbody tr.sel td{background:var(--accentL)}
#dx td.num,#dx th.num{text-align:right;font-variant-numeric:tabular-nums}
#dx td.empty{text-align:center;color:var(--t3);padding:32px;cursor:default}
#dx .mot{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--t2)}
#dx .doc b{display:block;color:var(--t1)}
#dx .doc span{color:var(--t3);font-size:var(--font-size--xsmall)}
#dx .skl{position:relative;overflow:hidden;background:var(--bd2);border-radius:var(--border--radius-small);height:26px;margin:6px 10px}
#dx .skl::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);animation:sklsh 1.2s infinite}
@keyframes sklsh{from{transform:translateX(-100%)}to{transform:translateX(100%)}}

/* pílulas */
#dx .pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:2px 10px;font-size:var(--font-size--xsmall);font-weight:700;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap;border:1px solid transparent}
#dx .pill::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
#dx .p-acao{color:var(--neg);background:rgba(202,51,81,.10);border-color:rgba(202,51,81,.25)}
#dx .p-and{color:var(--warn);background:rgba(191,142,2,.10);border-color:rgba(191,142,2,.28)}
#dx .p-fin{color:#2f6fd6;background:rgba(59,130,246,.10);border-color:rgba(59,130,246,.28)}
#dx .p-ok{color:var(--pos);background:rgba(21,122,0,.10);border-color:rgba(21,122,0,.25)}
#dx .p-neu{color:var(--t3);background:var(--bd2);border-color:var(--bd)}
#dx .prazo{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
#dx .prazo.ok{color:var(--pos)} #dx .prazo.alerta{color:var(--warn)} #dx .prazo.venc{color:var(--neg)} #dx .prazo.na{color:var(--t3);font-weight:400}

/* painel de detalhe */
#dx .area{flex:1;display:flex;gap:14px;min-height:0}
#dx .area .lista{flex:1;min-width:0}
#dx .det{display:none;flex:0 0 min(720px,58%);min-width:0;flex-direction:column;background:var(--bg2);border:1px solid var(--bd);border-radius:var(--border--radius-medium);box-shadow:var(--sh);overflow:hidden;animation:detIn .18s ease}
#dx .det.open{display:flex}
@keyframes detIn{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}
/* com o detalhe aberto a lista fica enxuta: some motivo, data do desacordo e substituto */
#dx .area.comdet #tblCasos th:nth-child(5),#dx .area.comdet #tblCasos td:nth-child(5),
#dx .area.comdet #tblCasos th:nth-child(6),#dx .area.comdet #tblCasos td:nth-child(6),
#dx .area.comdet #tblCasos th:nth-child(8),#dx .area.comdet #tblCasos td:nth-child(8){display:none}
#dx .area.comdet .busca input{width:200px}
#dx td.num{white-space:nowrap}
#dx main.detaberto{gap:10px}
#dx main.detaberto .kpi{padding:7px 12px}
#dx main.detaberto .kpi .sub{display:none}
#dx main.detaberto .kpi .vl{font-size:18px;margin-top:0}
#dx main.detaberto .kpi .vl#kVlr{font-size:16px !important}
#dx .area.comdet .bar h2{display:none}
#dx tbody tr.sel td{box-shadow:inset 0 0 0 0 transparent}
#dx tbody tr.sel td:first-child{box-shadow:inset 4px 0 0 var(--accent)}
#dx .det-hd{padding:14px 18px;border-bottom:1px solid var(--bd);background:var(--card);flex:none;display:flex;gap:12px;align-items:flex-start}
#dx .det-hd h2{margin:0;font-size:var(--font-size--large)}
#dx .det-hd .meta{color:var(--t3);font-size:var(--font-size--small);margin-top:2px}
#dx .det-body{flex:1;overflow:auto;padding:16px 18px;display:flex;flex-direction:column;gap:14px}
#dx .det-ft{flex:none;padding:12px 18px;border-top:1px solid var(--bd);background:var(--card);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
#dx .sec{background:var(--card);border:1px solid var(--bd);border-radius:var(--border--radius-medium);padding:14px}
#dx .sec h3{margin:0 0 10px;font-size:var(--font-size--xsmall);text-transform:uppercase;letter-spacing:.5px;color:var(--t3);display:flex;align-items:center;gap:8px}
#dx .sec h3 .lnk{margin-left:auto;text-transform:none;letter-spacing:0;font-weight:500}
#dx .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 16px}
#dx .grid .f .l{font-size:var(--font-size--xsmall);color:var(--t3);font-weight:700;text-transform:uppercase;letter-spacing:.3px}
#dx .grid .f .v{color:var(--t1);word-break:break-word}
#dx .grid .f.w2{grid-column:span 2}
#dx .rot-ed input,#dx .rot-ed select{width:100%;padding:6px 8px;border:1px solid var(--bd);border-radius:var(--border--radius-small);background:var(--card);color:var(--t1);font-family:var(--font);font-size:var(--font-size--default)}
#dx .rot-ed input:focus,#dx .rot-ed select:focus{outline:2px solid var(--accentL);border-color:var(--accent)} #dx .grid .f.w3{grid-column:1/-1}
#dx .motivo{font-size:var(--font-size--medium);font-weight:600;color:var(--t1);background:var(--card2);border-left:4px solid var(--neg);padding:10px 12px;border-radius:var(--border--radius-small);margin-bottom:12px}
#dx .chave{font-family:ui-monospace,Consolas,monospace;font-size:var(--font-size--small);letter-spacing:.3px}
#dx .lnk{color:var(--accent);cursor:pointer;background:none;border:0;padding:0;font-size:inherit;text-decoration:underline;text-underline-offset:2px}
#dx .lnk:hover{color:var(--accentH)}
#dx .aviso{border-radius:var(--border--radius-small);padding:10px 12px;font-size:var(--font-size--small);border:1px solid}
#dx .aviso.erro{background:rgba(202,51,81,.08);border-color:rgba(202,51,81,.3);color:var(--neg)}
#dx .aviso.info{background:var(--accentL);border-color:var(--ghover);color:var(--t1)}
#dx .aviso.alerta{background:rgba(191,142,2,.08);border-color:rgba(191,142,2,.3);color:var(--t1)}

/* linha do tempo */
#dx .steps{display:grid;grid-template-columns:repeat(5,1fr);gap:0;position:relative}
#dx .step{text-align:center;position:relative;padding-top:2px}
#dx .step::before{content:'';position:absolute;top:15px;left:-50%;width:100%;height:3px;background:var(--bd)}
#dx .step:first-child::before{display:none}
#dx .step.done::before,#dx .step.cur::before{background:var(--accent)}
#dx .step .dot{width:30px;height:30px;border-radius:50%;margin:0 auto;display:grid;place-items:center;background:var(--card);border:2px solid var(--bd);color:var(--t3);position:relative;z-index:1;font-weight:700;font-size:var(--font-size--small)}
#dx .step.done .dot{background:var(--accent);border-color:var(--accent);color:#fff}
#dx .step.cur .dot{border-color:var(--accent);color:var(--accent);box-shadow:0 0 0 4px var(--accentL)}
#dx .step.err .dot{border-color:var(--neg);color:var(--neg);box-shadow:0 0 0 4px rgba(202,51,81,.12)}
#dx .step .t{font-size:var(--font-size--small);font-weight:600;margin-top:6px;color:var(--t1)}
#dx .step .s{font-size:var(--font-size--xsmall);color:var(--t3)}

#dx .mini{width:100%;font-size:var(--font-size--small)}
#dx .mini th{background:var(--ghead);padding:6px 8px;text-align:left;border-bottom:1px solid var(--ghbd);cursor:default}
#dx .mini td{padding:6px 8px;border-bottom:1px solid var(--bd2)}
#dx .mini tr{cursor:default}
#dx .mini tr:hover td{background:transparent}
#dx .mini .grp td{background:var(--card2);font-weight:700;color:var(--t2)}

/* botões */
#dx .btn{height:36px;padding:0 14px;border-radius:var(--border--radius-small);border:1px solid var(--bd);background:var(--card);color:var(--t1);font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;font-size:var(--font-size--small)}
#dx .btn:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}
#dx .btn.pri{background:var(--accent);border-color:var(--accent);color:#fff}
#dx .btn.pri:hover:not(:disabled){background:var(--accentH);border-color:var(--accentH);color:#fff}
#dx .btn:disabled{opacity:.45;cursor:not-allowed}
#dx .btn .spin{width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:rot .7s linear infinite;display:none}
#dx .btn.busy .spin{display:inline-block}
@keyframes rot{to{transform:rotate(360deg)}}
#dx .ft-msg{font-size:var(--font-size--small);color:var(--t3);flex:1 1 220px}

/* diálogos e aviso */
#dx dialog{border:1px solid var(--bd);border-radius:var(--border--radius-medium);background:var(--card);color:var(--t1);box-shadow:var(--sh);padding:18px;width:min(520px,calc(100vw - 32px));font-family:var(--font)}
#dx dialog::backdrop{background:rgba(20,27,39,.45)}
#dx dialog h2{font-size:var(--font-size--medium);margin:0 0 6px}
#dx dialog p{margin:0 0 12px;color:var(--t2);white-space:pre-line}
#dx .dlg-bt{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
#dx pre.xml{background:var(--card2);border:1px solid var(--bd2);border-radius:var(--border--radius-small);padding:12px;max-height:60vh;overflow:auto;font-size:12px;white-space:pre-wrap;word-break:break-all;margin:0}
#dx .toast{position:fixed;right:16px;top:58px;z-index:80;max-width:480px;cursor:pointer;padding:10px 14px;border-radius:var(--border--radius-small);background:var(--color--petroleum-600);color:#fff;box-shadow:var(--sh);display:none;white-space:pre-line}
#dx .toast.show{display:block}
#dx .toast.erro{background:var(--color--red-500)}

@media (max-width:1100px){#dx .kpis{grid-template-columns:repeat(3,1fr)}#dx .grid{grid-template-columns:repeat(2,1fr)}}

/* ---- fechamento de viagens ---- */
#dx .kpis{grid-template-columns:repeat(6,minmax(130px,1fr))}
#dx .k-doc{--k:var(--neg)} #dx .k-aft{--k:#c2410c} #dx .k-apt{--k:var(--warn)} #dx .k-pronta{--k:#3b82f6} #dx .k-saldo{--k:#7c3aed} #dx .k-ok{--k:var(--pos)}
#dx .p-aft{color:#c2410c;background:rgba(194,65,12,.10);border-color:rgba(194,65,12,.28)}
#dx .p-saldo{color:#7c3aed;background:rgba(124,58,237,.10);border-color:rgba(124,58,237,.28)}
#dx .trilha{display:inline-flex;gap:3px;vertical-align:middle}
#dx .trilha i{width:14px;height:6px;border-radius:3px;background:var(--bd);display:block}
#dx .trilha i.ok{background:var(--pos)} #dx .trilha i.pend{background:var(--neg)} #dx .trilha i.na{background:var(--bd2)}
#dx .steps{grid-template-columns:repeat(6,1fr)}
#dx .pend-lst{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
#dx .pend-lst li{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:var(--border--radius-small);background:rgba(202,51,81,.06);border:1px solid rgba(202,51,81,.22)}
#dx .pend-lst li.av{background:rgba(191,142,2,.07);border-color:rgba(191,142,2,.28)}
#dx .pend-lst li b{display:block;color:var(--t1)}
#dx .pend-lst li span{color:var(--t2);font-size:var(--font-size--small)}
#dx .pend-lst .n{flex:none;width:22px;height:22px;border-radius:50%;background:var(--neg);color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700}
#dx .pend-lst li.av .n{background:var(--warn)}
#dx .tudo-ok{padding:10px 12px;border-radius:var(--border--radius-small);background:rgba(21,122,0,.08);border:1px solid rgba(21,122,0,.25);color:var(--pos);font-weight:600}
#dx .ck{font-weight:700;white-space:nowrap}
#dx .docs{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
#dx .docs .dgrp{grid-column:1/-1;font-size:var(--font-size--small);font-weight:700;color:var(--t2);margin-top:2px}
#dx .doc-c{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--bd);border-radius:var(--border--radius-small);background:var(--card);text-align:left;font-family:var(--font);color:var(--t1)}
#dx button.doc-c{cursor:pointer}
#dx button.doc-c:hover{border-color:var(--accent);box-shadow:0 0 0 3px var(--accentL)}
#dx .doc-c .di{width:34px;height:34px;border-radius:8px;display:grid;place-items:center;flex:none;background:rgba(21,122,0,.10);color:var(--pos)}
#dx .doc-c.falta{border-color:rgba(202,51,81,.35);background:rgba(202,51,81,.05)} #dx .doc-c.falta .di{background:rgba(202,51,81,.12);color:var(--neg)}
#dx .doc-c.opc{opacity:.65} #dx .doc-c.opc .di{background:var(--bd2);color:var(--t3)}
#dx .doc-c b{display:block;font-size:var(--font-size--small)}
#dx .cb{border:1px solid var(--bd);border-radius:var(--border--radius-medium);margin-bottom:10px;overflow:hidden}
#dx .cb-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;background:var(--card2);border-bottom:1px solid var(--bd2)}
#dx .cb-h b{display:block;color:var(--t1)}
#dx .cb-h span{font-size:var(--font-size--small);color:var(--t3)}
#dx .cb-h .btn{height:30px}
#dx .cb-docs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:10px 12px}
#dx .dt{display:flex;flex-direction:column;gap:6px;padding:10px;border:1px solid var(--bd);border-radius:var(--border--radius-small);background:var(--card)}
#dx .dt-h{display:flex;align-items:center;gap:8px}
#dx .dt-h b{font-size:var(--font-size--small);color:var(--t1);line-height:1.2}
#dx .dt .di{width:26px;height:26px;border-radius:6px;display:grid;place-items:center;flex:none;background:var(--bd2);color:var(--t3);font-weight:700}
#dx .dt.ok{border-color:rgba(21,122,0,.35)} #dx .dt.ok .di{background:rgba(21,122,0,.12);color:var(--pos)}
#dx .dt.falta{border-color:rgba(202,51,81,.4);background:rgba(202,51,81,.04)} #dx .dt.falta .di{background:rgba(202,51,81,.12);color:var(--neg)}
#dx .dt-s{font-size:var(--font-size--xsmall);color:var(--t3)}
#dx .dt.falta .dt-s{color:var(--neg);font-weight:600}
#dx .dt .btn{height:30px;justify-content:center;width:100%;margin-top:auto}
#dx .dt .imp{color:var(--accent);border-color:var(--accent);cursor:pointer;display:inline-flex;align-items:center}
#dx .dt .imp:hover{background:var(--accentL)}
#dx .dt .imp.busy{opacity:.6;pointer-events:none}
#dx .dt-b{display:flex;gap:6px;margin-top:auto}
#dx .dt-b .btn{flex:1}
#dx .dt .del{color:var(--neg);border-color:rgba(202,51,81,.4)}
#dx .dt .del:hover:not(:disabled){background:rgba(202,51,81,.08);color:var(--neg);border-color:var(--neg)}
#dx .doc-c .imp{height:28px;flex:none;color:var(--accent);border-color:var(--accent);cursor:pointer}
#dx .doc-c .imp:hover{background:var(--accentL)}
#dx .doc-c .imp.busy{opacity:.6;pointer-events:none}
#dx .doc-c span{font-size:var(--font-size--xsmall);color:var(--t3)}
#dx .doc-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
#dx .det .sec{overflow-x:auto;flex:none}
#dx .ck.ok{color:var(--pos)} #dx .ck.falta{color:var(--neg)} #dx .ck.na{color:var(--t3);font-weight:400}
#dx .resumo{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
#dx .resumo div{background:var(--card2);border-radius:var(--border--radius-small);padding:8px 10px}
#dx .resumo .l{font-size:var(--font-size--xsmall);color:var(--t3);font-weight:700;text-transform:uppercase}
#dx .resumo .v{font-size:var(--font-size--medium);font-weight:700;font-variant-numeric:tabular-nums}
#dx details.campos{margin-top:10px}
#dx details.campos summary{cursor:pointer;color:var(--accent);font-size:var(--font-size--small)}
#dx details.campos .kv{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 14px;margin-top:8px;font-size:var(--font-size--small)}
#dx details.campos .kv span{color:var(--t3);font-size:var(--font-size--xsmall);font-weight:700;display:block}
#dx .idade{font-weight:700;font-variant-numeric:tabular-nums}
#dx .idade.ok{color:var(--pos)} #dx .idade.alerta{color:var(--warn)} #dx .idade.venc{color:var(--neg)}
@media (max-width:1250px){#dx .kpis{grid-template-columns:repeat(3,1fr)}}
/* ---- tema Fibraforte (mesmo padrão do dash Formação de Duplicatas) ---- */
#dx{
  --fibra--azul-800:#004A82;--fibra--azul-600:#0068B5;--fibra--azul-500:#2A7FC2;--fibra--azul-300:#6FA8DA;
  --fibra--azul-100:#CCE0F1;--fibra--azul-90:#E8F1FA;--fibra--verde-600:#8AAA00;--fibra--verde-400:#A9C43D;
  --accent:var(--fibra--azul-600);--accentL:var(--fibra--azul-90);--accentH:var(--fibra--azul-800);--brand2:var(--fibra--verde-600);
  --topbar:var(--color--gray-70);--ghover:var(--fibra--azul-100)
}
#dx.theme-dark{--accent:var(--fibra--azul-300);--accentL:rgba(0,104,181,.22);--accentH:var(--fibra--azul-100);--brand2:var(--fibra--verde-400);--topbar:var(--color--petroleum-800);--ghover:#2c3850}
#dx.theme-dark .btn.pri,#dx.theme-dark .fd-apply,#dx.theme-dark .chip.on{color:var(--color--petroleum-900)}
#dx header{border-bottom:3px solid var(--brand2);padding:6px 16px;flex-wrap:wrap}
#dx .brand{gap:12px}
#dx .brand .logo{height:44px;width:auto;border-radius:var(--border--radius-small);flex:none}
#dx .brand .tit{display:flex;flex-direction:column;padding-left:12px;border-left:1px solid var(--bd)}
#dx .brand .tit h1{font-size:var(--font-size--medium);font-weight:600;margin:0;white-space:nowrap;color:var(--accent)}
#dx .brand .eyebrow{font-size:var(--font-size--xsmall);font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--t3)}
#dx .kcs{display:flex;flex-wrap:wrap;gap:8px;align-items:stretch}
#dx .kc{display:flex;flex-direction:column;justify-content:center;min-width:108px;padding:4px 12px;border:1px solid var(--bd);border-radius:var(--border--radius-small);background:var(--card);color:var(--t1);font-family:var(--font);text-align:left;cursor:pointer}
#dx .kc:hover{border-color:var(--accent)}
#dx .kc.on{border-color:var(--accent);background:var(--accentL);box-shadow:inset 3px 0 0 var(--brand2)}
#dx .kc .lb{font-size:var(--font-size--xsmall);font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--t3);white-space:nowrap}
#dx .kc .vl{font-size:var(--font-size--medium);font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
#dx .kc .qt{font-size:var(--font-size--xsmall);color:var(--t3);white-space:nowrap}
#dx .kc.neg .vl{color:var(--neg)} #dx .kc.warn .vl{color:var(--warn)} #dx .kc.dest .vl{color:var(--accent)} #dx .kc.ok .vl{color:var(--pos)} #dx .kc.roxo .vl{color:#7c3aed}
#dx.theme-dark .kc.roxo .vl{color:#b79cf5}
#dx .icons{display:flex;gap:6px}
#dx [data-tip]{position:relative}
#dx [data-tip]:hover::after,#dx [data-tip]:focus-visible::after{content:attr(data-tip);position:absolute;top:calc(100% + 6px);right:0;z-index:80;background:var(--color--petroleum-700);color:#fff;font-size:var(--font-size--small);font-weight:500;padding:4px 8px;border-radius:var(--border--radius-small);white-space:nowrap;pointer-events:none;box-shadow:var(--sh)}
#dx .fbar{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px;background:var(--card);border:1px solid var(--bd);border-radius:var(--border--radius-medium);box-shadow:var(--sh);padding:10px 16px;flex:none}
#dx .fbar input[type=date],#dx .fbar input[type=text]{height:34px;font-family:var(--font);font-size:var(--font-size--default);padding:0 8px;border:1px solid var(--bd);border-radius:var(--border--radius-small);background:var(--card);color:var(--t1)}
#dx .fbar input.cod{width:110px}
#dx .fbar input:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:var(--accent)}
#dx .fbar .fd-chk{height:34px}
#dx .fbar .fd-apply{flex:none;height:34px;padding:0 16px;font-size:var(--font-size--small)}
#dx .fbar .fd-ghost{height:34px}
#dx .fbar .cfg{margin-left:auto;align-self:center}
#dx main{padding:12px 16px 16px}
#dx .btn.wa{background:#25D366;border-color:#25D366;color:#fff}
#dx .btn.wa:hover:not(:disabled){background:#1da851;border-color:#1da851;color:#fff}
#dx .wa-ic{color:#1da851;display:inline-flex;vertical-align:middle;cursor:pointer;background:none;border:0;padding:0 2px}
#dx .peso-f{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) auto auto;gap:10px;align-items:end}
#dx .peso-f label{display:flex;flex-direction:column;gap:4px;font-size:var(--font-size--xsmall);font-weight:700;text-transform:uppercase;color:var(--t3)}
#dx .peso-f select,#dx .peso-f input{height:34px;padding:0 8px;border:1px solid var(--bd);border-radius:var(--border--radius-small);background:var(--card);color:var(--t1);font-family:var(--font);font-size:var(--font-size--default);text-transform:none;font-weight:400}
#dx .peso-f input.num{text-align:right}
#dx .peso-f .btn{height:34px}
#dx .sim{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:12px}
#dx .sim>div{background:var(--card2);border-radius:var(--border--radius-small);padding:8px 10px}
#dx .sim .l{font-size:var(--font-size--xsmall);color:var(--t3);font-weight:700;text-transform:uppercase}
#dx .sim .v{font-size:var(--font-size--medium);font-weight:700;font-variant-numeric:tabular-nums}
#dx .sim .v.neg{color:var(--neg)} #dx .sim .v.pos{color:var(--pos)}
#dx .sim>.dest{background:var(--accentL)}
@media (max-width:1100px){#dx .peso-f{grid-template-columns:1fr 1fr}#dx .sim{grid-template-columns:1fr 1fr}}
/* ---- layout empilhado: lista em cima (altura ajustável) e detalhe embaixo ---- */
#dx .area{flex-direction:column;gap:0}
#dx .area .lista{flex:1 1 auto;min-height:120px}
#dx .area.comdet .lista{flex:0 0 var(--hLista,260px)}
#dx .alca{display:none;flex:none;height:14px;cursor:ns-resize;align-items:center;justify-content:center;user-select:none;touch-action:none}
#dx .area.comdet .alca{display:flex}
#dx .alca span{width:52px;height:4px;border-radius:2px;background:var(--bd);transition:background .15s}
#dx .alca:hover span,#dx .alca.arr span{background:var(--accent)}
#dx .det{flex:1 1 auto !important;min-height:240px}
#dx .det-body{display:grid !important;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-flow:row dense;align-content:start;gap:12px 14px}
#dx .det-body>.sec{margin:0;min-width:0;min-height:max-content}
#dx .det-body{grid-auto-rows:max-content}
#dx .det-body>.sec.full,#dx .det-body>.aviso,#dx .det-body>div:not(.sec){grid-column:1/-1}
#dx .det-hd .acoes{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
#dx .det-hd .acoes .btn{height:32px}
#dx .det-ft{display:none !important}
@media (max-width:1100px){#dx .det-body{grid-template-columns:minmax(0,1fr)}}
/* ---- detalhe em janela do tamanho da tela (sobre a lista) ---- */
#dx .area.comdet .lista{flex:1 1 auto !important}
#dx .alca{display:none !important}
#dx .det.open{position:fixed;inset:10px;z-index:90;box-shadow:0 12px 48px rgba(15,23,42,.28);animation:popIn .16s ease}
#dx .area.comdet::before{content:"";position:fixed;inset:0;background:rgba(15,23,42,.38);z-index:89;cursor:pointer}
#dx .toast{z-index:200}
@keyframes popIn{from{opacity:0;transform:scale(.985)}to{opacity:1;transform:none}}
</style>
</head>
<body>
<div id="dx">

  <header>
    <div class="brand">
      <img class="logo" alt="Fibraforte" src="data:image/jpeg;base64,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">
      <div class="tit"><span class="eyebrow" title="Vers&atilde;o do painel">TMS &middot; Canhotos, apontamento e saldo de frete &middot; v08.11-19</span><h1>Fechamento de Viagens</h1></div>
    </div>
    <div class="kcs" aria-label="Indicadores">
      <button type="button" class="kc neg" data-grupo="doc"><span class="lb">Faltam documentos</span><span class="vl" id="k_doc">-</span><span class="qt">CT-e ou canhotos</span></button>
      <button type="button" class="kc warn" data-grupo="aft"><span class="lb">Afretamento</span><span class="vl" id="k_aft">-</span><span class="qt">notas ou libera&ccedil;&otilde;es</span></button>
      <button type="button" class="kc warn" data-grupo="apt"><span class="lb">Apontamento</span><span class="vl" id="k_apt">-</span><span class="qt">espelho a confirmar</span></button>
      <button type="button" class="kc dest" data-grupo="pronta"><span class="lb">Prontas p/ fechar</span><span class="vl" id="k_pronta">-</span><span class="qt">nada pendente</span></button>
      <button type="button" class="kc roxo" data-grupo="saldo"><span class="lb">Saldo a pagar</span><span class="vl" id="k_saldo">-</span><span class="qt" id="k_saldoS">&nbsp;</span></button>
      <button type="button" class="kc ok" data-grupo="ok"><span class="lb">Conclu&iacute;das</span><span class="vl" id="k_ok">-</span><span class="qt">fechada e quitada</span></button>
    </div>
    <div class="sp"></div>
    <div class="icons">
      <button type="button" class="iconbtn" id="btnLimpar" data-tip="Limpar filtros" aria-label="Limpar filtros">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/><line x1="16" y1="15" x2="22" y2="21"/><line x1="22" y1="15" x2="16" y2="21"/></svg>
      </button>
      <button type="button" class="iconbtn" id="btnCsv" data-tip="Exportar a lista (Excel/CSV)" aria-label="Exportar">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="19"/><line x1="16" y1="13" x2="8" y2="19"/></svg>
      </button>
      <button type="button" class="iconbtn" id="btnAtualizar" data-tip="Atualizar" aria-label="Atualizar dados">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      </button>
      <button type="button" class="iconbtn" id="btnTema" data-tip="Tema claro/escuro" aria-label="Alternar tema claro/escuro">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
    </div>
  </header>

  <div class="body">
    <main>
      <div class="fbar">
        <div class="fd-group"><label class="fd-lb" for="fIni">CT-e emitido de</label><input type="date" id="fIni"></div>
        <div class="fd-group"><label class="fd-lb" for="fFim">At&eacute;</label><input type="date" id="fFim"></div>
        <div class="fd-group"><label class="fd-lb" for="fEmp">Empresa</label><input type="text" class="cod" id="fEmp" inputmode="numeric" placeholder="Todas" autocomplete="off"></div>
        <div class="fd-group"><label class="fd-lb" for="fViagem">Viagem</label><input type="text" class="cod" id="fViagem" inputmode="numeric" placeholder="Todas" autocomplete="off"></div>
        <label class="fd-chk"><input type="checkbox" id="fConcluidas"> Mostrar conclu&iacute;das</label>
        <button type="button" class="fd-apply" id="btnAplicar">Aplicar</button>
        <span class="cfg" id="cfgInfo"></span>
      </div>

      <div class="area" id="area">
      <section class="card lista">
        <div class="bar">
          <h2>Viagens</h2>
          <div class="chips" id="chips"></div>
          <div class="busca">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" id="busca" placeholder="Viagem, CT-e, tomador ou pendência" autocomplete="off" aria-label="Buscar">
          </div>
        </div>
        <div class="tbl">
          <table id="tblViagens">
            <thead><tr>
              <th data-col="idade">Dias</th>
              <th data-col="viagem">Viagem</th>
              <th data-col="ctes">CT-e</th>
              <th data-col="tomador">Tomador</th>
              <th data-col="trilha">Etapas</th>
              <th data-col="pend">O que falta</th>
              <th data-col="valor" class="num">Frete CT-e</th>
              <th data-col="saldo" class="num">Saldo motorista</th>
              <th data-col="grupo">Situação</th>
            </tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </section>
      <div class="alca" id="alca" title="Arraste para ajustar a altura da lista" role="separator" aria-orientation="horizontal"><span></span></div>
      <aside class="det" id="det" aria-label="Detalhe da viagem">
      <div class="det-hd">
        <div style="flex:1;min-width:0">
          <h2 id="dTitulo">Viagem</h2>
          <div class="meta" id="dMeta"></div>
        </div>
        <span id="dPill"></span>
        <button class="iconbtn" id="dFechar" title="Fechar" aria-label="Fechar detalhe">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="det-body" id="dBody"></div>
      <div class="det-ft">
        <span class="ft-msg" id="dMsg"></span>
        <button class="btn wa" id="bWhats" hidden data-tip="Abre a conversa no Vocero (mensagem pronta copiada)"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.3-.8-2.8-1.1-4.5-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.3c.2-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.1.1.6-.1 1.2z"/></svg>WhatsApp motorista</button>
        <button class="btn" id="bCallCenter" hidden>Abrir Call Center</button>
        <button class="btn" id="bViagem">Abrir viagem</button>
        <button class="btn pri" id="bFechamento" hidden>Abrir fechamento</button>
      </div>
      </aside>
      </div>
    </main>
  </div>

  <dialog id="dlgConfirma" aria-labelledby="cTitulo">
    <form method="dialog">
      <h2 id="cTitulo"></h2>
      <p id="cTexto"></p>
      <div class="dlg-bt"><button class="btn" value="nao">Cancelar</button><button class="btn pri" value="sim">Confirmar</button></div>
    </form>
  </dialog>

  <dialog id="dlgDoc" aria-labelledby="docTitulo" style="width:min(980px,calc(100vw - 48px))">
    <h2 id="docTitulo">Documento</h2>
    <div class="doc-tabs" id="docTabs"></div><div id="docCorpo" style="margin:10px 0"></div>
    <div class="dlg-bt"><a class="btn" id="docBaixar" hidden style="text-decoration:none">Baixar</a><button class="btn pri" id="docFechar">Fechar</button></div>
  </dialog>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>
</div>

<script>
/* ============================================================
   Fechamento de Viagens (TMS) - o que falta para fechar e pagar
   Etapas e regras (as mesmas que travam o fechamento no banco):
    1 CT-e      TGFCAB (TOP modelo 57) com ORDEMCARGA, STATUSCTE = 'A'
    2 Canhotos  TMSPROTCAN x TMSPARQB (AD_TICKET/AD_CANHOTOCTE/AD_CANHOTONFE) - TRG_XRA_TMSFVM_UPD_VALDOC
    3 Afretam.  TMSORDAFTITE notas confirmadas + TSILIB/STATUSLIB* sem pendência - STP_CONFIRMA_APONT_ESPELHO
    4 Apontam.  TMSFVG (espelho) CONFIRMADO = 'S'
    5 Fechamento TMSFVM STATUS = 'F' (R = reaberta)
    6 Quitação  saldo de frete (TMSORDAFTITE CODTIPCOB 3 -> TGFFIN) baixado
   ============================================================ */
var nuGdg = '${param.nuGdg}';
var ST_PREFIX = 'br.com.dash.fechViagem.';
var RESOURCE_CENTRAL_NOTAS = 'br.com.sankhya.com.mov.CentralNotas';
var RESOURCE_VIAGEM = 'br.com.sankhya.soplogistica.mov.viagem';
var RESOURCE_FINANCEIRO = 'br.com.sankhya.fin.cad.movimentacaoFinanceira';
// Informe o resourceID das telas (veja na URL ao abrir a tela). Vazio = o botão não aparece.
var RESOURCE_FECHAMENTO = '';      // tela Fechamento de Viagem (TMSFVM). Chave enviada: CODFVM
var RESOURCE_CALL_CENTER = 'br.com.sankhya.soplogistica.mov.callcenter';
// Limite para pr\u00e9-visualizar a imagem do canhoto (igual ao bot\u00e3o Central de Canhotos).
var LIMITE_PREVIEW = 8 * 1024 * 1024;
// Sem nenhum apontamento lançado conta como pendência?
var EXIGE_APONTAMENTO = true;
// Período padrão (dias para trás) quando o filtro de data estiver vazio.
var DIAS_PADRAO = 60;
// Idade (dias desde a emissão do CT-e) para alerta/atraso das viagens não fechadas.
var IDADE_ALERTA = 7, IDADE_ATRASO = 15;
// Telefone do motorista (parceiro TGFORD.CODPARCMOTORISTA). Troque pela coluna certa se o celular ficar em outro campo.
var CAMPO_FONE_MOTORISTA = 'MOT.TELEFONE';
var EMPRESA_WHATSAPP = 'Fibra Forte';
// Descrições das opções de campo (TDDOPC), carregadas uma vez: status de liberação e tipo de cobrança
var OPCOES = {};
function carregarOpcoes() {
  return consultar("SELECT C.NOMETAB, C.NOMECAMPO, O.VALOR, O.OPCAO FROM TDDOPC O JOIN TDDCAM C ON C.NUCAMPO = O.NUCAMPO WHERE (C.NOMETAB = 'TMSORDAFT' AND C.NOMECAMPO LIKE 'STATUSLIB%') OR (C.NOMETAB = 'TMSORDAFTITE' AND C.NOMECAMPO = 'CODTIPCOB')")
    .then(function (r) { r.forEach(function (x) { OPCOES[x.NOMETAB + '.' + x.NOMECAMPO + '.' + String(x.VALOR).toUpperCase()] = x.OPCAO; }); })
    .catch(function () { });
}
function nomeOpcao(tab, campo, valor) { return OPCOES[tab + '.' + campo + '.' + String(valor == null ? '' : valor).toUpperCase()] || ''; }
function nomeStatusLib(c) {
  var m = { APROVAUT: 'Aprovado automaticamente', APROVADO: 'Aprovado', APROVMAN: 'Aprovado manualmente', AGUARDANDO: 'Aguardando liberação', NEGADO: 'Negado', LIBERADO: 'Liberado', NAOSOLIC: 'Não solicitado' };
  return m[c] || (c ? c.charAt(0) + c.slice(1).toLowerCase() : '');
}
var TIPOS_COBRANCA = { 3: 'Saldo de frete', 4: 'INSS', 5: 'IRRF', 6: 'SEST/SENAT' };
var STATUS_LIB_RUIM = ['AGUARDANDO', 'NEGADO'];

var VIAGENS = [], ATUAL = null, FILTRO_GRUPO = 'abertas', ORDEM = { col: 'idade', dir: -1 };
var GRUPOS = {
  doc: ['Faltam documentos', 'p-acao'], aft: ['Afretamento', 'p-aft'], apt: ['Apontamento', 'p-and'],
  pronta: ['Pronta p/ fechar', 'p-fin'], saldo: ['Saldo a pagar', 'p-saldo'], ok: ['Concluída', 'p-ok']
};
var CHIPS = [['abertas', 'Não fechadas'], ['saldo', 'Saldo a pagar'], ['reabertas', 'Reabertas'], ['todas', 'Todas']];
var ETAPAS = [['cte', 'CT-e'], ['can', 'Canhotos'], ['aft', 'Afretamento'], ['apt', 'Apontamento'], ['fech', 'Fechamento'], ['quit', 'Quitação']];

/* ---------- utilitários ---------- */
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function vazio(v) { return v == null || v === ''; }
function num(v) { if (vazio(v)) return 0; var n = Number(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; }
function fmtNum(v, c) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }); }
function fmtMoeda(v) { return 'R$ ' + fmtNum(v, 2); }
function toOracleData(iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function isoHoje(dias) { var d = new Date(); d.setDate(d.getDate() - (dias || 0)); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function diasDesde(s) { var m = /^(\d\d)\/(\d\d)\/(\d{4})/.exec(String(s || '')); if (!m) return null; var d = new Date(+m[3], +m[2] - 1, +m[1]); return Math.floor((Date.now() - d.getTime()) / 86400000); }
function idPositivo(v, nome) { var s = String(v == null ? '' : v); if (!/^\d+$/.test(s) || Number(s) <= 0) throw new Error(nome + ' inválido.'); return Number(s); }
function chave(e, o) { return e + '|' + o; }
function stGet(k) { try { return localStorage.getItem(ST_PREFIX + k); } catch (e) { return null; } }
function stSet(k, v) { try { localStorage.setItem(ST_PREFIX + k, v); } catch (e) { } }

/* ---------- acesso ao Sankhya (uma consulta por vez) ---------- */
var FILA = Promise.resolve();
function filaSankhya(tarefa) { var p = FILA.then(tarefa); var libera = function () { }; FILA = p.then(libera, libera); return p; }
function foiCancelado(e) { return /silently[_ ]cancell?ed/i.test(String(e && e.message || e || '')); }
function consultar(sql) {
  function executar(t) {
    return JX.consultar(sql).then(function (rows) { return rows || []; }).catch(function (e) {
      if (t < 3 && foiCancelado(e)) return new Promise(function (r) { setTimeout(r, 300 * (t + 1)); }).then(function () { return executar(t + 1); });
      throw e;
    });
  }
  return filaSankhya(function () { return executar(0); });
}

// Serviços que gravam (não repetem automaticamente)
var REGEX_EVENTO_PENDENTE = /clientconfirm|pergunta|solicitar|liberacao|contingencia/i;
function postarServico(modulo, servico, requestBody) {
  return filaSankhya(function () {
    return fetch('/' + modulo + '/service.sbr?serviceName=' + servico + '&outputType=json', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Accept': 'application/json' },
      body: JSON.stringify({ serviceName: servico, requestBody: requestBody })
    }).then(function (r) {
      return r.text().then(function (body) {
        var texto = String(body || '').replace(/^\uFEFF/, '').trim();
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ao chamar ' + servico + '.');
        if (texto.charAt(0) === '<') throw new Error('O Sankhya retornou uma página HTML ao chamar ' + servico + '. A sessão pode ter expirado.');
        var resp; try { resp = JSON.parse(texto); } catch (e) { throw new Error('Resposta inválida do Sankhya ao chamar ' + servico + '.'); }
        return resp;
      });
    });
  });
}
function erroServico(resp) {
  var msg = resp && resp.statusMessage ? String(resp.statusMessage) : 'Falha de comunicação com o servidor.';
  var ora = /ORA-20\d{3}:\s*([\s\S]*?)(?=\s*ORA-\d|$)/.exec(msg);
  return (ora ? ora[1] : msg).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/^\s*Regra Personalizada:\s*/i, '').trim();
}
function exigirSucesso(resp, acao) {
  if (!resp || String(resp.status) !== '1') throw new Error(acao + ': ' + erroServico(resp));
  var pend = (resp.clientEvents || []).filter(function (e) { return REGEX_EVENTO_PENDENTE.test(e.id || ''); });
  if (pend.length) throw new Error(acao + ': o Sankhya pediu uma confirmação. Conclua pela tela nativa.');
  return resp;
}
function salvarRegistro(entidade, campos, chave) {
  var localFields = {}, dataRow = { localFields: localFields, key: {} };
  Object.keys(campos).forEach(function (k) { localFields[k] = { $: String(campos[k]) }; });
  Object.keys(chave).forEach(function (k) { dataRow.key[k] = { $: String(chave[k]) }; });
  if (!Object.keys(chave).length) delete dataRow.key; // inclusão
  return postarServico('mge', 'CRUDServiceProvider.saveRecord', { dataSet: {
    rootEntity: entidade, includePresentationFields: 'N', dataRow: dataRow,
    entity: { fieldset: { list: Object.keys(campos).concat(Object.keys(chave)).join(',') } }
  } }).then(function (resp) { return exigirSucesso(resp, 'Salvar ' + entidade); });
}

/* ---------- interface básica ---------- */
function avisar(msg, erro) {
  var el = document.getElementById('toast');
  clearTimeout(avisar.t);
  el.textContent = msg;
  el.className = 'toast show' + (erro ? ' erro' : '');
  el.title = 'Clique para fechar';
  avisar.t = setTimeout(function () { el.className = 'toast'; }, erro ? 12000 : 4000);
}
function abrirTela(resourceId, pk) {
  if (!resourceId) { avisar('Tela não configurada no painel.', true); return; }
  var alvos = [];
  try { alvos.push(window.parent.dashboard[nuGdg]); } catch (e) { }
  alvos.push(window.parent);
  for (var i = 0; i < alvos.length; i++) {
    try { if (alvos[i] && typeof alvos[i].openApp === 'function') { alvos[i].openApp(resourceId, pk); return; } } catch (e) { }
  }
  avisar('Não foi possível abrir a tela (teste dentro do dashboard).', true);
}
function pkViagem(v) { return { CODEMP: String(v.CODEMP), ORDEMCARGA: String(v.ORDEMCARGA) }; }
function foneWhats(t) {
  var d = String(t || '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return /^55\d{10,11}$/.test(d) ? d : null;
}
function fmtFone(t) {
  var d = String(t || '').replace(/\D/g, '').replace(/^0+/, '').replace(/^55(?=\d{10,11}$)/, '');
  return d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7) : d.length === 10 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6) : String(t || '');
}
// Mensagem pronta: s\u00f3 o que depende do motorista (canhotos, ticket, apontamento) e o saldo
// Mensagem padrão: cobra do motorista só os documentos que faltam (ticket, canhotos)
var DOCS_MOTORISTA = ['Ticket de descarga', 'Canhoto do CT-e assinado', 'Canhoto da NF-e assinado'];
function mensagemMotorista(v) {
  var nome = String(v.ordem.NOMEMOT || '').trim().split(/\s+/)[0] || '';
  nome = nome ? nome.charAt(0) + nome.slice(1).toLowerCase() : '';
  var ctes = v.ctes.map(function (c) { return c.NUMNOTA; }).join(', ');
  var docs = v.faltaDocs && v.faltaDocs.length ? v.faltaDocs : DOCS_MOTORISTA;
  return ['Olá' + (nome ? ', ' + nome : '') + '! Aqui é da ' + EMPRESA_WHATSAPP + '.', '',
    'Para fecharmos a viagem ' + v.ORDEMCARGA + ' (CT-e ' + ctes + (v.dt ? ', emitido em ' + v.dt : '') + ') e liberar o pagamento do saldo de frete, ainda faltam:']
    .concat(docs.map(function (d) { return '\u2022 ' + d; }))
    .concat(['', 'Por favor, envie as fotos por aqui, legíveis e com a assinatura aparecendo. Obrigado!']).join('\n');
}
// Vocero embutido (painel lateral, ver bloco VOCERO EMBUTIDO no fim do arquivo).
// true = WhatsApp abre a conversa no Vocero; false = volta ao wa.me antigo.
var USAR_VOCERO = true;
function copiarTexto(txt) {
  try { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(txt).catch(function () { copiarTextoAntigo(txt); }); return; } } catch (e) { }
  copiarTextoAntigo(txt);
}
function copiarTextoAntigo(txt) {
  var t = document.createElement('textarea'); t.value = txt; t.setAttribute('readonly', '');
  t.style.cssText = 'position:fixed;top:-1000px;opacity:0'; document.body.appendChild(t); t.select();
  try { document.execCommand('copy'); } catch (e) { } document.body.removeChild(t);
}
function abrirWhats(v) {
  var n = foneWhats(v.ordem.FONEMOT);
  if (!n) { avisar('Motorista sem telefone v\u00e1lido no cadastro do parceiro' + (v.ordem.CODPARCMOTORISTA ? ' ' + v.ordem.CODPARCMOTORISTA : '') + '.', true); return; }
  if (USAR_VOCERO && window.VoceroPainel) {
    // O Vocero abre a conversa sem enviar nada; a mensagem pronta vai para a área de transferência.
    copiarTexto(mensagemMotorista(v));
    VoceroPainel.abrir(n, v.ordem.NOMEMOT || '');
    avisar('Conversa do motorista aberta no Vocero. Mensagem pronta copiada: cole com Ctrl+V.');
    return;
  }
  // sem 'noopener' no open: com ele o navegador devolve null mesmo abrindo, e o aviso saía à toa
  var w = window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(mensagemMotorista(v)), '_blank');
  if (w) { try { w.opener = null; } catch (e) { } } else avisar('O navegador bloqueou a nova aba. Libere pop-ups para o Sankhya.', true);
}
function abrirFechamentoTela(v) {
  if (!RESOURCE_FECHAMENTO) { avisar('Falta o resourceID da tela Fechamento de Viagem no painel (RESOURCE_FECHAMENTO).', true); return; }
  abrirTela(RESOURCE_FECHAMENTO, pkFechamento(v));
}
function pkFechamento(v) { var f = v.fech.map(function (x) { return x.CODFVM; }).filter(Boolean)[0]; return f ? { CODFVM: String(f) } : pkViagem(v); }
function toggleTheme() { stSet('dark', document.getElementById('dx').classList.toggle('theme-dark') ? '1' : '0'); }

/* ---------- consultas ---------- */
function filtros() {
  var ini = document.getElementById('fIni').value || isoHoje(DIAS_PADRAO);
  var fim = document.getElementById('fFim').value || isoHoje(0);
  var emp = document.getElementById('fEmp').value.trim(), via = document.getElementById('fViagem').value.trim();
  return { ini: ini, fim: fim, emp: emp ? idPositivo(emp, 'Empresa') : null, via: via ? idPositivo(via, 'Viagem') : null };
}
// CT-es do período que dão origem às viagens analisadas
function filtroCte(f, a) {
  var w = ' T.CODMODDOC = 57 AND NVL(' + a + '.ORDEMCARGA, 0) > 0 AND NVL(' + a + ".STATUSCTE, '#') NOT IN ('C', 'D')";
  if (f.via) w += ' AND ' + a + '.ORDEMCARGA = ' + f.via;
  else w += ' AND ' + a + ".DTNEG BETWEEN TO_DATE('" + toOracleData(f.ini) + "', 'DD/MM/YYYY') AND TO_DATE('" + toOracleData(f.fim) + "', 'DD/MM/YYYY')";
  if (f.emp) w += ' AND ' + a + '.CODEMP = ' + f.emp;
  return w;
}
function base(f) {
  return '(SELECT B.CODEMP, B.ORDEMCARGA FROM TGFCAB B JOIN TGFTOP T ON T.CODTIPOPER = B.CODTIPOPER AND T.DHALTER = B.DHTIPOPER WHERE' + filtroCte(f, 'B') + ')';
}
function sqlCtes(f) {
  return 'SELECT CAB.CODEMP, CAB.ORDEMCARGA, CAB.NUNOTA, CAB.NUMNOTA, CAB.SERIENOTA, TO_CHAR(CAB.DTNEG, \'DD/MM/YYYY\') DTNEG, CAB.VLRNOTA, CAB.PESO,' +
    ' CAB.CODPARC, PAR.NOMEPARC, CAB.STATUSCTE, CAB.SITUACAOCTE, CAB.STATUSNOTA' +
    ' FROM TGFCAB CAB JOIN TGFTOP T ON T.CODTIPOPER = CAB.CODTIPOPER AND T.DHALTER = CAB.DHTIPOPER' +
    ' LEFT JOIN TGFPAR PAR ON PAR.CODPARC = CAB.CODPARC WHERE' + filtroCte(f, 'CAB') + ' ORDER BY CAB.ORDEMCARGA, CAB.NUMNOTA';
}
function sqlOrdens(f) {
  return 'SELECT O.CODEMP, O.ORDEMCARGA, O.CODPROD, PRO.DESCRPROD, O.CODPARCPROPANTT, PP.NOMEPARC NOMEPROP, O.AD_CODPARC,' +
    ' O.CODPARCMOTORISTA, MOT.NOMEPARC NOMEMOT, ' + CAMPO_FONE_MOTORISTA + ' FONEMOT' +
    ' FROM TGFORD O LEFT JOIN TGFPRO PRO ON PRO.CODPROD = O.CODPROD LEFT JOIN TGFPAR PP ON PP.CODPARC = O.CODPARCPROPANTT LEFT JOIN TGFPAR MOT ON MOT.CODPARC = O.CODPARCMOTORISTA' +
    ' WHERE (O.CODEMP, O.ORDEMCARGA) IN ' + base(f);
}
function sqlFechamentos(f) {
  return 'SELECT V.CODEMP, V.ORDEMCARGA, V.STATUS, COUNT(*) QTD, MAX(V.CODFVM) CODFVM FROM TMSFVM V WHERE (V.CODEMP, V.ORDEMCARGA) IN ' + base(f) + ' GROUP BY V.CODEMP, V.ORDEMCARGA, V.STATUS';
}
function sqlCanhotos(f) {
  return 'SELECT C.CODEMP, C.ORDEMCARGA, C.CODPARC, COUNT(*) QTD,' +
    ' COUNT(CASE WHEN DBMS_LOB.GETLENGTH(C.AD_TICKET) > 0 THEN 1 END) TICKET,' +
    ' COUNT(CASE WHEN DBMS_LOB.GETLENGTH(C.AD_CANHOTOCTE) > 0 THEN 1 END) CCTE,' +
    ' COUNT(CASE WHEN DBMS_LOB.GETLENGTH(C.AD_CANHOTONFE) > 0 THEN 1 END) CNFE,' +
    " COUNT(CASE WHEN C.AD_VALIDADO = 'S' THEN 1 END) VALID," +
    " MAX(CASE WHEN Q.AD_TICKET = 'S' THEN 1 ELSE 0 END) OBRT," +
    " MAX(CASE WHEN Q.AD_CANHOTOCTE = 'S' THEN 1 ELSE 0 END) OBRC," +
    " MAX(CASE WHEN Q.AD_CANHOTONFE = 'S' THEN 1 ELSE 0 END) OBRN" +
    ' FROM TMSPROTCAN C LEFT JOIN TGFORD O ON O.CODEMP = C.CODEMP AND O.ORDEMCARGA = C.ORDEMCARGA' +
    ' LEFT JOIN TMSPARQB Q ON Q.CODPARC = C.CODPARC AND Q.CODPROD = O.CODPROD' +
    ' WHERE (C.CODEMP, C.ORDEMCARGA) IN ' + base(f) + ' GROUP BY C.CODEMP, C.ORDEMCARGA, C.CODPARC';
}
function sqlApontamentos(f) {
  return "SELECT CAB.CODEMP, CAB.ORDEMCARGA, COUNT(*) QTD, COUNT(CASE WHEN G.CONFIRMADO = 'S' THEN 1 END) CONF" +
    ' FROM TMSFVG G JOIN TGFCAB CAB ON CAB.NUNOTA = G.NUNOTA' +
    ' WHERE (CAB.CODEMP, CAB.ORDEMCARGA) IN ' + base(f) + ' GROUP BY CAB.CODEMP, CAB.ORDEMCARGA';
}
function sqlAfretamentoItens(f) {
  return 'SELECT I.CODEMP, I.ORDEMCARGA,' +
    " COUNT(DISTINCT CASE WHEN N.STATUSNOTA <> 'L' THEN N.NUNOTA END) NOTASPEND," +
    ' SUM(CASE WHEN I.CODTIPCOB = 3 THEN NVL(FIN.VLRDESDOB, I.VALOR) - NVL(FIN.VLRDESC, 0) ELSE 0 END) SALDO,' +
    ' SUM(CASE WHEN I.CODTIPCOB = 3 AND FIN.NUFIN IS NOT NULL AND FIN.DHBAIXA IS NULL THEN NVL(FIN.VLRDESDOB, 0) - NVL(FIN.VLRDESC, 0) ELSE 0 END) SALDOABERTO,' +
    ' COUNT(CASE WHEN I.CODTIPCOB = 3 THEN 1 END) QTDSALDO,' +
    ' COUNT(CASE WHEN I.CODTIPCOB = 3 AND FIN.NUFIN IS NULL THEN 1 END) SALDOSEMTIT' +
    ' FROM TMSORDAFTITE I LEFT JOIN TGFCAB N ON N.NUNOTA = I.NUNOTA LEFT JOIN TGFFIN FIN ON FIN.NUFIN = I.NUFIN' +
    ' WHERE (I.CODEMP, I.ORDEMCARGA) IN ' + base(f) + ' GROUP BY I.CODEMP, I.ORDEMCARGA';
}
function sqlLiberacoes(f) {
  return 'SELECT A.CODEMP, A.ORDEMCARGA, A.CODAFT, A.STATUS, A.STATUSLIBADIANTAMENTO SLADT, A.STATUSLIBMAXFRETE SLMAX, A.STATUSLIBSEGAFT SLSEG, A.STATUSLIBVLRAFTVLRCTE SLVCTE,' +
    " (SELECT COUNT(*) FROM TSILIB L WHERE L.TABELA = 'TGFCAB' AND L.DHLIB IS NULL AND L.NUCHAVE IN" +
    ' (SELECT I.NUNOTA FROM TMSORDAFTITE I WHERE I.CODEMP = A.CODEMP AND I.ORDEMCARGA = A.ORDEMCARGA)) LIBNOTAS' +
    ' FROM TMSORDAFT A WHERE (A.CODEMP, A.ORDEMCARGA) IN ' + base(f);
}
function sqlFinanceiroResumo(f) {
  return 'SELECT F.CODEMP, F.ORDEMCARGA, F.RECDESP, COUNT(*) QTD, SUM(F.VLRDESDOB) VLR,' +
    ' SUM(CASE WHEN F.DHBAIXA IS NULL THEN F.VLRDESDOB - NVL(F.VLRDESC, 0) ELSE 0 END) ABERTO,' +
    " COUNT(CASE WHEN NVL(F.AD_VALIDADO, 'N') <> 'S' THEN 1 END) NAOVALID" +
    ' FROM TGFFIN F WHERE F.RECDESP <> 0 AND (F.CODEMP, F.ORDEMCARGA) IN ' + base(f) + ' GROUP BY F.CODEMP, F.ORDEMCARGA, F.RECDESP';
}

/* ---------- montagem e classificação ---------- */
function carregar() {
  var f;
  try { f = filtros(); } catch (e) { avisar(e.message, true); return; }
  document.querySelector('#tblViagens tbody').innerHTML = '<tr><td colspan="9"><div class="skl"></div><div class="skl"></div><div class="skl"></div></td></tr>';
  document.getElementById('cfgInfo').innerHTML = f.via ? 'Viagem <b>' + f.via + '</b>' : 'CT-e de <b>' + toOracleData(f.ini) + '</b> a <b>' + toOracleData(f.fim) + '</b>';
  atualizarBadge();
  var qs = [sqlCtes(f), sqlOrdens(f), sqlFechamentos(f), sqlCanhotos(f), sqlApontamentos(f), sqlAfretamentoItens(f), sqlLiberacoes(f), sqlFinanceiroResumo(f)];
  var nomes = ['CT-es', 'Ordens de carga', 'Fechamentos (TMSFVM)', 'Canhotos (TMSPROTCAN)', 'Apontamentos (TMSFVG)', 'Afretamento (TMSORDAFTITE)', 'Liberações (TMSORDAFT/TSILIB)', 'Financeiro (TGFFIN)'];
  var falhas = [];
  return Promise.all(qs.map(function (q, i) {
    return consultar(q).catch(function (e) { if (i === 0) throw e; falhas.push(nomes[i] + ': ' + (e.message || e)); return null; });
  })).then(function (r) {
    VIAGENS = montar(r);
    if (falhas.length) avisar('Algumas informações não carregaram:\n' + falhas.join('\n'), true);
    if (ATUAL) {
      var novo = VIAGENS.filter(function (v) { return v.k === ATUAL.k; })[0];
      if (novo) abrirDetalhe(novo); else fecharDetalhe();
    }
    renderTudo();
  }).catch(function (e) {
    document.querySelector('#tblViagens tbody').innerHTML = '<tr><td colspan="9" class="empty">' + esc(e.message || e) + '</td></tr>';
  });
}
function indexar(rows, fn) { var m = {}; (rows || []).forEach(function (r) { var k = chave(r.CODEMP, r.ORDEMCARGA); (m[k] = m[k] || []).push(r); fn && fn(r); }); return m; }
function montar(r) {
  var ctes = indexar(r[0]), ords = indexar(r[1]), fechs = indexar(r[2]), cans = indexar(r[3]), apts = indexar(r[4]), afts = indexar(r[5]), libs = indexar(r[6]), fins = indexar(r[7]);
  var parcial = { ord: !r[1], fech: !r[2], can: !r[3], apt: !r[4], aft: !r[5], lib: !r[6], fin: !r[7] };
  return Object.keys(ctes).map(function (k) {
    var lst = ctes[k], c0 = lst[0];
    var v = { k: k, CODEMP: c0.CODEMP, ORDEMCARGA: c0.ORDEMCARGA, ctes: lst, parcial: parcial };
    v.ordem = (ords[k] || [])[0] || {};
    v.valor = lst.reduce(function (s, c) { return s + num(c.VLRNOTA); }, 0);
    v.peso = lst.reduce(function (s, c) { return s + num(c.PESO); }, 0);
    v.dt = lst.map(function (c) { return c.DTNEG; }).sort(function (a, b) { return String(a).split('/').reverse().join('').localeCompare(String(b).split('/').reverse().join('')); })[0];
    v.tomadores = lst.map(function (c) { return c.NOMEPARC; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    v.fech = fechs[k] || [];
    v.fechado = v.fech.some(function (x) { return x.STATUS === 'F'; });
    v.reaberto = !v.fechado && v.fech.some(function (x) { return x.STATUS === 'R'; });
    v.can = cans[k] || [];
    v.apt = (apts[k] || [])[0] || { QTD: 0, CONF: 0 };
    v.aft = (afts[k] || [])[0] || null;
    v.lib = libs[k] || [];
    v.fin = { rec: null, desp: null };
    (fins[k] || []).forEach(function (x) { v.fin[num(x.RECDESP) > 0 ? 'rec' : 'desp'] = x; });
    v.saldo = v.aft ? num(v.aft.SALDO) : 0;
    v.saldoAberto = v.aft ? num(v.aft.SALDOABERTO) : 0;
    analisar(v);
    v.idade = diasDesde(v.dt);
    v.busca = [v.ORDEMCARGA, v.CODEMP, lst.map(function (c) { return c.NUMNOTA + ' ' + c.NUNOTA; }).join(' '), v.tomadores.join(' '), v.ordem.NOMEPROP, v.ordem.NOMEMOT, v.pend.map(function (p) { return p.t; }).join(' '), GRUPOS[v.grupo][0]].join(' ').toLowerCase();
    return v;
  });
}
// Monta as pendências de cada etapa e decide em que etapa a viagem está parada
function analisar(v) {
  v.faltaDocs = [];
  var et = {}, pend = [];
  function add(etapa, t, s, aviso) { pend.push({ e: etapa, t: t, s: s || '', av: !!aviso }); if (!aviso) et[etapa] = 'pend'; }
  // 1 CT-e
  var naoAut = v.ctes.filter(function (c) { return c.STATUSCTE !== 'A'; });
  if (naoAut.length) add('cte', 'CT-e não autorizado', 'CT-e ' + naoAut.map(function (c) { return c.NUMNOTA || ('núnico ' + c.NUNOTA); }).join(', ') + ' ainda sem autorização da SEFAZ.');
  var subst = v.ctes.filter(function (c) { return c.SITUACAOCTE === 'B'; });
  if (subst.length) add('cte', 'CT-e em substituição', 'CT-e ' + subst.map(function (c) { return c.NUMNOTA; }).join(', ') + ' está com desacordo/substituição em andamento.', true);
  // 2 Canhotos
  if (v.parcial.can) add('can', 'Não foi possível conferir os canhotos', 'A consulta de canhotos falhou ao carregar a lista. Abra a viagem para ver o diagnóstico ou atualize.');
  if (!v.parcial.can) {
    if (!v.can.length) { add('can', 'Nenhum canhoto lançado', 'Lance os canhotos da viagem no Call Center.'); v.faltaDocs = DOCS_MOTORISTA.slice(); }
    var falta = { t: [], c: [], n: [] };
    v.can.forEach(function (c) {
      if (num(c.OBRT) && !num(c.TICKET)) falta.t.push(c.CODPARC);
      if (num(c.OBRC) && !num(c.CCTE)) falta.c.push(c.CODPARC);
      if (num(c.OBRN) && !num(c.CNFE)) falta.n.push(c.CODPARC);
    });
    var nomes = [];
    if (falta.t.length) nomes.push('Ticket de descarga');
    if (falta.c.length) nomes.push('Canhoto CT-e');
    if (falta.n.length) nomes.push('Canhoto NF-e');
    if (nomes.length) v.faltaDocs = [falta.t.length ? DOCS_MOTORISTA[0] : null, falta.c.length ? DOCS_MOTORISTA[1] : null, falta.n.length ? DOCS_MOTORISTA[2] : null].filter(Boolean);
    if (nomes.length) add('can', 'Falta imagem: ' + nomes.join(', '), 'Obrigatório pela Quebra por Produto do parceiro. Sem a imagem o fechamento é bloqueado.');
  }
  // 3 Afretamento: notas confirmadas e liberações
  var aftNaoConf = v.lib.filter(function (l) { return String(l.STATUS || '').toUpperCase() !== 'CONFIRMADO'; });
  if (aftNaoConf.length) add('aft', 'Afretamento n\u00e3o confirmado', 'Afretamento ' + aftNaoConf.map(function (l) { return l.CODAFT + ' (' + (l.STATUS || 'sem status') + ')'; }).join(', ') + '. O apontamento s\u00f3 calcula com afretamento CONFIRMADO.');
  if (v.aft && num(v.aft.NOTASPEND)) add('aft', num(v.aft.NOTASPEND) + ' documento(s) do afretamento sem confirmar', 'Confirme as notas do afretamento antes de confirmar o apontamento.');
  var libRuim = [];
  v.lib.forEach(function (l) {
    [['SLADT', 'adiantamento'], ['SLMAX', 'frete máximo'], ['SLSEG', 'seguro'], ['SLVCTE', 'valor afretamento x CT-e']].forEach(function (x) {
      if (STATUS_LIB_RUIM.indexOf(String(l[x[0]] || '').toUpperCase()) >= 0) libRuim.push(x[1] + ' ' + String(l[x[0]]).toLowerCase());
    });
  });
  var libNotas = v.lib.reduce(function (m, l) { return Math.max(m, num(l.LIBNOTAS)); }, 0);
  if (libNotas) libRuim.push(libNotas + ' liberação(ões) de nota aguardando');
  if (libRuim.length) add('aft', 'Liberação pendente ou negada', libRuim.join(' · ') + '.');
  if (!v.parcial.aft && !v.aft && !v.parcial.lib && !v.lib.length) add('aft', 'Viagem sem afretamento', 'Não há afretamento lançado para a viagem.', true);
  // 4 Apontamento (espelho)
  var aq = num(v.apt.QTD), ac = num(v.apt.CONF);
  if (!v.parcial.apt) {
    if (!aq && EXIGE_APONTAMENTO) add('apt', 'Sem apontamento', 'Lance o espelho de apontamento (peso de chegada e ocorrência) no fechamento.');
    else if (ac < aq) add('apt', (aq - ac) + ' de ' + aq + ' apontamento(s) sem confirmar', 'Confirme o apontamento: ele gera o financeiro de quebra/ocorrência e o desconto no saldo de frete.');
  }
  // 5 Fechamento
  if (!v.fechado) add('fech', v.reaberto ? 'Viagem reaberta' : (v.fech.length ? 'Fechamento não concluído' : 'Fechamento não lançado'), v.reaberto ? 'Feche novamente a viagem depois dos ajustes.' : 'Com as etapas acima ok, feche a viagem (status F).', true);
  // 6 Quitação do saldo de frete
  if (v.aft && num(v.aft.SALDOSEMTIT)) add('quit', 'Saldo de frete sem título', 'O item de saldo (tipo 3) do afretamento não tem título no financeiro.', !v.fechado);
  if (v.saldoAberto > 0.004) add('quit', 'Saldo do motorista em aberto: ' + fmtMoeda(v.saldoAberto), 'Título de saldo de frete ainda não baixado.', !v.fechado);
  if (v.fechado && v.fin.desp && num(v.fin.desp.NAOVALID)) add('quit', num(v.fin.desp.NAOVALID) + ' despesa(s) sem validação', 'Viagem fechada com título de despesa sem AD_VALIDADO = S.', true);

  // estado de cada etapa
  ETAPAS.forEach(function (e) { if (!et[e[0]]) et[e[0]] = 'ok'; });
  if (!v.fechado) { et.fech = 'pend'; if (et.quit === 'ok' && (v.saldoAberto > 0.004)) et.quit = 'pend'; if (!v.aft) et.quit = 'na'; }
  if (v.fechado) { ['cte', 'can', 'aft', 'apt'].forEach(function (e) { if (et[e] === 'pend' && e !== 'cte') et[e] = 'ok'; }); }
  if (!v.aft && !v.lib.length && et.aft === 'ok') et.aft = 'na';
  v.et = et; v.pend = pend;

  if (v.fechado) v.grupo = (v.saldoAberto > 0.004 || (v.aft && num(v.aft.SALDOSEMTIT))) ? 'saldo' : 'ok';
  else if (et.cte === 'pend' || et.can === 'pend') v.grupo = 'doc';
  else if (et.aft === 'pend') v.grupo = 'aft';
  else if (et.apt === 'pend') v.grupo = 'apt';
  else v.grupo = 'pronta';
  v.bloqueios = pend.filter(function (p) { return !p.av; });
}

/* ---------- lista ---------- */
function visiveisBase() {
  var concl = document.getElementById('fConcluidas').checked;
  return VIAGENS.filter(function (v) { return concl || v.grupo !== 'ok' || FILTRO_GRUPO === 'ok'; });
}
function noGrupo(v, g) {
  if (g === 'todas') return true;
  if (g === 'abertas') return !v.fechado;
  if (g === 'reabertas') return v.reaberto;
  return v.grupo === g;
}
function renderTudo() { renderKpis(); renderChips(); renderLista(); }
function renderKpis() {
  var n = { doc: 0, aft: 0, apt: 0, pronta: 0, saldo: 0, ok: 0 }, vs = 0;
  VIAGENS.forEach(function (v) { n[v.grupo]++; if (v.grupo === 'saldo') vs += v.saldoAberto; });
  Object.keys(n).forEach(function (g) { document.getElementById('k_' + g).textContent = n[g]; });
  document.getElementById('k_saldoS').textContent = vs ? fmtMoeda(vs) + ' em aberto' : 'nada em aberto';
  document.querySelectorAll('.kc[data-grupo]').forEach(function (k) { k.classList.toggle('on', FILTRO_GRUPO === k.dataset.grupo); });
}
function renderChips() {
  var b = visiveisBase();
  document.getElementById('chips').innerHTML = CHIPS.map(function (ch) {
    var n = b.filter(function (v) { return noGrupo(v, ch[0]); }).length;
    return '<button class="chip' + (FILTRO_GRUPO === ch[0] ? ' on' : '') + '" data-grupo="' + ch[0] + '">' + esc(ch[1]) + '<span class="n">' + n + '</span></button>';
  }).join('');
}
var ORDEM_GRUPO = { doc: 1, aft: 2, apt: 3, pronta: 4, saldo: 5, ok: 6 };
function valorOrdem(v, col) {
  switch (col) {
    case 'idade': return v.fechado ? -1 : (v.idade == null ? -1 : v.idade);
    case 'viagem': return num(v.ORDEMCARGA);
    case 'ctes': return num(v.ctes[0].NUMNOTA);
    case 'tomador': return (v.tomadores[0] || '').toLowerCase();
    case 'trilha': case 'grupo': return ORDEM_GRUPO[v.grupo];
    case 'pend': return v.bloqueios.length;
    case 'valor': return v.valor;
    case 'saldo': return v.saldoAberto;
  }
  return 0;
}
function trilhaHtml(v) { return '<span class="trilha" title="' + ETAPAS.map(function (e) { return e[1] + ': ' + ({ ok: 'ok', pend: 'pendente', na: 'n/a' })[v.et[e[0]]]; }).join(' | ') + '">' + ETAPAS.map(function (e) { return '<i class="' + v.et[e[0]] + '"></i>'; }).join('') + '</span>'; }
function idadeHtml(v) {
  if (v.fechado || v.idade == null) return '<span class="idade" style="color:var(--t3);font-weight:400">\u2014</span>';
  var cls = v.idade >= IDADE_ATRASO ? 'venc' : v.idade >= IDADE_ALERTA ? 'alerta' : 'ok';
  return '<span class="idade ' + cls + '" title="Dias desde a emissão do CT-e">' + v.idade + 'd</span>';
}
function pillHtml(v) { var g = GRUPOS[v.grupo]; return '<span class="pill ' + g[1] + '">' + esc(v.reaberto ? 'Reaberta' : g[0]) + '</span>'; }
function renderLista() {
  var q = document.getElementById('busca').value.trim().toLowerCase();
  var lista = visiveisBase().filter(function (v) { return noGrupo(v, FILTRO_GRUPO) && (!q || v.busca.indexOf(q) >= 0); });
  lista.sort(function (a, b) { var x = valorOrdem(a, ORDEM.col), y = valorOrdem(b, ORDEM.col); return (x > y ? 1 : x < y ? -1 : num(b.ORDEMCARGA) - num(a.ORDEMCARGA)) * ORDEM.dir; });
  renderLista.atual = lista;
  document.querySelectorAll('#tblViagens thead th').forEach(function (th) { th.classList.toggle('sorted', th.dataset.col === ORDEM.col); });
  var tb = document.querySelector('#tblViagens tbody');
  if (!lista.length) { tb.innerHTML = '<tr><td colspan="9" class="empty">' + (VIAGENS.length ? 'Nenhuma viagem neste filtro.' : 'Nenhuma viagem com CT-e no período.') + '</td></tr>'; return; }
  tb.innerHTML = lista.map(function (v) {
    var p1 = v.bloqueios[0] || v.pend[0];
    var pend = p1 ? esc(p1.t) + (v.bloqueios.length > 1 ? ' <span style="color:var(--t3)">+' + (v.bloqueios.length - 1) + '</span>' : '') : '<span class="ck ok">\u2713 nada pendente</span>';
    return '<tr data-k="' + esc(v.k) + '"' + (ATUAL && ATUAL.k === v.k ? ' class="sel"' : '') + '>' +
      '<td>' + idadeHtml(v) + '</td>' +
      '<td class="doc"><b>' + esc(v.ORDEMCARGA) + (foneWhats(v.ordem.FONEMOT) && v.faltaDocs.length ? ' <button class="wa-ic" data-wa="' + esc(v.k) + '" title="Cobrar o motorista no WhatsApp"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z"/></svg></button>' : '') + '</b><span>Emp ' + esc(v.CODEMP) + ' · ' + esc(v.dt || '') + '</span></td>' +
      '<td class="doc"><b>' + esc(v.ctes.map(function (c) { return c.NUMNOTA; }).join(', ')) + '</b><span>' + (v.peso ? fmtNum(v.peso, 0) + ' kg' : '&nbsp;') + '</span></td>' +
      '<td class="mot" title="' + esc(v.tomadores.join(', ')) + '">' + esc(v.tomadores.join(', ')) + '</td>' +
      '<td>' + trilhaHtml(v) + '</td>' +
      '<td class="mot" title="' + esc(v.pend.map(function (p) { return p.t; }).join(' | ')) + '">' + pend + '</td>' +
      '<td class="num">' + fmtMoeda(v.valor) + '</td>' +
      '<td class="num">' + (v.aft ? fmtMoeda(v.saldoAberto) : '\u2014') + '</td>' +
      '<td>' + pillHtml(v) + '</td></tr>';
  }).join('');
}
function atualizarBadge() {
  var n = ['fIni', 'fFim', 'fEmp', 'fViagem'].filter(function (id) { return document.getElementById(id).value; }).length + (document.getElementById('fConcluidas').checked ? 1 : 0);
  document.getElementById('btnLimpar').classList.toggle('on', n > 0);
}
function exportarCsv() {
  var lista = renderLista.atual || [];
  if (!lista.length) { avisar('Nada para exportar.', true); return; }
  var cols = ['Empresa', 'Viagem', 'CT-e', 'Emissão', 'Dias', 'Tomador', 'Proprietário', 'Peso', 'Frete CT-e', 'Saldo motorista', 'Saldo em aberto', 'Situação', 'Pendências'];
  var linhas = lista.map(function (v) {
    return [v.CODEMP, v.ORDEMCARGA, v.ctes.map(function (c) { return c.NUMNOTA; }).join(' '), v.dt, v.fechado ? '' : v.idade, v.tomadores.join(' / '), v.ordem.NOMEPROP || '',
      fmtNum(v.peso, 0), fmtNum(v.valor, 2), fmtNum(v.saldo, 2), fmtNum(v.saldoAberto, 2), v.reaberto ? 'Reaberta' : GRUPOS[v.grupo][0], v.pend.map(function (p) { return p.t; }).join(' | ')];
  });
  var csv = [cols].concat(linhas).map(function (l) { return l.map(function (x) { return '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'fechamento-viagens-' + isoHoje(0) + '.csv';
  document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- detalhe ---------- */
function campo(l, v, cls) { return '<div class="f ' + (cls || '') + '"><div class="l">' + esc(l) + '</div><div class="v">' + (vazio(v) ? '\u2014' : v) + '</div></div>'; }
function stepsHtml(v) {
  var sub = { cte: v.ctes.length + ' CT-e', can: v.can.length + ' parceiro(s)', aft: v.aft ? 'saldo ' + fmtMoeda(v.saldo) : 'sem itens', apt: num(v.apt.CONF) + '/' + num(v.apt.QTD) + ' confirmado(s)', fech: v.fechado ? 'fechada' : v.reaberto ? 'reaberta' : (v.fech.length ? 'em aberto' : 'não lançado'), quit: v.saldoAberto > 0.004 ? fmtMoeda(v.saldoAberto) + ' aberto' : (v.aft ? 'quitado' : '\u2014') };
  var primeiraPend = ETAPAS.map(function (e) { return e[0]; }).filter(function (e) { return v.et[e] === 'pend'; })[0];
  return '<div class="steps">' + ETAPAS.map(function (e, i) {
    var s = v.et[e[0]], cls = s === 'ok' ? 'done' : (e[0] === primeiraPend ? 'cur err' : '');
    return '<div class="step ' + cls + '"><div class="dot">' + (s === 'ok' ? '\u2713' : s === 'na' ? '\u2013' : (i + 1)) + '</div><div class="t">' + esc(e[1]) + '</div><div class="s">' + esc(sub[e[0]]) + '</div></div>';
  }).join('') + '</div>';
}
function pendHtml(v) {
  if (!v.pend.length) return '<div class="tudo-ok">\u2713 Nada pendente nesta viagem.</div>';
  return '<ol class="pend-lst">' + v.pend.map(function (p, i) {
    var et = ETAPAS.filter(function (e) { return e[0] === p.e; })[0];
    return '<li class="' + (p.av ? 'av' : '') + '"><span class="n">' + (i + 1) + '</span><div><b>' + esc(p.t) + '</b><span>' + esc(et[1]) + ' · ' + esc(p.s) + '</span></div></li>';
  }).join('') + '</ol>';
}
function abrirDetalhe(v) {
  ATUAL = v;
  document.getElementById('area').classList.add('comdet');
  document.querySelector('main').classList.add('detaberto');
  document.getElementById('det').classList.add('open');
  document.getElementById('dTitulo').textContent = 'Viagem ' + v.ORDEMCARGA;
  document.getElementById('dMeta').textContent = 'Empresa ' + v.CODEMP + ' · CT-e ' + v.ctes.map(function (c) { return c.NUMNOTA; }).join(', ') + ' · emitido em ' + (v.dt || '\u2014') + (v.fechado || v.idade == null ? '' : ' · há ' + v.idade + ' dia(s)');
  document.getElementById('dPill').innerHTML = pillHtml(v);
  document.getElementById('dMsg').textContent = v.fechado ? (v.grupo === 'ok' ? 'Viagem fechada e quitada.' : 'Viagem fechada. Falta quitar o saldo do motorista.') : v.bloqueios.length ? v.bloqueios.length + ' pendência(s) impedem o fechamento.' : (v.fechado ? (v.grupo === 'ok' ? 'Viagem fechada e quitada.' : 'Viagem fechada. Falta quitar o saldo.') : 'Pronta para fechar.');
  document.getElementById('bFechamento').hidden = !RESOURCE_FECHAMENTO;
  document.getElementById('bCallCenter').hidden = !RESOURCE_CALL_CENTER;
  var bw = document.getElementById('bWhats'); bw.hidden = !v.ordem.CODPARCMOTORISTA; bw.disabled = !foneWhats(v.ordem.FONEMOT); bw.setAttribute('data-tip', foneWhats(v.ordem.FONEMOT) ? 'Enviar mensagem para ' + fmtFone(v.ordem.FONEMOT) : 'Motorista sem telefone no cadastro');
  var o = v.ordem, rec = v.fin.rec, desp = v.fin.desp;
  var receita = rec ? num(rec.VLR) : v.valor, despesa = desp ? num(desp.VLR) : 0;
  document.getElementById('dBody').innerHTML =
    '<div class="sec full">' + stepsHtml(v) + '</div>' +
    '<div class="sec"><h3>O que falta</h3>' + pendHtml(v) + '</div>' +
    '<div class="sec"><h3>Resultado da viagem</h3><div class="resumo">' +
      '<div><div class="l">Receita (CT-e)</div><div class="v">' + fmtMoeda(receita) + '</div></div>' +
      '<div><div class="l">Despesas lançadas</div><div class="v">' + fmtMoeda(despesa) + '</div></div>' +
      '<div><div class="l">Resultado</div><div class="v" style="color:' + (receita - despesa >= 0 ? 'var(--pos)' : 'var(--neg)') + '">' + fmtMoeda(receita - despesa) + '</div></div>' +
      '<div><div class="l">Saldo motorista</div><div class="v">' + (v.aft ? fmtMoeda(v.saldo) : '\u2014') + '</div></div>' +
      '<div><div class="l">Saldo em aberto</div><div class="v">' + (v.aft ? fmtMoeda(v.saldoAberto) : '\u2014') + '</div></div>' +
      '<div><div class="l">Receber em aberto</div><div class="v">' + (rec ? fmtMoeda(num(rec.ABERTO)) : '\u2014') + '</div></div>' +
    '</div></div>' +
    '<div class="sec"><h3>Viagem <button class="lnk" data-acao="abrirViagem">abrir viagem</button></h3><div class="grid">' +
      campo('Produto', esc(o.CODPROD ? o.CODPROD + ' - ' + (o.DESCRPROD || '') : '')) +
      campo('Proprietário ANTT', esc(o.CODPARCPROPANTT ? o.CODPARCPROPANTT + ' - ' + (o.NOMEPROP || '') : ''), 'w2') +
      campo('Peso dos CT-e', v.peso ? fmtNum(v.peso, 0) + ' kg' : '') +
      campo('Motorista', esc(o.CODPARCMOTORISTA ? o.CODPARCMOTORISTA + ' - ' + (o.NOMEMOT || '') : '')) +
      campo('Telefone', o.FONEMOT ? esc(fmtFone(o.FONEMOT)) + (foneWhats(o.FONEMOT) ? ' <button class="lnk" data-acao="whats">WhatsApp</button>' : ' <span class="ck falta">inválido</span>') : '') +
      campo('Subcontratado', esc(o.AD_CODPARC || '')) +
      campo('Tomador', esc(v.tomadores.join(', '))) +
    '</div><div id="dOrdem"></div></div>' +
    '<div class="sec"><h3>CT-e</h3><table class="mini"><thead><tr><th>CT-e</th><th>Emissão</th><th>Tomador</th><th>Status</th><th class="num">Peso</th><th class="num">Valor</th></tr></thead><tbody>' +
      v.ctes.map(function (c) {
        return '<tr><td><button class="lnk" data-acao="abrirNota" data-nunota="' + esc(c.NUNOTA) + '">' + esc(c.NUMNOTA) + '</button> <span style="color:var(--t3)">nº único ' + esc(c.NUNOTA) + '</span></td><td>' + esc(c.DTNEG) + '</td><td>' + esc(c.NOMEPARC || c.CODPARC) + '</td><td>' + (c.STATUSCTE === 'A' ? '<span class="ck ok">\u2713 autorizado</span>' : '<span class="ck falta">' + esc(c.STATUSCTE || 'sem envio') + '</span>') + (c.SITUACAOCTE && c.SITUACAOCTE !== 'N' ? ' <span class="pill p-and">' + esc({ B: 'em substituição', S: 'substituído', L: 'em anulação', A: 'anulado' }[c.SITUACAOCTE] || c.SITUACAOCTE) + '</span>' : '') + '</td><td class="num">' + fmtNum(c.PESO, 0) + '</td><td class="num">' + fmtMoeda(c.VLRNOTA) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
    '<div class="sec"><h3>Canhotos</h3><div id="dCan"><div class="skl"></div></div></div>' +
    '<div class="sec"><h3>Afretamento e liberações</h3><div id="dAft"><div class="skl"></div></div></div>' +
    '<div class="sec full"><h3>Peso de chegada</h3><div id="dPeso"><div class="skl"></div></div></div>' +
    '<div class="sec full"><h3>Espelho de apontamento</h3><div id="dApt"><div class="skl"></div></div></div>' +
    '<div class="sec"><h3>Fechamento</h3><div id="dFech"><div class="skl"></div></div></div>' +
    '<div class="sec full"><h3>Financeiro da viagem</h3><div id="dFin"><div class="skl"></div></div></div>';
  document.querySelectorAll('#tblViagens tbody tr').forEach(function (tr) { tr.classList.toggle('sel', tr.dataset.k === v.k); });
  carregarDetalhe(v);
}
function fecharDetalhe() {
  ATUAL = null;
  document.getElementById('det').classList.remove('open');
  document.getElementById('area').classList.remove('comdet');
  document.querySelector('main').classList.remove('detaberto');
  document.querySelectorAll('#tblViagens tbody tr.sel').forEach(function (tr) { tr.classList.remove('sel'); });
}
// Mostra todos os campos preenchidos de um registro (sem precisar conhecer cada coluna)
function camposHtml(row, titulo) {
  if (!row) return '';
  var ks = Object.keys(row).filter(function (k) { var x = row[k]; return !vazio(x) && typeof x !== 'object' && String(x).length < 200; }).sort();
  if (!ks.length) return '';
  return '<details class="campos"><summary>' + esc(titulo || 'Todos os campos') + ' (' + ks.length + ')</summary><div class="kv">' + ks.map(function (k) { return '<div><span>' + esc(k) + '</span>' + esc(row[k]) + '</div>'; }).join('') + '</div></details>';
}
function setHtml(id, html) { var el = document.getElementById(id); if (el && ATUAL) el.innerHTML = html; }
function erroHtml(e) { return '<div class="aviso erro">' + esc(e && e.message || e) + '</div>'; }
function ck(obr, tem) { return tem ? '<span class="ck ok">\u2713 anexado</span>' : obr ? '<span class="ck falta">\u2717 obrigatório</span>' : '<span class="ck na">\u2013 opcional</span>'; }
/* ---------- imagens dos canhotos (mesma leitura do botão Central de Canhotos) ---------- */
var CANHOTOS = [], PK_CANHOTO = null, PK_SEM_ANEXO = false;
function pkCanhoto() {
  if (PK_CANHOTO && PK_CANHOTO.length) return Promise.resolve(PK_CANHOTO);
  var limpar = function (r) { return r.map(function (x) { return String(x.COLUMN_NAME); }).filter(function (c) { return /^[A-Z][A-Z0-9_$#]*$/.test(c); }); };
  var sqlUser = "SELECT CC.COLUMN_NAME FROM USER_CONSTRAINTS CO JOIN USER_CONS_COLUMNS CC ON CC.CONSTRAINT_NAME = CO.CONSTRAINT_NAME AND CC.TABLE_NAME = CO.TABLE_NAME WHERE CO.TABLE_NAME = 'TMSPROTCAN' AND CO.CONSTRAINT_TYPE = 'P' ORDER BY CC.POSITION";
  var sqlAll = "SELECT CC.COLUMN_NAME FROM ALL_CONSTRAINTS CO JOIN ALL_CONS_COLUMNS CC ON CC.OWNER = CO.OWNER AND CC.CONSTRAINT_NAME = CO.CONSTRAINT_NAME AND CC.TABLE_NAME = CO.TABLE_NAME WHERE CO.TABLE_NAME = 'TMSPROTCAN' AND CO.CONSTRAINT_TYPE = 'P' AND CO.OWNER = (SELECT MIN(T.OWNER) FROM ALL_TABLES T WHERE T.TABLE_NAME = 'TMSPROTCAN') ORDER BY CC.POSITION";
  return consultar(sqlUser).then(limpar).catch(function () { return []; }).then(function (pk) {
    return pk.length ? pk : consultar(sqlAll).then(limpar).catch(function () { return []; });
  }).then(function (pk) {
    if (pk.length) return pk;
    // último recurso: dicionário do Sankhya (campo "Cód. Canhoto")
    return consultar("SELECT NOMECAMPO COLUMN_NAME FROM TDDCAM WHERE NOMETAB = 'TMSPROTCAN' AND (NOMECAMPO IN ('CODCANHOTO','CODCAN','NUCANHOTO','CODPROTCAN','NUPROTCAN') OR UPPER(DESCRCAMPO) LIKE 'C%D%CANHOTO')").then(limpar).then(function (x) { return x.length === 1 ? x : []; }).catch(function () { return []; });
  }).then(function (pk) { PK_CANHOTO = pk; return pk; });
}
function filtroPk(pk) {
  var ks = Object.keys(pk);
  if (!ks.length) throw new Error('Chave do canhoto não identificada.');
  return ks.map(function (c) {
    var v = pk[c];
    if (vazio(v)) throw new Error('Chave do canhoto incompleta.');
    return 'C.' + c + ' = ' + (/^-?\d+(\.\d+)?$/.test(String(v)) ? v : "'" + String(v).replace(/'/g, "''") + "'");
  }).join(' AND ');
}
var TITULOS_CANHOTO = { AD_TICKET: 'Ticket de descarga', AD_CANHOTOCTE: 'Canhoto CT-e', AD_CANHOTONFE: 'Canhoto NF-e' };
function ascii(b, i, f) { var t = ''; for (var k = i; k < Math.min(f, b.length); k++) t += String.fromCharCode(b[k]); return t; }
function acharBytes(b, m, ini) { for (var i = ini; i <= b.length - m.length; i++) { var ok = true; for (var j = 0; j < m.length; j++) if (b[i + j] !== m.charCodeAt(j)) { ok = false; break; } if (ok) return i; } return -1; }
function arquivoDoBlob(hex, titulo) {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex)) throw new Error('Conteúdo binário inválido.');
  var bytes = new Uint8Array(hex.length / 2);
  for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  var ini = '__start_fileinformation__', fim = '__end_fileinformation__', meta = {}, off = 0;
  if (ascii(bytes, 0, ini.length) === ini) {
    var pos = acharBytes(bytes, fim, ini.length);
    if (pos < 0) throw new Error('Cabeçalho do anexo incompleto.');
    try { meta = JSON.parse(new TextDecoder('utf-8').decode(bytes.subarray(ini.length, pos))); } catch (e) { }
    off = pos + fim.length;
  }
  var a = bytes.subarray(off), tipo = '';
  if (!a.length) throw new Error('O anexo não possui conteúdo.');
  if (ascii(a, 0, 5) === '%PDF-') tipo = 'application/pdf';
  else if (a[0] === 137 && ascii(a, 1, 4) === 'PNG') tipo = 'image/png';
  else if (a[0] === 255 && a[1] === 216 && a[2] === 255) tipo = 'image/jpeg';
  else if (ascii(a, 0, 3) === 'GIF') tipo = 'image/gif';
  else if (ascii(a, 0, 4) === 'RIFF' && ascii(a, 8, 12) === 'WEBP') tipo = 'image/webp';
  else if (a[0] === 66 && a[1] === 77) tipo = 'image/bmp';
  tipo = tipo || 'application/octet-stream';
  return { nome: String(meta.name || titulo), tipo: tipo, url: URL.createObjectURL(new Blob([a], { type: tipo })) };
}
function abrirDoc(titulo) {
  var dlg = document.getElementById('dlgDoc');
  document.getElementById('docTitulo').textContent = titulo;
  document.getElementById('docBaixar').hidden = true;
  if (verCanhoto.url) { URL.revokeObjectURL(verCanhoto.url); verCanhoto.url = null; }
  if (!dlg.open) dlg.showModal();
  return document.getElementById('docCorpo');
}
function verCanhoto(i, campo) {
  var c = CANHOTOS[i]; if (!c || !TITULOS_CANHOTO[campo]) return;
  var tam = num({ AD_TICKET: c.LT, AD_CANHOTOCTE: c.LC, AD_CANHOTONFE: c.LN }[campo]), titulo = TITULOS_CANHOTO[campo];
  var corpo = abrirDoc((c.NOMEPARC || c.CODPARC) + (c.NUMNOTA ? ' · doc. ' + c.NUMNOTA : ''));
  var abas = ['AD_TICKET', 'AD_CANHOTOCTE', 'AD_CANHOTONFE'].filter(function (k) { return num({ AD_TICKET: c.LT, AD_CANHOTOCTE: c.LC, AD_CANHOTONFE: c.LN }[k]) > 0; });
  var tabs = document.getElementById('docTabs');
  tabs.innerHTML = abas.map(function (k) { return '<button class="chip' + (k === campo ? ' on' : '') + '" data-i="' + i + '" data-campo="' + k + '">' + TITULOS_CANHOTO[k] + '</button>'; }).join('');
  if (tam > LIMITE_PREVIEW) { corpo.innerHTML = '<div class="aviso alerta">Arquivo maior que 8 MB. Baixe pelo campo original no Call Center.</div>'; return; }
  corpo.innerHTML = '<div class="skl" style="height:300px"></div><p style="text-align:center;color:var(--t3)">Carregando ' + fmtNum(tam / 1024, 0) + ' KB\u2026</p>';
  var filtro;
  try {
    filtro = /^[A-Za-z0-9+\/]{18}$/.test(String(c.RID || '')) ? "C.ROWID = CHARTOROWID('" + c.RID + "')"
      : 'C.CODEMP = ' + idPositivo(c.nat.CODEMP, 'Empresa') + ' AND C.ORDEMCARGA = ' + idPositivo(c.nat.ORDEMCARGA, 'Viagem') + ' AND C.CODPARC = ' + idPositivo(c.nat.CODPARC, 'Parceiro') +
        (vazio(c.nat.NUNOTA) ? ' AND C.NUNOTA IS NULL' : ' AND C.NUNOTA = ' + idPositivo(c.nat.NUNOTA, 'Documento')) + ' AND DBMS_LOB.GETLENGTH(C.' + campo + ') = ' + tam;
  } catch (e) { corpo.innerHTML = erroHtml(e); return; }
  var blocos = Math.ceil(tam / 2000);
  consultar('SELECT P.POSICAO, RAWTOHEX(DBMS_LOB.SUBSTR(C.' + campo + ', 2000, (P.POSICAO - 1) * 2000 + 1)) TRECHO FROM TMSPROTCAN C' +
    ' CROSS JOIN (SELECT LEVEL POSICAO FROM DUAL CONNECT BY LEVEL <= ' + blocos + ') P WHERE ' + filtro + ' ORDER BY P.POSICAO').then(function (r) {
    var hex = r.map(function (x) { return String(x.TRECHO || ''); }).join('');
    if (hex.length !== tam * 2) throw new Error('Leitura incompleta do arquivo (' + r.length + ' de ' + blocos + ' partes). Tente novamente.');
    var arq = arquivoDoBlob(hex, titulo);
    verCanhoto.url = arq.url;
    var bx = document.getElementById('docBaixar'); bx.href = arq.url; bx.download = arq.nome; bx.hidden = false;
    corpo.innerHTML = /^image\//.test(arq.tipo) ? '<img src="' + arq.url + '" alt="' + esc(titulo) + '" style="max-width:100%;max-height:70vh;display:block;margin:0 auto;border-radius:6px">'
      : arq.tipo === 'application/pdf' ? '<iframe src="' + arq.url + '" title="' + esc(titulo) + '" style="width:100%;height:70vh;border:0"></iframe>'
      : '<div class="aviso info">Formato sem pré-visualização. Use o botão Baixar.</div>';
  }).catch(function (e) { corpo.innerHTML = erroHtml(e); });
}
// Anexos do sistema (TSIATA) do canhoto, os mesmos da aba Anexos do Call Center
function verAnexos(i) {
  var c = CANHOTOS[i], pk = PK_CANHOTO || [];
  if (!c || pk.length !== 1) return;
  var corpo = abrirDoc('Anexos do canhoto · ' + (c.NOMEPARC || c.CODPARC));
  corpo.innerHTML = '<div class="skl"></div>';
  var chaveReg = String(c.pk[pk[0]]).replace(/'/g, "''") + '_TmsCanhoto';
  consultar("SELECT A.NUATTACH, A.NOMEARQUIVO, A.DESCRICAO, A.LINK, TO_CHAR(A.DHCAD, 'DD/MM/YYYY HH24:MI') DHCAD, U.NOMEUSU FROM TSIATA A LEFT JOIN TSIUSU U ON U.CODUSU = A.CODUSU WHERE A.NOMEINSTANCIA = 'TmsCanhoto' AND A.PKREGISTRO = '" + chaveReg + "' ORDER BY A.NUATTACH").then(function (r) {
    corpo.innerHTML = r.length ? '<table class="mini"><thead><tr><th>Arquivo</th><th>Descrição</th><th>Incluído</th><th>Por</th></tr></thead><tbody>' + r.map(function (x) {
      return '<tr><td>' + (x.LINK ? '<a class="lnk" href="' + esc(x.LINK) + '" target="_blank" rel="noopener">' + esc(x.NOMEARQUIVO || x.LINK) + '</a>' : esc(x.NOMEARQUIVO)) + '</td><td>' + esc(x.DESCRICAO) + '</td><td>' + esc(x.DHCAD) + '</td><td>' + esc(x.NOMEUSU) + '</td></tr>';
    }).join('') + '</tbody></table><div class="aviso info" style="margin-top:8px">Para abrir o arquivo use a aba Anexos do canhoto no Call Center.</div>' : '<div class="aviso alerta">Nenhum anexo encontrado.</div>';
  }).catch(function (e) { corpo.innerHTML = erroHtml(e); });
}

// Anexos do sistema (TSIATA): dos canhotos (TmsCanhoto) e dos CT-e da viagem (CabecalhoNota)
var DIAG_CAN = null;
// Tenta as consultas em ordem e fica com a primeira que trouxer linhas (guarda os erros para mostrar)
function consultarCadeia(variantes) {
  var res = { rows: [], usada: -1, tentativas: [] };
  var i = 0;
  var proxima = function () {
    if (i >= variantes.length) return res;
    var vv = variantes[i], idx = i++;
    return consultar(vv[1]).then(function (rows) {
      res.tentativas.push({ nome: vv[0], sql: vv[1], qtd: rows.length });
      if (rows.length) { res.rows = rows; res.usada = idx; return res; }
      return proxima();
    }).catch(function (e) {
      res.tentativas.push({ nome: vv[0], sql: vv[1], erro: String(e && e.message || e) });
      try { console.warn('[Fechamento] consulta falhou (' + vv[0] + '):', e, vv[1]); } catch (x) { }
      return proxima();
    });
  };
  return proxima();
}
function diagHtml(d) {
  if (!d || !d.tentativas.length) return '';
  return '<details class="campos" open><summary>Diagnóstico da consulta de canhotos</summary><div style="font-size:11px;margin-top:6px">' + d.tentativas.map(function (t, i) {
    return '<div style="margin-bottom:6px"><b>' + (i + 1) + '. ' + esc(t.nome) + ':</b> ' + (t.erro ? '<span class="ck falta">erro</span> ' + esc(t.erro) : t.qtd + ' linha(s)' + (d.usada === i ? ' <span class="ck ok">\u2190 usada</span>' : '')) +
      '<pre class="xml" style="max-height:90px;margin-top:3px">' + esc(t.sql) + '</pre></div>';
  }).join('') + '</div></details>';
}
function carregarAnexos(v, pk, canhotos) {
  if (!document.getElementById('dAnx')) return; // seção de anexos do sistema removida: só os documentos do canhoto
  var atual = function () { return ATUAL && ATUAL.k === v.k; };
  var cond0 = null;
  if (pk.length === 1) {
    // anexos dos canhotos da viagem pela chave real, sem depender da consulta de detalhe
    cond0 = "(A.NOMEINSTANCIA = 'TmsCanhoto' AND A.PKREGISTRO IN (SELECT TO_CHAR(C." + pk[0] + ") || '_TmsCanhoto' FROM TMSPROTCAN C WHERE C.CODEMP = " + idPositivo(v.CODEMP, 'Empresa') + ' AND C.ORDEMCARGA = ' + idPositivo(v.ORDEMCARGA, 'Viagem') + '))';
  }
  var notas = v.ctes.map(function (c) { return "'" + idPositivo(c.NUNOTA, 'CT-e') + "_CabecalhoNota'"; });
  var cond = [];
  if (cond0) cond.push(cond0);
  if (notas.length) cond.push("(A.NOMEINSTANCIA = 'CabecalhoNota' AND A.PKREGISTRO IN (" + notas.join(',') + '))');
  if (!cond.length) { setHtml('dAnx', '<div class="aviso alerta">Sem canhotos ou CT-e para procurar anexos.</div>'); return; }
  consultar("SELECT A.NUATTACH, A.NOMEINSTANCIA, A.PKREGISTRO, A.NOMEARQUIVO, A.DESCRICAO, A.LINK, A.CHAVEARQUIVO, TO_CHAR(A.DHCAD, 'DD/MM/YYYY HH24:MI') DHCAD, U.NOMEUSU" +
    ' FROM TSIATA A LEFT JOIN TSIUSU U ON U.CODUSU = A.CODUSU WHERE ' + cond.join(' OR ') + ' ORDER BY A.DHCAD DESC').then(function (r) {
    if (!atual()) return;
    var origem = function (x) {
      var id = String(x.PKREGISTRO || '').split('_')[0];
      if (x.NOMEINSTANCIA === 'CabecalhoNota') { var c = v.ctes.filter(function (y) { return String(y.NUNOTA) === id; })[0]; return 'CT-e ' + (c ? c.NUMNOTA : id); }
      return 'Canhoto ' + id;
    };
    var aviso = pk.length === 1 ? '' : '<div class="aviso alerta" style="margin-bottom:8px">Chave da TMSPROTCAN não identificada: mostrando só os anexos dos CT-e.</div>';
    setHtml('dAnx', aviso + (r.length ? '<table class="mini"><thead><tr><th>Arquivo</th><th>De</th><th>Descrição</th><th>Incluído</th><th>Por</th></tr></thead><tbody>' + r.map(function (x) {
      var nome = esc(x.NOMEARQUIVO || x.LINK || ('Anexo ' + x.NUATTACH));
      return '<tr><td>' + (x.LINK ? '<a class="lnk" href="' + esc(x.LINK) + '" target="_blank" rel="noopener">' + nome + '</a>' : nome) + '</td><td>' + esc(origem(x)) + '</td><td>' + esc(x.DESCRICAO) + '</td><td>' + esc(x.DHCAD) + '</td><td>' + esc(x.NOMEUSU) + '</td></tr>';
    }).join('') + '</tbody></table>' : '<div class="aviso info">Nenhum anexo na aba Anexos dos canhotos ou dos CT-e desta viagem.</div>'));
  }).catch(function (e) { setHtml('dAnx', erroHtml(e)); });
}

// ---- Importar arquivo e validar canhoto (entidade TmsCanhoto) ----
var LIMITE_IMPORTAR = 8 * 1024 * 1024;
// O arquivo vai com o mesmo cabeçalho que o Call Center grava (nome, tamanho, tipo, data), para aparecer com o nome na tela nativa.
var IMPORTAR_ATIVO = true;
function dataJava(ms) {
  var d = new Date(ms || Date.now()), mes = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  var p2 = function (n) { return ('0' + n).slice(-2); };
  return mes + ' ' + p2(d.getDate()) + ', ' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
}
function tipoArquivo(arq) {
  if (arq.type) return arq.type;
  var ext = (/\.([a-z0-9]+)$/i.exec(arq.name) || [])[1] || '';
  return { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }[ext.toLowerCase()] || 'application/octet-stream';
}
// Monta o conteúdo no formato do Sankhya: __start_fileinformation__{json}__end_fileinformation__ + bytes do arquivo
function arquivoSankhya(arq) {
  var nome = String(arq.name || 'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '_');
  var info = JSON.stringify({ name: nome, size: arq.size, type: tipoArquivo(arq), lastModifiedDate: dataJava(arq.lastModified) });
  return { nome: nome, blob: new Blob(['__start_fileinformation__' + info + '__end_fileinformation__', arq], { type: tipoArquivo(arq) }) };
}
function tamanhoCampo(c, campo) {
  return consultar('SELECT DBMS_LOB.GETLENGTH(C.' + campo + ') TAM FROM TMSPROTCAN C WHERE ' + filtroPk(c.pk)).then(function (r) {
    if (r.length !== 1) throw new Error('Canhoto não localizado pela chave.');
    return num(r[0].TAM);
  });
}
function importarCanhoto(i, campo, arq, inp) {
  var c = CANHOTOS[i], v = ATUAL; if (!IMPORTAR_ATIVO || !c || !c.pk || !TITULOS_CANHOTO[campo] || !v) return;
  var lbl = inp.closest('label'); var limpar = function () { inp.value = ''; if (lbl) lbl.classList.remove('busy'); };
  if (arq.size > LIMITE_IMPORTAR) { avisar('Arquivo maior que 8 MB.', true); limpar(); return; }
  if (!/^image\/|application\/pdf/.test(arq.type || '') && !/\.(pdf|jpe?g|png|gif|webp|bmp)$/i.test(arq.name)) { avisar('Envie uma imagem ou PDF.', true); limpar(); return; }
  if (lbl) lbl.classList.add('busy');
  var chave = 'FECHVIAG_' + campo + '_' + Object.keys(c.pk).map(function (k) { return c.pk[k]; }).join('_');
  // não sobrescreve: só importa se o campo continua vazio
  tamanhoCampo(c, campo).then(function (t) {
    if (t > 0) throw new Error(TITULOS_CANHOTO[campo] + ' já tem arquivo neste canhoto. Atualize a tela.');
    var pacote = arquivoSankhya(arq);
    var fd = new FormData(); fd.append('arquivo', pacote.blob, pacote.nome);
    return consultar('SELECT 1 PRONTO FROM DUAL').then(function () {
      return fetch('/mge/sessionUpload.mge?sessionkey=' + encodeURIComponent(chave) + '&fitem=S&salvar=S&useCache=N', { method: 'POST', credentials: 'include', body: fd });
    });
  }).then(function (resp) {
    if (!resp.ok) throw new Error('Falha no envio do arquivo (HTTP ' + resp.status + ').');
    return resp.text().then(function (body) {
      if (/<form\b/i.test(body) && /password|j_security_check|login/i.test(body)) throw new Error('A sessão do Sankhya expirou. Recarregue a tela.');
    });
  }).then(function () {
    var campos = {}; campos[campo] = '$file.session.key{' + chave + '}';
    return salvarRegistro('TmsCanhoto', campos, c.pk);
  }).then(function () {
    // confere o conteúdo, não só o tamanho: tem que começar com o cabeçalho de arquivo do Sankhya
    return consultar('SELECT RAWTOHEX(DBMS_LOB.SUBSTR(C.' + campo + ', 25, 1)) INI FROM TMSPROTCAN C WHERE ' + filtroPk(c.pk));
  }).then(function (r) {
    var ini = String(r[0] && r[0].INI || ''), cab = '5F5F73746172745F66696C65696E666F726D6174696F6E5F5F';
    if (ini.toUpperCase() !== cab) throw new Error('O arquivo não foi gravado no formato do Sankhya. Limpe o campo pelo Call Center e me mande a captura do upload.');
    avisar(TITULOS_CANHOTO[campo] + ' importado (' + arq.name + ').');
    return carregar();
  }).catch(function (e) { avisar(e.message || String(e), true); }).then(limpar);
}
function confirmar(titulo, texto) {
  var dlg = document.getElementById('dlgConfirma');
  document.getElementById('cTitulo').textContent = titulo;
  document.getElementById('cTexto').textContent = texto || '';
  dlg.returnValue = ''; dlg.showModal();
  return new Promise(function (resolve) { dlg.addEventListener('close', function () { resolve(dlg.returnValue === 'sim'); }, { once: true }); });
}
// Excluir o arquivo de um campo do canhoto (canhoto já validado não deixa: desmarque no Call Center antes)
function excluirDocCanhoto(i, campo, btn) {
  var c = CANHOTOS[i]; if (!c || !c.pk || !TITULOS_CANHOTO[campo]) return;
  confirmar('Excluir ' + TITULOS_CANHOTO[campo] + '?', (c.NOMEPARC || c.CODPARC) + (c.NUMNOTA ? ' · documento ' + c.NUMNOTA : '') + '\n\nO arquivo sai do canhoto. Depois é possível importar outro.').then(function (sim) {
    if (!sim) return;
    btn.disabled = true;
    var campos = {}; campos[campo] = '';
    return salvarRegistro('TmsCanhoto', campos, c.pk).then(function () { return tamanhoCampo(c, campo); }).then(function (t) {
      if (t > 0) throw new Error('O Sankhya não removeu o arquivo. Exclua pelo Call Center (o "x" ao lado do campo) e me mande a captura dessa chamada.');
      avisar(TITULOS_CANHOTO[campo] + ' excluído.'); return carregar();
    });
  }).catch(function (e) { avisar(e.message || String(e), true); btn.disabled = false; });
}
function validarCanhoto(i, btn) {
  var c = CANHOTOS[i]; if (!c || !c.pk) return;
  if (c.faltaObr && c.faltaObr.length) { avisar('Não dá para validar: falta ' + c.faltaObr.join(', ') + ' (obrigatório para o parceiro).', true); return; }
  btn.disabled = true;
  salvarRegistro('TmsCanhoto', { AD_VALIDADO: 'S' }, c.pk).then(function () {
    return consultar('SELECT C.AD_VALIDADO FROM TMSPROTCAN C WHERE ' + filtroPk(c.pk));
  }).then(function (r) {
    if (!r[0] || r[0].AD_VALIDADO !== 'S') throw new Error('O Sankhya não confirmou a validação do canhoto.');
    avisar('Canhoto validado.'); return carregar();
  }).catch(function (e) { avisar(e.message || String(e), true); btn.disabled = false; });
}

function carregarDetalhe(v) {
  var e = idPositivo(v.CODEMP, 'Empresa'), o = idPositivo(v.ORDEMCARGA, 'Viagem'), w = ' CODEMP = ' + e + ' AND ORDEMCARGA = ' + o;
  var atual = function () { return ATUAL && ATUAL.k === v.k; };
  consultar('SELECT * FROM TGFORD WHERE' + w).then(function (r) { if (atual()) setHtml('dOrdem', camposHtml(r[0], 'Todos os campos da ordem de carga')); }).catch(function () { });

  // Consulta simples (mesmo estilo da lista). ROWID e chave vêm à parte e são opcionais.
  // canhoto da viagem OU ligado a um CT-e da viagem (o Call Center grava o Nº único do CT-e no canhoto)
  var nuCtes = v.ctes.map(function (x) { return idPositivo(x.NUNOTA, 'CT-e'); });
  var wCan = ' WHERE ((C.CODEMP = ' + e + ' AND C.ORDEMCARGA = ' + o + ')' + (nuCtes.length ? ' OR C.NUNOTA IN (' + nuCtes.join(',') + ')' : '') + ')';
  var tam = ' DBMS_LOB.GETLENGTH(C.AD_TICKET) TAMT, DBMS_LOB.GETLENGTH(C.AD_CANHOTOCTE) TAMC, DBMS_LOB.GETLENGTH(C.AD_CANHOTONFE) TAMN';
  var variantes = [
    ['completa', 'SELECT C.CODPARC, P.NOMEPARC, C.NUNOTA, N.NUMNOTA, C.AD_VALIDADO,' + tam + ' FROM TMSPROTCAN C LEFT JOIN TGFPAR P ON P.CODPARC = C.CODPARC LEFT JOIN TGFCAB N ON N.NUNOTA = C.NUNOTA' + wCan + ' ORDER BY C.CODPARC, C.NUNOTA'],
    ['sem junções', 'SELECT C.CODPARC, C.NUNOTA, C.AD_VALIDADO,' + tam + ' FROM TMSPROTCAN C' + wCan],
    ['sem tamanho das imagens', 'SELECT C.CODPARC, C.NUNOTA FROM TMSPROTCAN C' + wCan]
  ];
  consultarCadeia(variantes).then(function (res) {
    var r = res.rows.map(function (x) { x.LT = x.TAMT; x.LC = x.TAMC; x.LN = x.TAMN; return x; });
    DIAG_CAN = res;
    if (!r.length && v.can.length) {
      // a lista achou canhoto e o detalhe não: usa o resumo da lista para não esconder nada
      r = v.can.map(function (s) { return { CODPARC: s.CODPARC, NOMEPARC: '', NUNOTA: null, LT: num(s.TICKET) ? 1 : 0, LC: num(s.CCTE) ? 1 : 0, LN: num(s.CNFE) ? 1 : 0, AD_VALIDADO: num(s.VALID) ? 'S' : 'N', resumo: true }; });
    }
    var contar = r.length ? Promise.resolve(null) : consultar('SELECT COUNT(*) QTD FROM TMSPROTCAN WHERE CODEMP = ' + e + ' AND ORDEMCARGA = ' + o).then(function (x) { return num(x[0] && x[0].QTD); }).catch(function (er) { return 'erro: ' + (er.message || er); });
    return pkCanhoto().then(function (pk) {
      var cols = pk.map(function (c) { return ', C.' + c + ' PK_' + c; }).join('');
      return Promise.all([
        consultar('SELECT ROWIDTOCHAR(C.ROWID) RID, C.CODPARC, C.NUNOTA' + cols + ' FROM TMSPROTCAN C' + wCan).catch(function () {
          return consultar('SELECT C.CODPARC, C.NUNOTA' + cols + ' FROM TMSPROTCAN C' + wCan).catch(function () { return []; });
        }),
        contar
      ]).then(function (x) { return { r: r, pk: pk, rids: x[0], qtd: x[1] }; });
    });
  }).then(function (d) {
    if (!atual()) return;
    var r = d.r;
    if (!r.length) {
      var diag = num(d.qtd) > 0 || typeof d.qtd === 'string';
      setHtml('dCan', (diag ? '<div class="aviso erro">A tabela TMSPROTCAN tem ' + esc(d.qtd) + ' canhoto(s) para esta viagem, mas a consulta do painel voltou vazia.</div>' + diagHtml(DIAG_CAN)
        : '<div class="aviso alerta">Nenhum canhoto lançado para a viagem. <button class="lnk" data-acao="abrirCallCenter">Abrir Call Center</button></div>'));
      carregarAnexos(v, d.pk, []); return;
    }
    var chaveNat = function (x) { return x.CODPARC + '|' + (vazio(x.NUNOTA) ? '' : x.NUNOTA); };
    var ridPor = {}, pkPor = {}, dup = {};
    d.rids.forEach(function (x) {
      var k = chaveNat(x); if (ridPor[k] !== undefined) dup[k] = 1; ridPor[k] = x.RID || null;
      var pkv = {}; d.pk.forEach(function (c) { pkv[c] = x['PK_' + c]; }); pkPor[k] = pkv;
    });
    // obrigatoriedade: a mesma regra do resumo da lista (parceiro + produto da viagem)
    var obr = {};
    v.can.forEach(function (s) { obr[s.CODPARC] = { t: num(s.OBRT) > 0, c: num(s.OBRC) > 0, n: num(s.OBRN) > 0 }; });
    CANHOTOS = r.map(function (x) {
      var k = chaveNat(x), o2 = obr[x.CODPARC] || {};
      x.RID = dup[k] ? null : ridPor[k];
      x.pk = dup[k] || !pkPor[k] || d.pk.some(function (c) { return vazio(pkPor[k][c]); }) ? null : pkPor[k];
      x.nat = { CODEMP: e, ORDEMCARGA: o, CODPARC: x.CODPARC, NUNOTA: x.NUNOTA };
      x.OBRT = o2.t ? 'S' : 'N'; x.OBRC = o2.c ? 'S' : 'N'; x.OBRN = o2.n ? 'S' : 'N';
      return x;
    });
    var porParc = {};
    r.forEach(function (x) { var p = porParc[x.CODPARC] = porParc[x.CODPARC] || { t: 0, c: 0, n: 0 }; p.t += num(x.LT) > 0; p.c += num(x.LC) > 0; p.n += num(x.LN) > 0; });
    var podeVer = function (x) { return !x.resumo; };
    var celula = function (x, i, campo, tam, ob, temNoParc) {
      if (num(tam) > 0) return podeVer(x) ? '<button class="lnk ck ok" data-acao="verCanhoto" data-i="' + i + '" data-campo="' + campo + '" title="Visualizar">\u2713 ver</button>' : ck(1, 1);
      return ck(ob === 'S' && !temNoParc, 0);
    };
    var ICO_DOC = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    var ICO_X = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    var tile = function (x, i, campo, tam, ob, temNoParc) {
      var t = TITULOS_CANHOTO[campo];
      if (num(tam) > 0) {
        return '<div class="dt ok"><div class="dt-h"><span class="di">' + ICO_DOC + '</span><b>' + t + '</b></div><div class="dt-s">Anexado · ' + fmtNum(Math.max(1, num(tam) / 1024), 0) + ' KB</div>' +
          '<div class="dt-b">' + (podeVer(x) ? '<button class="btn" data-acao="verCanhoto" data-i="' + i + '" data-campo="' + campo + '">Ver</button>' : '') +
          (x.pk && !x.resumo && x.AD_VALIDADO !== 'S' ? '<button class="btn del" data-acao="excluirDoc" data-i="' + i + '" data-campo="' + campo + '" title="Excluir este arquivo do canhoto">Excluir</button>' : '') + '</div></div>';
      }
      var falta = ob === 'S' && !temNoParc;
      return '<div class="dt ' + (falta ? 'falta' : 'opc') + '"><div class="dt-h"><span class="di">' + (falta ? ICO_X : '\u2013') + '</span><b>' + t + '</b></div><div class="dt-s">' + (falta ? 'Obrigatório · não anexado' : 'Não exigido · não anexado') + '</div>' +
        (IMPORTAR_ATIVO && x.pk && !x.resumo ? '<label class="btn imp">Importar arquivo<input type="file" accept="image/*,application/pdf" hidden data-imp="' + i + '" data-campo="' + campo + '"></label>' : '') + '</div>';
    };
    carregarAnexos(v, d.pk, CANHOTOS);
    var semImagem = r.every(function (x) { return !num(x.LT) && !num(x.LC) && !num(x.LN); });
    var blocos = r.map(function (x, i) {
      var p = porParc[x.CODPARC];
      // regra do fechamento: só valida com todos os documentos obrigatórios do parceiro anexados
      x.faltaObr = [['OBRT', p.t, 'AD_TICKET'], ['OBRC', p.c, 'AD_CANHOTOCTE'], ['OBRN', p.n, 'AD_CANHOTONFE']].filter(function (o) { return x[o[0]] === 'S' && !o[1]; }).map(function (o) { return TITULOS_CANHOTO[o[2]]; });
      var val = x.AD_VALIDADO === 'S' ? '<span class="pill p-ok">Validado</span>'
        : (!x.pk || x.resumo ? '<span class="pill p-neu">Não validado</span>'
          : x.faltaObr.length ? '<span class="pill p-acao" title="Obrigatório pela Quebra por Produto do parceiro">Falta: ' + esc(x.faltaObr.join(', ')) + '</span>'
          : '<button class="btn pri" data-acao="validarCanhoto" data-i="' + i + '">Marcar validado</button>');
      return '<div class="cb"><div class="cb-h"><div><b>' + esc(x.CODPARC + (x.NOMEPARC ? ' - ' + x.NOMEPARC : '')) + '</b>' +
        '<span>' + (x.NUNOTA ? 'Documento <button class="lnk" data-acao="abrirNota" data-nunota="' + esc(x.NUNOTA) + '">' + esc(x.NUMNOTA || x.NUNOTA) + '</button>' : 'Sem documento') + (x.pk ? ' · canhoto ' + esc(Object.keys(x.pk).map(function (k) { return x.pk[k]; }).join('/')) : '') + '</span></div>' + val + '</div>' +
        '<div class="cb-docs">' + tile(x, i, 'AD_TICKET', x.LT, x.OBRT, p.t) + tile(x, i, 'AD_CANHOTOCTE', x.LC, x.OBRC, p.c) + tile(x, i, 'AD_CANHOTONFE', x.LN, x.OBRN, p.n) + '</div></div>';
    }).join('');
    setHtml('dCan', blocos +
      (semImagem ? '<div class="aviso alerta" style="margin-top:8px">Canhoto lançado, mas sem nenhuma imagem anexada. Como nenhum documento é obrigatório para este parceiro e produto (Quebra por Produto), o fechamento não é bloqueado.</div>' : '') +
      (r.some(function (x) { return x.resumo; }) ? '<div class="aviso alerta" style="margin-top:8px">O detalhe do canhoto não retornou do servidor; mostrando o resumo da lista.</div>' + diagHtml(DIAG_CAN) : (DIAG_CAN && DIAG_CAN.usada > 0 ? diagHtml(DIAG_CAN) : '')) +
      '<div class="aviso info" style="margin-top:8px">Obrigatoriedade pela aba Quebra por Produto do parceiro (TMSPARQB): basta uma imagem de cada tipo por parceiro. Campo que já tem arquivo não aceita outro. Depois que o apontamento é confirmado, os canhotos ficam travados.' + (CANHOTOS.some(function (x) { return !x.pk; }) ? ' <b>Importar/validar indisponível: chave do canhoto não identificada.</b>' : '') + '</div>');
  }).catch(function (x) { setHtml('dCan', erroHtml(x)); carregarAnexos(v, PK_CANHOTO || [], []); });

  carregarPeso(v);
  consultar('SELECT G.* FROM TMSFVG G JOIN TGFCAB CAB ON CAB.NUNOTA = G.NUNOTA WHERE CAB.CODEMP = ' + e + ' AND CAB.ORDEMCARGA = ' + o + ' ORDER BY G.NUMCTE, G.SEQUENCIA').then(function (r) {
    if (!atual()) return;
    if (!r.length) { setHtml('dApt', '<div class="aviso alerta">Nenhum apontamento lançado no espelho.</div>'); return; }
    var ocors = r.map(function (x) { return x.NUOCOR; }).filter(function (x, i, a) { return !vazio(x) && a.indexOf(x) === i; });
    var desenhar = function (nomes) {
      setHtml('dApt', '<table class="mini"><thead><tr><th>CT-e</th><th>Seq.</th><th>Ocorrência</th><th class="num">Peso saída</th><th class="num">Peso chegada</th><th class="num">Desc. quebra</th><th class="num">Saldo calc.</th><th>Confirmado</th><th>Financeiro</th></tr></thead><tbody>' + r.map(function (x) {
        var fins = [x.NUFINDESP ? ['D', x.NUFINDESP] : null, x.NUFINREC ? ['R', x.NUFINREC] : null].filter(Boolean);
        return '<tr><td>' + esc(x.NUMCTE) + '</td><td>' + esc(x.SEQUENCIA) + '</td><td>' + esc(vazio(x.NUOCOR) ? '\u2014' : x.NUOCOR + (nomes[x.NUOCOR] ? ' - ' + nomes[x.NUOCOR] : '')) + '</td>' +
          '<td class="num">' + (vazio(x.PESOSAIDA) ? '\u2014' : fmtNum(x.PESOSAIDA, 0)) + '</td><td class="num">' + (vazio(x.PESOCHEGADA) ? '\u2014' : fmtNum(x.PESOCHEGADA, 0)) + '</td>' +
          '<td class="num">' + (num(x.VLRDESCQUEBRA) || num(x.VLRDESCCALC) ? fmtMoeda(num(x.VLRDESCQUEBRA) + num(x.VLRDESCCALC)) : '\u2014') + (x.DESCVLRQBFIN === 'S' ? ' <span title="Desconsidera valor da quebra no financeiro" style="color:var(--t3)">(desc.)</span>' : '') + '</td>' +
          '<td class="num">' + (vazio(x.VLRSALDOCALC) ? '\u2014' : fmtMoeda(x.VLRSALDOCALC)) + '</td>' +
          '<td>' + (x.CONFIRMADO === 'S' ? '<span class="ck ok">\u2713 sim</span>' : '<span class="ck falta">\u2717 não</span>') + '</td>' +
          '<td>' + (fins.length ? fins.map(function (f) { return '<button class="lnk" data-acao="abrirTitulo" data-nufin="' + esc(f[1]) + '">' + f[0] + ' ' + esc(f[1]) + '</button>'; }).join(' ') : '\u2014') + '</td></tr>';
      }).join('') + '</tbody></table>' + camposHtml(r[0], 'Todos os campos do 1º apontamento'));
    };
    if (!ocors.length) { desenhar({}); return; }
    consultar('SELECT * FROM TMSOCO WHERE NUOCOR IN (' + ocors.map(function (x) { return idPositivo(x, 'Ocorrência'); }).join(',') + ')').then(function (oc) {
      var nomes = {};
      oc.forEach(function (x) { var k = Object.keys(x).filter(function (c) { return /^(DESCR|NOME|DESC)/.test(c) && typeof x[c] === 'string'; })[0]; nomes[x.NUOCOR] = k ? x[k] : ''; });
      desenhar(nomes);
    }).catch(function () { desenhar({}); });
  }).catch(function (x) { setHtml('dApt', erroHtml(x)); });

  Promise.all([
    consultar('SELECT I.CODTIPCOB, I.VALOR, I.NUNOTA, N.NUMNOTA, N.STATUSNOTA, I.NUFIN, FIN.VLRDESDOB, FIN.VLRDESC, TO_CHAR(FIN.DTVENC, \'DD/MM/YYYY\') DTVENC, TO_CHAR(FIN.DHBAIXA, \'DD/MM/YYYY\') DHBAIXA, FIN.HISTORICO' +
      ' FROM TMSORDAFTITE I LEFT JOIN TGFCAB N ON N.NUNOTA = I.NUNOTA LEFT JOIN TGFFIN FIN ON FIN.NUFIN = I.NUFIN WHERE I.CODEMP = ' + e + ' AND I.ORDEMCARGA = ' + o + ' ORDER BY I.CODTIPCOB'),
    consultar('SELECT * FROM TMSORDAFT WHERE' + w),
    consultar("SELECT L.EVENTO, L.NUCHAVE, L.VLRATUAL, TO_CHAR(L.DHSOLICIT, 'DD/MM/YYYY HH24:MI') DHSOLICIT, L.REPROVADO FROM TSILIB L WHERE L.TABELA = 'TGFCAB' AND L.DHLIB IS NULL AND L.NUCHAVE IN (SELECT I.NUNOTA FROM TMSORDAFTITE I WHERE I.CODEMP = " + e + ' AND I.ORDEMCARGA = ' + o + ')').catch(function () { return []; })
  ]).then(function (res) {
    if (!atual()) return;
    var itens = res[0], afts = res[1], libs = res[2], h = '';
    if (!afts.length && !itens.length) { setHtml('dAft', '<div class="aviso alerta">Viagem sem afretamento lançado.</div>'); return; }
    // resumo: valores da carta frete, status e só as liberações que travam
    var a0 = afts[0] || {}, soma = function (k) { return afts.reduce(function (t, a) { return t + num(a[k]); }, 0); };
    var naoConf = afts.filter(function (a) { return String(a.STATUS || '').toUpperCase() !== 'CONFIRMADO'; });
    var docsPend = itens.filter(function (x) { return x.NUNOTA && x.STATUSNOTA !== 'L'; }).length;
    h += '<div class="grid">' +
      campo('Afretamento', esc(afts.map(function (a) { return a.CODAFT; }).join(', ')) + ' <span class="ck ' + (naoConf.length ? 'falta' : 'ok') + '">' + esc(naoConf.length ? (naoConf[0].STATUS || 'sem status') : 'confirmado') + '</span>') +
      campo('Frete motorista', fmtMoeda(soma('VLRFRTACERT'))) +
      campo('Adiantamento', fmtMoeda(soma('VLRADIANT'))) +
      campo('Saldo carta frete', fmtMoeda(soma('VLRSALDOFRETE'))) +
      campo('Saldo em aberto', v.aft ? '<span class="ck ' + (v.saldoAberto > 0.004 ? 'falta' : 'ok') + '">' + fmtMoeda(v.saldoAberto) + '</span>' : '\u2014') +
      campo('Descontos', fmtMoeda(soma('VLRDESC') + soma('VLRTAXASEGURO'))) + '</div>';
    var travas = [];
    afts.forEach(function (a) {
      [['STATUSLIBADIANTAMENTO', 'Adiantamento'], ['STATUSLIBMAXFRETE', 'Frete máximo'], ['STATUSLIBSEGAFT', 'Seguro'], ['STATUSLIBVLRAFTVLRCTE', 'Afretamento x CT-e']].forEach(function (x) {
        var cod = String(a[x[0]] || '').toUpperCase();
        if (STATUS_LIB_RUIM.indexOf(cod) >= 0) travas.push(x[1] + ': ' + (nomeOpcao('TMSORDAFT', x[0], cod) || nomeStatusLib(cod)));
      });
    });
    if (libs.length) travas.push(libs.length + ' liberação(ões) de nota aguardando');
    if (docsPend) travas.push(docsPend + ' documento(s) do afretamento sem confirmar');
    h += travas.length ? '<div class="aviso alerta" style="margin-top:8px">' + travas.map(esc).join(' · ') + '</div>'
      : '<div class="aviso info" style="margin-top:8px">Liberações aprovadas e documentos confirmados.</div>';
    setHtml('dAft', h);
  }).catch(function (x) { setHtml('dAft', erroHtml(x)); });

  consultar('SELECT * FROM TMSFVM WHERE' + w).then(function (r) {
    if (!atual()) return;
    if (!r.length) { setHtml('dFech', '<div class="aviso alerta">Fechamento ainda não lançado para esta viagem.' + (RESOURCE_FECHAMENTO ? ' <button class="lnk" data-acao="abrirFechamento">Abrir fechamento</button>' : '') + '</div>'); return; }
    var nomeSt = function (s) { return { F: 'Fechada', R: 'Reaberta', A: 'Aberta' }[s] || (s || 'Sem status'); };
    setHtml('dFech', r.map(function (x) {
      return '<div class="grid">' + campo('Status', '<span class="ck ' + (x.STATUS === 'F' ? 'ok' : 'falta') + '">' + esc(nomeSt(x.STATUS)) + '</span>') +
        campo('CT-e informado', esc([x.AD_NUCTE, x.AD_SERIECTE].filter(function (y) { return !vazio(y); }).join(' / série '))) + campo('Ordem de carga', esc(x.ORDEMCARGA)) + '</div>' + camposHtml(x, 'Todos os campos do fechamento');
    }).join('<hr style="border:0;border-top:1px solid var(--bd2);margin:10px 0">'));
  }).catch(function (x) { setHtml('dFech', erroHtml(x)); });

  consultar("SELECT F.NUFIN, F.RECDESP, F.CODTIPOPER, F.CODPARC, P.NOMEPARC, F.HISTORICO, TO_CHAR(F.DTVENC, 'DD/MM/YYYY') DTVENC, F.VLRDESDOB, F.VLRDESC, TO_CHAR(F.DHBAIXA, 'DD/MM/YYYY') DHBAIXA, F.AD_VALIDADO, F.PROVISAO" +
    ' FROM TGFFIN F LEFT JOIN TGFPAR P ON P.CODPARC = F.CODPARC WHERE F.CODEMP = ' + e + ' AND F.ORDEMCARGA = ' + o + ' ORDER BY F.RECDESP DESC, F.NUFIN').then(function (r) {
    if (!atual()) return;
    if (!r.length) { setHtml('dFin', '<div class="aviso alerta">Nenhum título ligado à viagem (TGFFIN.ORDEMCARGA).</div>'); return; }
    var grupos = [['Receitas', r.filter(function (x) { return num(x.RECDESP) > 0; })], ['Despesas', r.filter(function (x) { return num(x.RECDESP) < 0; })]].filter(function (g) { return g[1].length; });
    setHtml('dFin', '<table class="mini"><thead><tr><th>Título</th><th>TOP</th><th>Parceiro</th><th>Vencimento</th><th>Baixa</th><th>Validado</th><th class="num">Valor</th></tr></thead><tbody>' + grupos.map(function (g) {
      var tot = g[1].reduce(function (s, x) { return s + num(x.VLRDESDOB) - num(x.VLRDESC); }, 0);
      return '<tr class="grp"><td colspan="6">' + g[0] + '</td><td class="num">' + fmtMoeda(tot) + '</td></tr>' + g[1].map(function (x) {
        return '<tr><td><button class="lnk" data-acao="abrirTitulo" data-nufin="' + esc(x.NUFIN) + '">' + esc(x.NUFIN) + '</button>' + (x.HISTORICO ? '<div style="color:var(--t3);font-size:10px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(x.HISTORICO) + '">' + esc(x.HISTORICO) + '</div>' : '') + '</td>' +
          '<td>' + esc(x.CODTIPOPER) + '</td><td>' + esc(x.NOMEPARC || x.CODPARC) + '</td><td>' + esc(x.DTVENC) + (x.PROVISAO === 'S' ? ' <span style="color:var(--t3)">(provisão)</span>' : '') + '</td>' +
          '<td>' + (x.DHBAIXA ? '<span class="ck ok">' + esc(x.DHBAIXA) + '</span>' : '<span class="ck na">em aberto</span>') + '</td>' +
          '<td>' + (x.AD_VALIDADO === 'S' ? '<span class="ck ok">\u2713</span>' : '<span class="ck na">\u2013</span>') + '</td>' +
          '<td class="num">' + fmtMoeda(num(x.VLRDESDOB) - num(x.VLRDESC)) + (num(x.VLRDESC) ? '<div style="color:var(--t3);font-size:10px">desc. ' + fmtMoeda(x.VLRDESC) + '</div>' : '') + '</td></tr>';
      }).join('');
    }).join('') + '</tbody></table>');
  }).catch(function (x) { setHtml('dFin', erroHtml(x)); });
}

/* ---------- Peso de chegada: prévia (mesmas contas da TRG_INC_TMSFVG_TMS) e gravação na AD_APONTAMENTO ---------- */
// Ocorrência sugerida para o lançamento do peso (ticket de balança/descarga). Troque se for outra.
var NUOCOR_PESO_PADRAO = 10;
var PESO = null; // contexto do formulário da viagem aberta
var ENT_APONT = null;
function round(n, c) { var f = Math.pow(10, c); return Math.round((Number(n) + Number.EPSILON) * f) / f; }
// Replica a regra do trigger: quebra, tolerância, frete recalculado, desconto de quebra e saldo
function simularPeso(ct, aft, chegada) {
  var P = num(ct.PESOBRUTO), perc = num(ct.PERCTOL), tipo = String(ct.TIPOCOB || 'N').toUpperCase();
  var freteMot = num(aft.FRETE), saldoFrete = num(aft.SALDO), descContr = num(aft.DESC);
  var r = { pesoSaida: P, perc: perc, tipo: tipo, precoKg: P ? round(num(ct.VLRMERCADORIA) / P, 2) : 0, freteMot: freteMot, saldoFrete: saldoFrete,
    quebra: 0, qtdQuebra: 0, qtdAceit: 0, freteCalc: freteMot, descCalc: descContr, descQuebra: 0, saldo: saldoFrete, sobra: chegada > P };
  if (!P) return r;
  if (perc === 0) return r; // sem % de quebra no parceiro: paga o total do afretamento
  r.qtdAceit = P * perc / 100;
  if (chegada > 0 && chegada <= P) {
    r.quebra = round(Math.abs(chegada / P * 100 - 100), 6);
    var ppt = round(freteMot / (P / 1000), 6);
    r.freteCalc = round(chegada * ppt / 1000, 2);
    r.descCalc = round(r.descCalc + freteMot - r.freteCalc, 2);
  }
  r.qtdQuebra = round(P * r.quebra / 100, 2);
  if (r.qtdQuebra > r.qtdAceit) {
    if (tipo === 'P') { r.descQuebra = round((r.qtdQuebra - r.qtdAceit) * r.precoKg, 2); r.descCalc = round(r.descCalc + freteMot / P * (r.qtdQuebra - r.qtdAceit), 2); }
    else if (tipo === 'T') { r.descQuebra = round(r.qtdQuebra * r.precoKg, 2); r.descCalc = round(r.descCalc + freteMot / P * r.qtdQuebra, 2); }
  }
  r.saldo = round(saldoFrete - (r.descCalc - descContr) - r.descQuebra, 2);
  return r;
}
function entidadeApont() {
  if (ENT_APONT) return Promise.resolve(ENT_APONT);
  return consultar("SELECT NOMEINSTANCIA FROM TDDINS WHERE NOMETAB = 'AD_APONTAMENTO' ORDER BY CASE WHEN UPPER(NOMEINSTANCIA) = 'AD_APONTAMENTO' THEN 0 ELSE 1 END, NOMEINSTANCIA")
    .then(function (r) { if (!r.length) throw new Error('Tabela AD_APONTAMENTO não encontrada no dicionário (TDDINS).'); ENT_APONT = String(r[0].NOMEINSTANCIA); return ENT_APONT; });
}
function pkTabela(tab) {
  return consultar("SELECT CC.COLUMN_NAME FROM USER_CONSTRAINTS CO JOIN USER_CONS_COLUMNS CC ON CC.CONSTRAINT_NAME = CO.CONSTRAINT_NAME AND CC.TABLE_NAME = CO.TABLE_NAME WHERE CO.TABLE_NAME = '" + tab + "' AND CO.CONSTRAINT_TYPE = 'P' ORDER BY CC.POSITION")
    .then(function (r) { return r.map(function (x) { return String(x.COLUMN_NAME); }); })
    .catch(function () { return []; });
}
function carregarPeso(v) {
  var atual = function () { return ATUAL && ATUAL.k === v.k; };
  var e = idPositivo(v.CODEMP, 'Empresa'), o = idPositivo(v.ORDEMCARGA, 'Viagem');
  var nunotas = v.ctes.map(function (c) { return idPositivo(c.NUNOTA, 'CT-e'); });
  var codfvm = (v.fech.map(function (x) { return x.CODFVM; }).filter(Boolean)[0]) || null;
  Promise.all([
    consultar('SELECT CAB.NUNOTA, CAB.NUMNOTA, CAB.SERIENOTA, CAB.PESOBRUTO, CAB.CODPARC, O.CODPROD, O.VLRMERCADORIA,' +
      ' (SELECT MAX(Q.PERCTOL) FROM TMSPARQB Q WHERE Q.CODPARC = CAB.CODPARC AND Q.CODPROD = O.CODPROD) PERCTOL,' +
      ' (SELECT MAX(Q.TIPOCOB) FROM TMSPARQB Q WHERE Q.CODPARC = CAB.CODPARC AND Q.CODPROD = O.CODPROD) TIPOCOB' +
      ' FROM TGFCAB CAB LEFT JOIN TGFORD O ON O.CODEMP = CAB.CODEMP AND O.ORDEMCARGA = CAB.ORDEMCARGA WHERE CAB.NUNOTA IN (' + nunotas.join(',') + ') ORDER BY CAB.NUMNOTA'),
    consultar("SELECT SUM(NVL(VLRFRTACERT, 0)) FRETE, SUM(NVL(VLRSALDOFRETE, 0)) SALDO, SUM(NVL(VLRDESC, 0)) DESCONTO, COUNT(*) QTD FROM TMSORDAFT WHERE CODEMP = " + e + ' AND ORDEMCARGA = ' + o + " AND STATUS = 'CONFIRMADO'"),
    codfvm ? consultar('SELECT * FROM AD_APONTAMENTO WHERE CODFVM = ' + idPositivo(codfvm, 'Fechamento') + ' ORDER BY NUMCTE, SEQUENCIA').catch(function () { return []; }) : Promise.resolve([]),
    consultar('SELECT * FROM TMSOCO ORDER BY NUOCOR').catch(function () { return []; })
  ]).then(function (res) {
    if (!atual()) return;
    var ctes = res[0], a = res[1][0] || {}, aponts = res[2], ocs = res[3];
    var nomeOc = function (x) { var k = Object.keys(x).filter(function (c) { return /^(DESCR|NOME|DESC)/.test(c) && typeof x[c] === 'string'; })[0]; return k ? x[k] : ''; };
    PESO = { v: v, ctes: ctes, aft: { FRETE: a.FRETE, SALDO: a.SALDO, DESC: a.DESCONTO, QTD: num(a.QTD) }, aponts: aponts, codfvm: codfvm };
    if (!codfvm) {
      setHtml('dPeso', '<div class="aviso alerta" style="display:flex;align-items:center;gap:12px"><span style="flex:1">Esta viagem ainda não tem fechamento. Crie o fechamento para lançar o peso de chegada.</span>' +
        '<button class="btn pri" data-acao="criarFechamento">Criar fechamento</button></div>');
      return;
    }
    if (!PESO.aft.QTD) { setHtml('dPeso', '<div class="aviso alerta">Sem afretamento CONFIRMADO: o cálculo do saldo depende dele. Confirme o afretamento antes de lançar o peso.</div>'); return; }
    var temPadrao = ocs.some(function (x) { return num(x.NUOCOR) === NUOCOR_PESO_PADRAO; });
    setHtml('dPeso', '<div class="peso-f">' +
      '<label>CT-e<select id="psCte">' + ctes.map(function (c, i) {
        var ap = aponts.filter(function (x) { return String(x.NUMCTE) === String(c.NUMNOTA); })[0];
        return '<option value="' + i + '">' + esc(c.NUMNOTA + ' / ' + c.SERIENOTA) + ' · saída ' + fmtNum(c.PESOBRUTO, 0) + ' kg' + (ap ? (ap.CONFIRMADO === 'S' ? ' · confirmado' : ' · apontamento ' + ap.SEQUENCIA) : ' · sem apontamento') + '</option>';
      }).join('') + '</select></label>' +
      '<label>Ocorrência<select id="psOco">' + ocs.map(function (x) { return '<option value="' + esc(x.NUOCOR) + '"' + ((temPadrao ? num(x.NUOCOR) === NUOCOR_PESO_PADRAO : false) ? ' selected' : '') + '>' + esc(x.NUOCOR + ' - ' + nomeOc(x)) + '</option>'; }).join('') + '</select></label>' +
      '<label>Peso de chegada (kg)<input id="psPeso" class="num" inputmode="decimal" autocomplete="off" placeholder="0"></label>' +
      '<label>Data de chegada<input id="psData" type="date" value="' + isoHoje(0) + '"></label>' +
      '<button class="btn pri" data-acao="gravarPeso">Gravar peso</button>' +
      '<button class="btn" data-acao="abrirFechamento" title="Abrir o fechamento ' + esc(codfvm) + ' na tela nativa">Abrir fechamento</button>' +
      '</div><div id="psSim"></div>');
    var atualiza = function () { renderSimulacao(); };
    document.getElementById('psCte').addEventListener('change', function () { preencherPesoAtual(); atualiza(); });
    document.getElementById('psPeso').addEventListener('input', atualiza);
    preencherPesoAtual(); atualiza();
  }).catch(function (x) { setHtml('dPeso', erroHtml(x)); });
}
// Cria o fechamento (TMSFVM) da viagem pela rotina de cadastro do Sankhya; o código é numerado pelo sistema
function entidadeTabela(tab) {
  return consultar("SELECT NOMEINSTANCIA FROM TDDINS WHERE NOMETAB = '" + tab + "' ORDER BY NOMEINSTANCIA")
    .then(function (r) { if (!r.length) throw new Error('Tabela ' + tab + ' não encontrada no dicionário (TDDINS).'); return String(r[0].NOMEINSTANCIA); });
}
function camposObrigatorios(tab, jaTem) {
  return consultar("SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME = '" + tab + "' AND NULLABLE = 'N' AND DATA_DEFAULT IS NULL ORDER BY COLUMN_ID")
    .then(function (r) { return r.map(function (x) { return String(x.COLUMN_NAME); }).filter(function (c) { return jaTem.indexOf(c) < 0; }); })
    .catch(function () { return []; });
}
function criarFechamento(btn) {
  var v = ATUAL; if (!v) return;
  var e = idPositivo(v.CODEMP, 'Empresa'), o = idPositivo(v.ORDEMCARGA, 'Viagem');
  confirmar('Criar o fechamento da viagem ' + o + '?', 'Empresa ' + e + '. O fechamento é criado em aberto, para lançar o apontamento e o peso de chegada.').then(function (sim) {
    if (!sim) return;
    btn.disabled = true;
    // confere de novo: outro usuário pode ter criado nesse meio tempo
    return consultar('SELECT CODFVM FROM TMSFVM WHERE CODEMP = ' + e + ' AND ORDEMCARGA = ' + o).then(function (r) {
      if (r.length) return r;
      var c0 = v.ctes[0] || {};
      var campos = { CODEMP: e, ORDEMCARGA: o };
      if (c0.NUMNOTA) { campos.AD_NUCTE = c0.NUMNOTA; campos.AD_SERIECTE = c0.SERIENOTA; }
      return entidadeTabela('TMSFVM').then(function (ent) { return salvarRegistro(ent, campos, {}); })
        .catch(function (err) {
          return camposObrigatorios('TMSFVM', ['CODFVM', 'CODEMP', 'ORDEMCARGA']).then(function (falta) {
            throw new Error((err.message || err) + (falta.length ? '\nCampos obrigatórios na TMSFVM: ' + falta.join(', ') + '. Me mande a captura do Salvar de um fechamento novo na tela nativa.' : ''));
          });
        })
        .then(function () { return consultar('SELECT CODFVM FROM TMSFVM WHERE CODEMP = ' + e + ' AND ORDEMCARGA = ' + o); });
    }).then(function (r) {
      if (!r.length) throw new Error('O Sankhya não confirmou a criação do fechamento.');
      avisar('Fechamento ' + r[0].CODFVM + ' criado para a viagem ' + o + '. Agora lance o peso de chegada.');
      return carregar();
    });
  }).catch(function (x) { avisar(x.message || String(x), true); }).then(function () { btn.disabled = false; });
}
// Série/Nº do CT-e no cabeçalho do fechamento (AD_SERIECTE/AD_NUCTE): preenche se estiver vazio
function preencherCteFechamento(codfvm, ct) {
  var fvm = idPositivo(codfvm, 'Fechamento');
  return consultar('SELECT AD_NUCTE, AD_SERIECTE FROM TMSFVM WHERE CODFVM = ' + fvm).then(function (r) {
    var x = r[0] || {};
    if (!vazio(x.AD_NUCTE) || !ct || !ct.NUMNOTA) return;
    return entidadeTabela('TMSFVM').then(function (ent) { return salvarRegistro(ent, { AD_NUCTE: ct.NUMNOTA, AD_SERIECTE: ct.SERIENOTA }, { CODFVM: fvm }); })
      .catch(function (err) { avisar('Fechamento sem Série/Nº do CT-e (não consegui preencher: ' + (err.message || err) + ').', true); });
  }).catch(function () { });
}
function apontDoCte(ct) { return PESO.aponts.filter(function (x) { return String(x.NUMCTE) === String(ct.NUMNOTA) && String(x.SERIE || ct.SERIENOTA) === String(ct.SERIENOTA); })[0] || null; }
function preencherPesoAtual() {
  var ct = PESO.ctes[Number(document.getElementById('psCte').value)], ap = apontDoCte(ct), inp = document.getElementById('psPeso');
  inp.value = ap && num(ap.PESOCHEGADA) ? fmtNum(ap.PESOCHEGADA, 0) : '';
  inp.disabled = !!(ap && ap.CONFIRMADO === 'S');
  var oc = document.getElementById('psOco'); if (ap && ap.NUOCOR != null) oc.value = String(ap.NUOCOR); oc.disabled = !!ap;
}
function lerPesoDigitado() { var t = String(document.getElementById('psPeso').value || '').replace(/\./g, '').replace(',', '.').trim(); return t ? Number(t) : 0; }
function renderSimulacao() {
  var el = document.getElementById('psSim'); if (!el || !PESO) return;
  var ct = PESO.ctes[Number(document.getElementById('psCte').value)], ap = apontDoCte(ct), ch = lerPesoDigitado();
  if (ap && ap.CONFIRMADO === 'S') { el.innerHTML = '<div class="aviso info" style="margin-top:10px">Apontamento confirmado: peso de chegada ' + fmtNum(ap.PESOCHEGADA, 0) + ' kg, saldo ' + fmtMoeda(ap.VLRSALDOCALC) + '. Para alterar, reabra o apontamento (parâmetro 13).</div>'; return; }
  if (!(ch > 0)) { el.innerHTML = '<div class="aviso info" style="margin-top:10px">Informe o peso de chegada para ver o cálculo da quebra e do saldo do motorista.</div>'; return; }
  var r = simularPeso(ct, PESO.aft, ch), dif = ch - r.pesoSaida;
  var cel = function (l, v, cls) { return '<div class="' + (cls || '') + '"><div class="l">' + l + '</div><div class="v' + (cls === 'dest' ? '' : '') + '">' + v + '</div></div>'; };
  el.innerHTML = '<div class="sim">' +
    cel('Peso saída', fmtNum(r.pesoSaida, 0) + ' kg') +
    cel('Diferença', '<span class="' + (dif < 0 ? 'ck falta' : 'ck ok') + '">' + (dif > 0 ? '+' : '') + fmtNum(dif, 0) + ' kg</span>') +
    cel('Quebra', fmtNum(r.quebra, 3) + '% · ' + fmtNum(r.qtdQuebra, 0) + ' kg') +
    cel('Tolerância', r.perc ? fmtNum(r.perc, 2) + '% · ' + fmtNum(r.qtdAceit, 0) + ' kg' : 'não cadastrada') +
    cel('Frete motorista', fmtMoeda(r.freteMot) + (r.freteCalc !== r.freteMot ? ' \u2192 ' + fmtMoeda(r.freteCalc) : '')) +
    cel('Desconto quebra', '<span class="' + (r.descQuebra ? 'ck falta' : '') + '">' + fmtMoeda(r.descQuebra) + '</span>' + (r.descQuebra ? ' <span style="font-size:11px;color:var(--t3)">(' + (r.tipo === 'T' ? 'integral' : 'parcial') + ', ' + fmtMoeda(r.precoKg) + '/kg)</span>' : '')) +
    cel('Saldo carta frete', fmtMoeda(r.saldoFrete)) +
    cel('Saldo a pagar (calc.)', '<span class="' + (r.saldo < r.saldoFrete ? 'ck falta' : 'ck ok') + '">' + fmtMoeda(r.saldo) + '</span>', 'dest') +
    '</div>' +
    (!r.perc ? '<div class="aviso info" style="margin-top:8px">Parceiro/produto sem % de quebra na Quebra por Produto: paga o total do afretamento, sem desconto por peso.</div>' : '') +
    (r.sobra ? '<div class="aviso info" style="margin-top:8px">Peso de chegada maior que o de saída: não há quebra.</div>' : '') +
    '<div style="font-size:11px;color:var(--t3);margin-top:6px">Prévia pelas regras da TRG_INC_TMSFVG_TMS. O valor oficial é o que o banco calcula ao gravar.</div>';
}
function gravarPeso(btn) {
  if (!PESO || !ATUAL) return;
  var ct = PESO.ctes[Number(document.getElementById('psCte').value)], ap = apontDoCte(ct), ch = lerPesoDigitado();
  if (!(ch > 0)) { avisar('Informe o peso de chegada.', true); return; }
  if (ap && ap.CONFIRMADO === 'S') { avisar('Apontamento confirmado: reabra antes de alterar o peso.', true); return; }
  var dataIso = document.getElementById('psData').value, oco = document.getElementById('psOco').value;
  if (!ap && !oco) { avisar('Escolha a ocorrência.', true); return; }
  btn.disabled = true;
  preencherCteFechamento(PESO.codfvm, ct).then(entidadeApont).then(function (ent) {
    if (ap) {
      return pkTabela('AD_APONTAMENTO').then(function (pk) {
        if (!pk.length) pk = ['CODFVM', 'SEQUENCIA'];
        var chave = {}; pk.forEach(function (c) { chave[c] = ap[c]; });
        if (pk.some(function (c) { return vazio(chave[c]); })) throw new Error('Chave do apontamento incompleta (' + pk.join(', ') + ').');
        var campos = { PESOCHEGADA: ch }; if (dataIso) campos.DTCHEGADA = toOracleData(dataIso);
        return salvarRegistro(ent, campos, chave);
      });
    }
    // novo apontamento: o TRG_AD_APONTAMENTO_BI completa o resto e cria a TMSFVG (que calcula).
    // A SEQUENCIA já vai calculada igual ao trigger (maior entre o fechamento e a TMSFVG do Nº do CT-e),
    // senão o trigger troca a chave e o Sankhya não acha o registro depois de gravar.
    var fvm = idPositivo(PESO.codfvm, 'Fechamento'), nct = idPositivo(ct.NUMNOTA, 'CT-e');
    return consultar('SELECT GREATEST((SELECT NVL(MAX(SEQUENCIA), 0) + 1 FROM AD_APONTAMENTO WHERE CODFVM = ' + fvm + '), (SELECT NVL(MAX(SEQUENCIA), 0) + 1 FROM TMSFVG WHERE NUMCTE = ' + nct + ')) SEQ FROM DUAL').then(function (r) {
      var novo = { CODFVM: fvm, CODEMP: idPositivo(ATUAL.CODEMP, 'Empresa'), NUMCTE: nct, SEQUENCIA: num(r[0] && r[0].SEQ) || 1, SERIE: ct.SERIENOTA, NUOCOR: oco, PESOCHEGADA: ch };
      if (dataIso) novo.DTCHEGADA = toOracleData(dataIso);
      return salvarRegistro(ent, novo, {}).catch(function (err) {
        // gravou mas o Sankhya não recarregou pela chave: confere no banco antes de dar erro
        if (!/carregar entidade/i.test(String(err.message || err))) throw err;
        return consultar('SELECT COUNT(*) QTD FROM AD_APONTAMENTO WHERE CODFVM = ' + fvm + ' AND NUMCTE = ' + nct).then(function (x) { if (!num(x[0] && x[0].QTD)) throw err; });
      });
    });
  }).then(function () {
    return consultar('SELECT * FROM AD_APONTAMENTO WHERE CODFVM = ' + idPositivo(PESO.codfvm, 'Fechamento') + ' AND NUMCTE = ' + idPositivo(ct.NUMNOTA, 'CT-e') + ' ORDER BY SEQUENCIA DESC');
  }).then(function (r) {
    var x = r[0];
    if (!x || Math.abs(num(x.PESOCHEGADA) - ch) > 0.5) throw new Error('O Sankhya não confirmou o peso gravado.');
    avisar('Peso de chegada gravado: ' + fmtNum(ch, 0) + ' kg. Saldo calculado pelo sistema: ' + fmtMoeda(x.VLRSALDOCALC) + '.');
    return carregar();
  }).catch(function (e) { avisar(e.message || String(e), true); }).then(function () { btn.disabled = false; });
}

/* ---------- layout empilhado ---------- */
function ligarLayoutEmpilhado() {
  // clique fora da janela do detalhe (no fundo escurecido) fecha e volta para a lista
  document.getElementById('area').addEventListener('click', function (e) { if (e.target === this && document.getElementById('det').classList.contains('open')) fecharDetalhe(); });
  var area = document.getElementById('area'), alca = document.getElementById('alca'), lista = area.querySelector('.lista');
  var salvo = Number(stGet('hLista')); if (salvo >= 120) area.style.setProperty('--hLista', salvo + 'px');
  var y0, h0;
  var mover = function (e) {
    var y = (e.touches ? e.touches[0] : e).clientY, max = Math.max(160, area.clientHeight - 260);
    area.style.setProperty('--hLista', Math.round(Math.max(120, Math.min(max, h0 + y - y0))) + 'px');
  };
  var soltar = function () {
    alca.classList.remove('arr'); stSet('hLista', parseInt(getComputedStyle(area).getPropertyValue('--hLista'), 10) || lista.offsetHeight);
    document.removeEventListener('mousemove', mover); document.removeEventListener('mouseup', soltar);
    document.removeEventListener('touchmove', mover); document.removeEventListener('touchend', soltar);
  };
  var pegar = function (e) {
    y0 = (e.touches ? e.touches[0] : e).clientY; h0 = lista.offsetHeight; alca.classList.add('arr');
    document.addEventListener('mousemove', mover); document.addEventListener('mouseup', soltar);
    document.addEventListener('touchmove', mover, { passive: false }); document.addEventListener('touchend', soltar);
    e.preventDefault();
  };
  alca.addEventListener('mousedown', pegar); alca.addEventListener('touchstart', pegar, { passive: false });
  alca.addEventListener('dblclick', function () { area.style.removeProperty('--hLista'); stSet('hLista', ''); });
  // botões do rodapé sobem para o cabeçalho do detalhe; a mensagem vai junto do subtítulo
  var hd = document.querySelector('#det .det-hd'), ft = document.querySelector('#det .det-ft'), pill = document.getElementById('dPill');
  var box = document.createElement('div'); box.className = 'acoes';
  Array.prototype.slice.call(ft.querySelectorAll('button')).forEach(function (b) { box.appendChild(b); });
  hd.insertBefore(box, pill);
  var msg = document.getElementById('dMsg'); msg.style.display = 'block'; msg.style.marginTop = '2px';
  document.getElementById('dMeta').parentNode.appendChild(msg);
}

/* ---------- moldura do Sankhya ---------- */
function esconderMolduraSankhya() {
  var esconder = function (doc) {
    if (!doc) return;
    doc.querySelectorAll('.VCompactBar,.VCompactBar-opened').forEach(function (el) { el.style.setProperty('display', 'none', 'important'); el.style.setProperty('width', '0px', 'important'); });
    doc.querySelectorAll('table.DashWindow-TopBar').forEach(function (tbl) { var w = tbl.closest('div[style*="height"]'); if (w) { w.style.setProperty('height', '0px', 'important'); w.style.setProperty('display', 'none', 'important'); } });
    doc.querySelectorAll('.HCompactBar').forEach(function (el) { el.style.setProperty('display', 'none', 'important'); var p = el.parentElement; if (p) { p.style.setProperty('height', '0px', 'important'); p.style.setProperty('display', 'none', 'important'); } });
    doc.querySelectorAll('.DashWindow').forEach(function (dw) {
      dw.style.setProperty('padding-top', '0px', 'important');
      dw.querySelectorAll('div[style*="inset"]').forEach(function (el) { if (/inset:\s*\d+px/.test(el.getAttribute('style') || '')) { el.style.top = '0px'; el.style.inset = '0px'; } });
    });
    doc.querySelectorAll('button.chartConfigButton').forEach(function (b) { b.style.setProperty('display', 'none', 'important'); });
    try {
      var tw = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_TEXT, null), no;
      while ((no = tw.nextNode())) {
        if (!/Você está em uma tela personalizada/.test(no.nodeValue || '')) continue;
        var el = no.parentElement, alvo = el, n = 0;
        while (el && el.parentElement && el.parentElement !== doc.body && el.parentElement !== doc.documentElement && n < 4) {
          var pai = el.parentElement;
          if ((pai.textContent || '').trim().length > 80 || pai.offsetHeight > 90) break;
          el = pai; alvo = pai; n++;
        }
        if (alvo) alvo.style.setProperty('display', 'none', 'important');
      }
    } catch (e) { }
  };
  try { esconder(document); } catch (e) { }
  try { if (window.parent && window.parent.document) esconder(window.parent.document); } catch (e) { }
}

/* ---------- eventos da tela ---------- */
function iniciar() {
  if (stGet('dark') === '1') document.getElementById('dx').classList.add('theme-dark');
  try { var f = JSON.parse(stGet('filtros') || '{}'); if (f.emp) document.getElementById('fEmp').value = f.emp; document.getElementById('fConcluidas').checked = !!f.concl; } catch (e) { }
  document.getElementById('btnTema').addEventListener('click', toggleTheme);
  document.getElementById('btnAtualizar').addEventListener('click', carregar);
  document.getElementById('btnCsv').addEventListener('click', exportarCsv);
  document.getElementById('btnAplicar').addEventListener('click', function () {
    stSet('filtros', JSON.stringify({ emp: document.getElementById('fEmp').value.trim(), concl: document.getElementById('fConcluidas').checked }));
    carregar();
  });
  document.getElementById('btnLimpar').addEventListener('click', function () {
    ['fIni', 'fFim', 'fEmp', 'fViagem'].forEach(function (id) { document.getElementById(id).value = ''; });
    document.getElementById('fConcluidas').checked = false;
    stSet('filtros', '{}'); carregar();
  });
  document.getElementById('chips').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (!b) return; FILTRO_GRUPO = b.dataset.grupo; renderTudo(); });
  document.querySelectorAll('.kc[data-grupo]').forEach(function (k) { k.addEventListener('click', function () { FILTRO_GRUPO = FILTRO_GRUPO === k.dataset.grupo ? 'abertas' : k.dataset.grupo; renderTudo(); }); });
  document.getElementById('busca').addEventListener('input', renderLista);
  document.querySelector('#tblViagens thead').addEventListener('click', function (e) {
    var th = e.target.closest('th[data-col]'); if (!th) return;
    ORDEM = { col: th.dataset.col, dir: ORDEM.col === th.dataset.col ? -ORDEM.dir : 1 }; renderLista();
  });
  document.querySelector('#tblViagens tbody').addEventListener('click', function (e) {
    var wa = e.target.closest('[data-wa]'); if (wa) { var vw = VIAGENS.filter(function (x) { return x.k === wa.dataset.wa; })[0]; if (vw) abrirWhats(vw); return; }
    var tr = e.target.closest('tr[data-k]'); if (!tr) return;
    var v = VIAGENS.filter(function (x) { return x.k === tr.dataset.k; })[0];
    if (v) abrirDetalhe(v);
  });
  document.getElementById('dFechar').addEventListener('click', fecharDetalhe);
  document.getElementById('dBody').addEventListener('click', function (e) {
    var b = e.target.closest('[data-acao]'); if (!b || !ATUAL) return;
    var a = b.dataset.acao;
    if (a === 'abrirNota') abrirTela(RESOURCE_CENTRAL_NOTAS, { NUNOTA: String(b.dataset.nunota) });
    if (a === 'abrirTitulo') abrirTela(RESOURCE_FINANCEIRO, { NUFIN: String(b.dataset.nufin) });
    if (a === 'abrirViagem') abrirTela(RESOURCE_VIAGEM, pkViagem(ATUAL));
    if (a === 'abrirFechamento') abrirFechamentoTela(ATUAL);
    if (a === 'abrirCallCenter') abrirTela(RESOURCE_CALL_CENTER, pkViagem(ATUAL));
    if (a === 'verCanhoto') verCanhoto(Number(b.dataset.i), b.dataset.campo);
    if (a === 'verAnexos') verAnexos(Number(b.dataset.i));
    if (a === 'whats') abrirWhats(ATUAL);
    if (a === 'gravarPeso') gravarPeso(b);
    if (a === 'criarFechamento') criarFechamento(b);
    if (a === 'validarCanhoto') validarCanhoto(Number(b.dataset.i), b);
    if (a === 'excluirDoc') excluirDocCanhoto(Number(b.dataset.i), b.dataset.campo, b);
  });
  document.getElementById('bViagem').addEventListener('click', function () { if (ATUAL) abrirTela(RESOURCE_VIAGEM, pkViagem(ATUAL)); });
  document.getElementById('bFechamento').addEventListener('click', function () { if (ATUAL) abrirFechamentoTela(ATUAL); });
  document.getElementById('bWhats').addEventListener('click', function () { if (ATUAL) abrirWhats(ATUAL); });
  document.getElementById('bCallCenter').addEventListener('click', function () { if (ATUAL) abrirTela(RESOURCE_CALL_CENTER, pkViagem(ATUAL)); });
  document.getElementById('docTabs').addEventListener('click', function (e) { var b = e.target.closest('[data-campo]'); if (b) verCanhoto(Number(b.dataset.i), b.dataset.campo); });
  document.getElementById('dBody').addEventListener('change', function (e) {
    var inp = e.target.closest('input[data-imp]'); if (!inp || !inp.files || !inp.files[0]) return;
    importarCanhoto(Number(inp.dataset.imp), inp.dataset.campo, inp.files[0], inp);
  });
  document.getElementById('docFechar').addEventListener('click', function () { document.getElementById('dlgDoc').close(); });
  document.getElementById('dlgDoc').addEventListener('close', function () { document.getElementById('docCorpo').innerHTML = ''; if (verCanhoto.url) { URL.revokeObjectURL(verCanhoto.url); verCanhoto.url = null; } });
  document.getElementById('toast').addEventListener('click', function () { clearTimeout(avisar.t); this.className = 'toast'; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ATUAL) fecharDetalhe(); });
  ligarLayoutEmpilhado();
  esconderMolduraSankhya();
  setInterval(esconderMolduraSankhya, 800);
  carregarOpcoes().then(carregar);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
</script>
<!-- =====================================================================
  VOCERO EMBUTIDO — painel lateral do gadget [CALL CENTER] (Sankhya)
  Spec Vocero: specs/010-modo-embutido
  Como usar: colar este bloco inteiro logo antes do </body> do JSP do
  componente HTML5 do CALL CENTER e ajustar a constante VOCERO abaixo.

  API:
    VoceroPainel.abrir()                     -> abre a caixa de entrada
    VoceroPainel.abrir(telefone, nome)       -> abre a conversa do telefone
    VoceroPainel.abrirTela("queue"|"pipeline"|"inbox")
    VoceroPainel.fechar()

  Os links/janelas de WhatsApp (wa.me, api.whatsapp.com, web.whatsapp.com)
  que já existem na tela passam a abrir no Vocero automaticamente
  (INTERCEPTAR_WHATSAPP = true). Para passar o nome do motorista num link,
  acrescente data-nome="..." no <a>.
====================================================================== -->
<style>
#vcr-painel{position:fixed;top:0;right:0;height:100%;width:min(560px,100%);
  background:#fff;box-shadow:-8px 0 24px rgba(0,0,0,.18);z-index:2147483000;
  display:flex;flex-direction:column;transform:translateX(105%);
  transition:transform .2s ease,width .2s ease;visibility:hidden}
#vcr-painel.aberto{transform:none;visibility:visible}
#vcr-painel.cheio{width:100%}
#vcr-painel .vcr-barra{display:flex;align-items:center;gap:6px;padding:8px 10px;
  border-bottom:1px solid #e1e6e3;background:#f6fbf5;
  font:13px "Segoe UI",Roboto,Arial,sans-serif;color:#1f2a24}
#vcr-painel .vcr-titulo{flex:1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#vcr-painel .vcr-btn{border:1px solid #cfd8d3;background:#fff;color:#33433a;border-radius:6px;
  padding:3px 9px;cursor:pointer;font:inherit;line-height:18px}
#vcr-painel .vcr-btn:hover{border-color:#3fa535;background:#eef7ec}
#vcr-painel .vcr-btn.on{background:#3fa535;border-color:#3fa535;color:#fff}
#vcr-frame{flex:1;width:100%;border:0;background:#fff}
/* Fechamento de Viagens: painel entre o detalhe (z 90) e o toast (z 200);
   com o painel aberto o detalhe encolhe para ficar lado a lado */
#vcr-painel{z-index:150}
html.vcr-aberto:not(.vcr-cheio) #dx .det.open{right:calc(min(560px,100%) + 10px)}
</style>

<div id="vcr-painel" role="dialog" aria-label="Vocero" aria-hidden="true">
  <div class="vcr-barra">
    <span class="vcr-titulo" id="vcr-titulo">Vocero</span>
    <button type="button" class="vcr-btn" data-vcr-tela="inbox" title="Caixa de entrada">Caixa</button>
    <button type="button" class="vcr-btn" data-vcr-tela="queue" title="Fila">Fila</button>
    <button type="button" class="vcr-btn" id="vcr-expandir" title="Expandir / recolher">&#x2922;</button>
    <button type="button" class="vcr-btn" id="vcr-novaaba" title="Abrir o Vocero em nova aba (login próprio; notificações push funcionam lá)">&#x2197;</button>
    <button type="button" class="vcr-btn" id="vcr-fechar" title="Fechar (Esc)">&#x2715;</button>
  </div>
  <iframe id="vcr-frame" title="Vocero" allow="microphone; clipboard-write; autoplay"></iframe>
</div>

<script>
var VoceroPainel = (function () {
  "use strict";

  /* ---------- CONFIGURAÇÃO ---------- */
  var VOCERO = "https://sankhya.vocero.com.br"; // instância de testes do embutido
  var INTERCEPTAR_WHATSAPP = false;                  // aqui o abrirWhats() já chama o Vocero
  /* ---------------------------------- */

  VOCERO = VOCERO.replace(/\/+$/, "");
  var painel = document.getElementById("vcr-painel");
  var frame = document.getElementById("vcr-frame");
  var titulo = document.getElementById("vcr-titulo");
  var srcAtual = "";

  // "18 - MARCELO OLIVEIRA DOS SANTOS" -> "MARCELO OLIVEIRA DOS SANTOS"
  function limparNome(nome) {
    return String(nome || "").replace(/^\s*\d+\s*-\s*/, "").trim();
  }

  function carregar(url) {
    if (url !== srcAtual) { srcAtual = url; frame.src = url; }
  }

  function mostrar(texto) {
    titulo.textContent = texto ? "Vocero · " + texto : "Vocero";
    painel.classList.add("aberto");
    painel.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("vcr-aberto");
  }

  function abrirTela(tela) {
    tela = tela || "inbox";
    carregar(VOCERO + "/" + tela + "?embed=1");
    marcarTela(tela);
    mostrar("");
  }

  function abrir(telefone, nome) {
    var tel = String(telefone || "").trim();
    if (!tel) {
      // sem telefone: mostra o que já estava aberto ou a caixa de entrada
      if (!srcAtual) abrirTela("inbox"); else mostrar("");
      return;
    }
    nome = limparNome(nome);
    var url = VOCERO + "/inbox?embed=1&phone=" + encodeURIComponent(tel) +
              (nome ? "&name=" + encodeURIComponent(nome) : "");
    carregar(url);
    marcarTela("");
    mostrar(nome || tel);
  }

  function fechar() {
    // só esconde: o quadro continua carregado (sem perder a conversa/login)
    painel.classList.remove("aberto");
    painel.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("vcr-aberto");
  }

  function marcarTela(tela) {
    var bs = painel.querySelectorAll("[data-vcr-tela]");
    for (var i = 0; i < bs.length; i++)
      bs[i].classList.toggle("on", bs[i].getAttribute("data-vcr-tela") === tela);
  }

  /* ---------- botões da barra ---------- */
  painel.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-vcr-tela]") : null;
    if (b) abrirTela(b.getAttribute("data-vcr-tela"));
  });
  document.getElementById("vcr-fechar").onclick = fechar;
  document.getElementById("vcr-expandir").onclick = function () {
    document.documentElement.classList.toggle("vcr-cheio", painel.classList.toggle("cheio"));
  };
  document.getElementById("vcr-novaaba").onclick = function () {
    window.open(VOCERO + "/inbox?embed=0", "_blank", "noopener");
  };
  // Esc fecha só o painel (captura antes dos atalhos da tela por baixo)
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && painel.classList.contains("aberto")) {
      e.stopImmediatePropagation(); e.preventDefault(); fechar();
    }
  }, true);

  /* ---------- interceptar WhatsApp já existente na tela ---------- */
  var RE_WA = /^(https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\/|whatsapp:)/i;

  function telefoneDoLink(url) {
    var m = String(url).match(/wa\.me\/\+?(\d{8,15})/i) ||
            String(url).match(/[?&]phone=\+?(\d{8,15})/i);
    return m ? m[1] : "";
  }

  if (INTERCEPTAR_WHATSAPP) {
    document.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest("a[href]") : null;
      if (!a || !RE_WA.test(a.getAttribute("href"))) return;
      var tel = a.getAttribute("data-telefone") || telefoneDoLink(a.href);
      if (!tel) return;                       // link sem número: deixa seguir
      e.preventDefault();
      e.stopPropagation();
      abrir(tel, a.getAttribute("data-nome") || "");
    }, true);

    var openOriginal = window.open;
    window.open = function (url) {
      if (url && RE_WA.test(String(url))) {
        var tel = telefoneDoLink(url);
        if (tel) { abrir(tel, ""); return null; }
      }
      return openOriginal.apply(window, arguments);
    };
  }

  return { abrir: abrir, abrirTela: abrirTela, fechar: fechar, VOCERO: VOCERO };
})();

// Compatível com o exemplo da spec 010
function abrirWhatsAppVocero(telefone, nome) { VoceroPainel.abrir(telefone, nome); }
</script>
<!-- ===================== fim VOCERO EMBUTIDO ===================== -->

</body>
</html>
