import {channels,fixtures,isPixel,isSerial,protocols} from "./show.js";
import {circuitSpan,review} from "./patch.js";
import {channelRange,matrixGroups,outputLabel,portLoad} from "./matrix.js";

// A printable build sheet for the field: overview, whole-show matrix, then one
// page per controller with a wiring schematic and a connection checklist.

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad = n => String(n).padStart(2,"0");
const short = kind => kind==="pixel" ? "P" : kind==="dmx" ? "S" : "CH";
const word = kind => kind==="pixel" ? "Port" : kind==="dmx" ? "Slot" : "Channel";
const ROWS = 17, MATRIX_COLS = 16;

function size(f) {
 return isPixel(f) ? f.count+" px" : channels(f)>1 ? channels(f)+" ch" : "1 ch";
}

// One schematic row per strand; extra strands on a pixel port chain after the first.
function wiringRows(group) {
 const {box,model,outputs} = group, rows = [], dense = model.ports > 32;
 for (let n = 1; n <= model.ports; n++) {
  const list = outputs.get(n) || [];
  if (dense && !list.length) continue;
  if (model.kind!=="pixel" && list.length===1) {
   const [a,b] = circuitSpan(list[0],model.kind);
   if (a!==n) continue;
   rows.push({n,last:b,f:list[0],first:true});
   continue;
  }
  if (!list.length) { rows.push({n,last:n}); continue; }
  [...list].sort((x,y)=>x.offset-y.offset).forEach((f,i)=>rows.push({n,last:n,f,first:i===0}));
 }
 return rows.map(r => ({...r,label:outputLabel(box,r.n),off:box.offPorts?.includes(r.n)}));
}

function schematic(group,network,rows,part,parts) {
 const {box,model} = group, H = 34, top = 74, W = 1000;
 const height = top + rows.length*H + 22, jackX = 300, cardX = 560;
 const y = i => top + i*H + H/2;
 const out = [];
 out.push(`<svg class="wiring" viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(box.name)} wiring${parts>1?", part "+part+" of "+parts:""}">`);
 out.push(`<rect x="20" y="16" width="${jackX-20}" height="${height-30}" rx="14" class="box"/>`);
 out.push(`<text x="40" y="44" class="boxName">${esc(box.name)}</text>`);
 out.push(`<text x="40" y="62" class="boxMeta">${esc([model.name,network?.name,isSerial(network)?"ID "+box.unit:network&&protocols[network.protocol]].filter(Boolean).join(" · "))}</text>`);
 // Summary in the box body, below the header and clear of the jack numbers.
 const strands = [...group.outputs.values()].flat().filter((f,i,a)=>a.indexOf(f)===i);
 const pixels = strands.filter(isPixel).reduce((n,f)=>n+f.count,0);
 const facts = [["Outputs in use",group.outputs.size+" of "+model.ports],pixels&&["Pixels",pixels],strands.length&&["Fixtures",strands.length],box.notes&&["Notes",box.notes.length>28?box.notes.slice(0,27)+"…":box.notes]].filter(Boolean);
 facts.forEach(([k,v],i)=>out.push(`<text x="40" y="${104+i*36}" class="factKey">${esc(k)}</text><text x="40" y="${121+i*36}" class="factVal">${esc(v)}</text>`));
 if (parts>1) out.push(`<text x="${W-14}" y="30" text-anchor="end" class="boxMeta">Part ${part} of ${parts}</text>`);
 rows.forEach((r,i) => {
  const cy = y(i), jack = short(model.kind)+(r.last>r.n ? pad(r.n)+"–"+pad(r.last) : pad(r.n));
  if (r.first || !r.f) {
   out.push(`<text x="${jackX-18}" y="${cy+4}" text-anchor="end" class="jackNo${r.f?"":" idle"}">${jack}</text>`);
   out.push(`<circle cx="${jackX}" cy="${cy}" r="7" class="jack${r.f?" used":""}${r.off?" off":""}"/>`);
   if (r.off) out.push(`<path d="M${jackX-5} ${cy-5}l10 10m0-10l-10 10" class="offMark"/>`);
  }
  if (!r.f) {
   out.push(`<line x1="${jackX+9}" y1="${cy}" x2="${jackX+70}" y2="${cy}" class="idleWire"/>`);
   out.push(`<text x="${jackX+80}" y="${cy+4}" class="idleText">${r.off?"Off":"Free"}${r.label?" · labeled "+esc(r.label):""}</text>`);
   return;
  }
  const color = esc(r.f.color);
  if (r.first) {
   out.push(`<line x1="${jackX+8}" y1="${cy}" x2="${cardX}" y2="${cy}" class="wireUnder"/>`);
   out.push(`<line x1="${jackX+8}" y1="${cy}" x2="${cardX}" y2="${cy}" class="wire" style="stroke:${color}"/>`);
   if (r.label && r.label!==r.f.name) out.push(`<text x="${(jackX+cardX)/2+4}" y="${cy-7}" text-anchor="middle" class="wireLabel">${esc(r.label)}</text>`);
  } else {
   // A chained strand continues from the end of the strand above it.
   const py = y(i-1);
   out.push(`<path d="M${cardX+10} ${py+H/2-6}V${cy}H${cardX}" class="chain"/>`);
   out.push(`<text x="${cardX-8}" y="${cy+4}" text-anchor="end" class="chainText">then</text>`);
  }
  const meta = [r.f.zone,fixtures[r.f.type],size(r.f),channelRange(r.f,box,network),isPixel(r.f)&&model.kind==="pixel"&&"px "+r.f.offset+"–"+(r.f.offset+r.f.count-1)].filter(Boolean).join(" · ");
  out.push(`<g class="card"><rect x="${cardX}" y="${cy-H/2+4}" width="${W-cardX-14}" height="${H-8}" rx="7"/>`);
  out.push(`<rect x="${cardX}" y="${cy-H/2+4}" width="9" height="${H-8}" rx="3" style="fill:${color}"/>`);
  out.push(`<text x="${cardX+20}" y="${cy-1}" class="fxName">${esc(r.f.name)}${r.off?' <tspan class="offTag">OUTPUT OFF</tspan>':""}</text>`);
  out.push(`<text x="${cardX+20}" y="${cy+11}" class="fxMeta">${esc(meta)}</text></g>`);
 });
 out.push(`</svg>`);
 return out.join("");
}

function checklist(group,network,rows) {
 const {box,model} = group;
 const body = rows.map(r => {
  const port = short(model.kind)+(r.last>r.n ? pad(r.n)+"–"+pad(r.last) : pad(r.n));
  if (!r.f) return `<tr class="idle"><td class="tick"></td><td class="mono">${port}</td><td>${esc(r.label)}</td><td colspan="5">${r.off?"Off":"Free"}</td></tr>`;
  const load = model.kind==="pixel" && r.first ? portLoad(group,r.n,network) : null;
  return `<tr><td class="tick"><span></span></td><td class="mono">${r.first?port:"↳"}</td><td><b>${esc(r.label)}</b></td>
   <td><i class="sw" style="background:${esc(r.f.color)}"></i>${esc(r.f.name)}${r.off?' <em>off</em>':""}</td><td>${esc(r.f.zone)}</td>
   <td>${esc(fixtures[r.f.type])} · ${size(r.f)}${load&&load.segments.length>1?` <small>(${load.used}/${load.limit} px on port)</small>`:""}</td>
   <td class="mono">${esc(channelRange(r.f,box,network))}</td><td>${esc(r.f.state||"Planned")}</td></tr>`;
 }).join("");
 return `<table class="check"><thead><tr><th class="tick">✓</th><th>${word(model.kind)}</th><th>Location</th><th>Fixture</th><th>Area</th><th>Type</th><th>Address</th><th>Status</th></tr></thead><tbody>${body}</tbody></table>`;
}

function matrixTable(groups,design) {
 const max = Math.max(0,...groups.map(g=>g.model.ports)), pages = [];
 for (let from = 1; from <= max; from += MATRIX_COLS) {
  // Every block keeps the same column width; controllers without outputs in this range are left out.
  const to = Math.min(max,from+MATRIX_COLS-1), cols = [], spare = from+MATRIX_COLS-1-to;
  for (let n = from; n <= to; n++) cols.push(n);
  const body = groups.filter(g=>g.model.ports>=from).map(g => {
   const cells = [];
   for (let n = from; n <= to;) {
    if (n > g.model.ports) { cells.push(`<td class="void" colspan="${to-n+1}"></td>`); break; }
    const list = g.outputs.get(n) || [], label = outputLabel(g.box,n), off = g.box.offPorts?.includes(n);
    let span = 1;
    if (g.model.kind!=="pixel" && list.length===1) span = Math.min(circuitSpan(list[0],g.model.kind)[1],to,g.model.ports)-n+1;
    const fx = list.map(f=>`<span class="cellFx" style="--c:${esc(f.color)}">${esc(f.name)}</span>`).join("");
    cells.push(`<td${span>1?` colspan="${span}"`:""} class="${list.length?"used":"free"}${off?" off":""}">${fx||(off?"<em>off</em>":"")}${label&&label!==list[0]?.name?`<small>${esc(label)}</small>`:""}</td>`);
    n += span;
   }
   const net = design.networks.find(x=>x.id===g.box.net);
   if (spare) cells.push(`<td class="pad" colspan="${spare}"></td>`);
   return `<tr><th><b>${esc(g.box.name)}</b><small>${esc([g.model.name,net?.name].filter(Boolean).join(" · "))}</small></th>${cells.join("")}</tr>`;
  }).join("");
  pages.push(`<table class="matrix"><thead><tr><th>Controller</th>${cols.map(n=>`<th>${pad(n)}</th>`).join("")}${spare?`<th colspan="${spare}"></th>`:""}</tr></thead><tbody>${body}</tbody></table>`);
 }
 return pages.join("");
}

export function matrixDocument(design,{generated=new Date(),origin=""}={}) {
 const {groups,loose} = matrixGroups(design);
 const issues = review(design).filter(i=>i.level==="error");
 const when = generated.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
 const used = groups.reduce((s,g)=>s+g.outputs.size,0), total = groups.reduce((s,g)=>s+g.model.ports,0);
 const assigned = design.fixtures.length - loose.length;
 const head = (title,sub) => `<header class="pageHead"><div><h1>${esc(title)}</h1>${sub?`<p>${esc(sub)}</p>`:""}</div><span>${esc(design.name)} · ${esc(when)}</span></header>`;

 const index = groups.map(g => {
  const net = design.networks.find(n=>n.id===g.box.net);
  return `<tr><td><b>${esc(g.box.name)}</b></td><td>${esc(g.model.name)}</td><td>${esc(net?net.name+" · "+protocols[net.protocol]:"No network")}</td>
   <td class="mono">${isSerial(net)?"ID "+esc(g.box.unit):net?"U"+esc(g.box.universe):""}</td><td class="mono">${g.outputs.size}/${g.model.ports}</td><td>${esc(g.box.notes)}</td></tr>`;
 }).join("");

 const overview = `<section class="page">${head("Show build sheet","Controller wiring, output by output")}
  <div class="stats"><div><b>${groups.length}</b><span>controllers</span></div><div><b>${used}/${total}</b><span>outputs used</span></div>
   <div><b>${assigned}/${design.fixtures.length}</b><span>fixtures assigned</span></div><div><b>${issues.length}</b><span>issues</span></div></div>
  <h2>Controllers</h2>
  <table class="index"><thead><tr><th>Controller</th><th>Hardware</th><th>Network</th><th>Address</th><th>Used</th><th>Notes</th></tr></thead><tbody>${index||`<tr><td colspan="6">No controllers yet</td></tr>`}</tbody></table>
  ${loose.length?`<h2>Not assigned to an output</h2><ul class="loose">${loose.map(f=>`<li><i class="sw" style="background:${esc(f.color)}"></i>${esc(f.name)} <small>${esc(f.zone)} · ${esc(fixtures[f.type])}</small></li>`).join("")}</ul>`:""}
  ${issues.length?`<h2>Check before building</h2><ul class="issues">${issues.map(i=>`<li><b>${esc(i.name)}</b> ${esc(i.message)}</li>`).join("")}</ul>`:""}
  <h2>Reading the wiring pages</h2>
  <div class="legend">
   <span><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6" class="jack used"/></svg>Output in use</span>
   <span><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6" class="jack"/></svg>Free output</span>
   <span><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6" class="jack off"/><path d="M5 5l10 10m0-10L5 15" class="offMark"/></svg>Output switched off</span>
   <span><svg viewBox="0 0 34 20"><line x1="2" y1="10" x2="32" y2="10" class="wireUnder"/><line x1="2" y1="10" x2="32" y2="10" class="wire" style="stroke:#e8b34a"/></svg>Cable, in the fixture's color, with its location</span>
   <span><svg viewBox="0 0 34 20"><path d="M24 2V14H4" class="chain"/></svg>Strand chained after the one above</span>
  </div>
 </section>`;

 const matrix = groups.length ? `<section class="page">${head("Matrix","Controllers down, outputs across")}${matrixTable(groups,design)}</section>` : "";

 const sheets = groups.map(g => {
  const network = design.networks.find(n=>n.id===g.box.net), rows = wiringRows(g), parts = [];
  // Split long controllers into evenly sized parts so no page is left nearly empty.
  const per = Math.ceil(rows.length/Math.max(1,Math.ceil(rows.length/ROWS)));
  for (let i = 0; i < rows.length; i += per) parts.push(rows.slice(i,i+per));
  const boxIssues = issues.filter(i=>i.id===g.box.id || [...g.outputs.values()].flat().some(f=>f.id===i.id));
  return parts.map((part,i) => `<section class="page">${head(g.box.name,[g.model.name,network?.name,isSerial(network)?"ID "+g.box.unit:network&&protocols[network.protocol],g.outputs.size+"/"+g.model.ports+" outputs used"].filter(Boolean).join(" · "))}
   ${i===0&&boxIssues.length?`<ul class="issues">${boxIssues.map(x=>`<li><b>${esc(x.name)}</b> ${esc(x.message)}</li>`).join("")}</ul>`:""}
   ${i===0&&g.model.ports>32?`<p class="note">Only outputs in use are shown.</p>`:""}
   ${schematic(g,network,part,i+1,parts.length)}${checklist(g,network,part)}</section>`).join("");
 }).join("");

 const font = (name,file,weight) => `@font-face{font-family:"${name}";src:url("${origin}/fonts/${file}") format("woff2");font-weight:${weight};font-display:block}`;
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(design.name)} · Build sheet</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
${font("Figtree","figtree.woff2","300 900")}${font("Fraunces","fraunces.woff2","100 900")}${font("JetBrains Mono","jetbrains-mono.woff2","100 800")}
@page{size:letter landscape;margin:11mm 12mm}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#e6e9ef;color:#141a26;font:10pt/1.35 Figtree,"Segoe UI",system-ui,sans-serif}
.bar{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:14px;padding:12px 20px;background:#0b1220;color:#f5f0e6}
.bar b{font:600 15px Fraunces,Georgia,serif}.bar span{color:#a4aec6;font-size:13px;flex:1}
.bar button{font:700 13px Figtree,sans-serif;border:0;border-radius:8px;padding:9px 16px;background:linear-gradient(#ffd286,#ffb955);color:#2a1903;cursor:pointer}
.page{width:11in;min-height:8.5in;margin:20px auto;padding:11mm 12mm;background:#fff;box-shadow:0 6px 30px #0003}
.pageHead{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;padding-bottom:8px;margin-bottom:14px;border-bottom:2px solid #141a26}
h1{margin:0;font:600 22pt/1.05 Fraunces,Georgia,serif;letter-spacing:-.01em}
.pageHead p{margin:4px 0 0;color:#4a5568;font-size:10pt}.pageHead span{color:#6b7385;font-size:8.5pt;white-space:nowrap}
h2{margin:18px 0 8px;font:700 8.5pt Figtree,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#4a5568}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.stats div{border:1px solid #d5dae3;border-radius:10px;padding:10px 14px}.stats b{display:block;font:600 20pt Fraunces,Georgia,serif}.stats span{color:#4a5568;font-size:9pt}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;vertical-align:top;padding:5px 7px;border-bottom:1px solid #dfe3ea}
thead th{font:700 7.5pt Figtree,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#4a5568;border-bottom:1.5px solid #141a26}
.mono{font-family:"JetBrains Mono",Consolas,monospace;font-size:8.5pt}
small{color:#6b7385}
.sw{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:-1px;box-shadow:0 0 0 1px #0003}
ul.loose,ul.issues{margin:0;padding:0;list-style:none;columns:2;column-gap:24px}
ul.loose li,ul.issues li{padding:3px 0;break-inside:avoid}
ul.issues li{color:#9b1c1c}ul.issues{columns:1;margin-bottom:10px;padding:8px 12px;border:1px solid #f3b4b4;border-radius:8px;background:#fff5f5}
.legend{display:flex;flex-wrap:wrap;gap:8px 22px;font-size:9pt;color:#2d3748}
.legend span{display:flex;align-items:center;gap:7px}.legend svg{width:20px;height:20px}.legend svg[viewBox$="34 20"]{width:34px}
.note{color:#4a5568;font-style:italic;margin:0 0 6px}
.matrix{table-layout:fixed;margin-bottom:14px}
.matrix th:first-child{width:1.45in}
.matrix thead th{text-align:center;font-family:"JetBrains Mono",monospace;letter-spacing:0}
.matrix thead th:first-child{text-align:left;font-family:Figtree,sans-serif;letter-spacing:.08em}
.matrix tbody th b{display:block;font-size:9pt}.matrix tbody th small{font-size:7pt}
.matrix td{height:.58in;padding:4px;border:1px solid #dfe3ea;font-size:7.5pt;line-height:1.2;overflow:hidden}
.matrix td.used{background:#fafbfc}
.matrix td.free{background:repeating-linear-gradient(135deg,#fff 0 5px,#f3f5f8 5px 6px)}
.matrix td.void{background:#eceff3}
.matrix td.pad{border:0;background:none}
.matrix td.off em{color:#b42318;font-weight:700;font-style:normal;text-transform:uppercase;font-size:6.5pt}
.cellFx{display:block;font-weight:700;padding-top:3px;border-top:4px solid var(--c);margin-bottom:2px;word-break:break-word}
.matrix td small{display:block;color:#6b7385;font-size:7pt}
.wiring{display:block;width:100%;height:auto;margin:2px 0 12px}
.box{fill:#f4f6fa;stroke:#141a26;stroke-width:2}
.factKey{font:700 8.5px Figtree,sans-serif;letter-spacing:.08em;text-transform:uppercase;fill:#6b7385}.factVal{font:600 13px Figtree,sans-serif;fill:#141a26}
.boxName{font:600 17px Fraunces,Georgia,serif;fill:#141a26}.boxMeta{font:500 10.5px Figtree,sans-serif;fill:#4a5568}
.jackNo{font:700 12px "JetBrains Mono",monospace;fill:#141a26}.jackNo.idle{fill:#9aa3b5;font-weight:500}
.jack{fill:#fff;stroke:#141a26;stroke-width:2}.jack.used{fill:#141a26}.jack.off{stroke:#b42318}.offMark{stroke:#b42318;stroke-width:2}
.wireUnder{stroke:#141a26;stroke-width:6;stroke-linecap:round}.wire{stroke-width:3.5;stroke-linecap:round}
.wireLabel{font:600 11px Figtree,sans-serif;fill:#141a26}
.idleWire{stroke:#c3c9d4;stroke-width:1.5;stroke-dasharray:3 4}.idleText{font:500 10.5px Figtree,sans-serif;fill:#9aa3b5}
.chain{fill:none;stroke:#141a26;stroke-width:2;stroke-dasharray:5 3}.chainText{font:600 9px Figtree,sans-serif;fill:#6b7385}
.card rect:first-child{fill:#fff;stroke:#c3c9d4;stroke-width:1.2}
.fxName{font:700 12.5px Figtree,sans-serif;fill:#141a26}.fxMeta{font:500 9.5px Figtree,sans-serif;fill:#4a5568}.offTag{fill:#b42318;font-size:9px;letter-spacing:.06em}
.check td.tick,.check th.tick{width:26px;text-align:center}
.check td.tick span{display:inline-block;width:13px;height:13px;border:1.5px solid #141a26;border-radius:3px}
.check tr.idle td{color:#9aa3b5}.check em{color:#b42318;font-style:normal;font-weight:700;font-size:8pt;text-transform:uppercase}
.check tr{break-inside:avoid}
@media print{body{background:#fff}.bar{display:none}.page{width:auto;min-height:0;margin:0;padding:0;box-shadow:none;break-after:page}.page:last-child{break-after:auto}}
</style></head><body>
<div class="bar"><b>Build sheet</b><span>${esc(design.name)} · Save as PDF from the print dialog</span><button type="button" onclick="print()">Print or save PDF</button></div>
${overview}${matrix}${sheets}
</body></html>`;
}
