import {channels,fixtures,isPixel,isSerial,protocols} from "./show.js";
import {circuitSpan,review} from "./patch.js";
import {channelRange,matrixGroups,outputLabel,portLoad} from "./matrix.js";

// A printable build sheet for the field: overview, whole-show matrix, one wiring
// page per controller (schematic plus checklist), then cut-out lid cards.

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// A CSS string inside the <style> element: escape quotes and backslashes, and write "<"
// as a CSS escape so text like "</style>" can never close the element.
const cssText = v => '"'+String(v ?? "").replace(/[\\"]/g,"\\$&").replace(/[\n\r]/g," ").replace(/</g,"\\3C ")+'"';
const pad = n => String(n).padStart(2,"0");
const short = kind => kind==="pixel" ? "P" : kind==="dmx" ? "S" : "CH";
const word = kind => kind==="pixel" ? "Port" : kind==="dmx" ? "Slot" : "Channel";
const MATRIX_COLS = 16;
// Schematic geometry, in SVG units (the drawing is scaled to the page width).
const W = 1000, TOP = 66, BOTTOM = 16, ROW = 37, SLIM = 23, BUDGET = 604, JACK = 252, CARD = 540;

const size = f => isPixel(f) ? f.count+" px" : channels(f)>1 ? channels(f)+" ch" : "1 ch";
const portName = (kind,r) => short(kind)+(r.last>r.n ? pad(r.n)+"–"+pad(r.last) : pad(r.n));
// Rough text width for sizing tags; the fonts are proportional, so this errs wide.
const textWidth = (text,px) => String(text).length*px*.56;

// Rows for one controller: one per strand (extra strands on a pixel port chain
// after the first) and one slim row per run of untouched free outputs.
export function wiringRows(group) {
 const {box,model,outputs} = group, rows = [], dense = model.ports > 32;
 const quiet = n => !outputs.has(n) && !outputLabel(box,n) && !box.offPorts?.includes(n);
 for (let n = 1; n <= model.ports; n++) {
  const list = outputs.get(n) || [];
  if (dense && !list.length) continue;
  if (quiet(n)) {
   let last = n;
   while (last < model.ports && quiet(last+1)) last++;
   rows.push({n,last,free:true});
   n = last;
   continue;
  }
  if (model.kind!=="pixel" && list.length===1) {
   const [a,b] = circuitSpan(list[0],model.kind);
   if (a!==n) continue;
   rows.push({n,last:b,f:list[0],first:true});
   continue;
  }
  if (!list.length) { rows.push({n,last:n,free:true}); continue; }
  if (model.kind!=="pixel") {
   // Overlapping fixtures (already flagged as patch errors) each appear once, at their own first channel.
   for (const f of list) if (circuitSpan(f,model.kind)[0]===n) rows.push({n,last:circuitSpan(f,model.kind)[1],f,first:true});
   continue;
  }
  [...list].sort((x,y)=>x.offset-y.offset).forEach((f,i,all)=>rows.push({n,last:n,f,first:i===0,after:i?all[i-1]:null}));
 }
 return rows.map(r => ({...r,label:outputLabel(box,r.n),off:!!box.offPorts?.includes(r.n),h:r.f?ROW:SLIM}));
}

// Fill each page up to the height budget, then even out the parts.
function paginate(rows) {
 const total = rows.reduce((s,r)=>s+r.h,0), pages = Math.max(1,Math.ceil(total/BUDGET)), target = total/pages, parts = [[]];
 let used = 0;
 for (const r of rows) {
  const part = parts.at(-1);
  if (part.length && (used+r.h > BUDGET || (parts.length<pages && used+r.h/2 > target))) { parts.push([]); used = 0; }
  parts.at(-1).push(r); used += r.h;
 }
 return parts;
}

function schematic(group,network,rows,part,parts) {
 const {box,model} = group;
 const height = TOP + rows.reduce((s,r)=>s+r.h,0) + BOTTOM;
 const strands = [...new Set([...group.outputs.values()].flat())];
 const pixels = strands.filter(isPixel).reduce((n,f)=>n+f.count,0);
 const out = [];
 out.push(`<svg class="wiring" viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(box.name)} wiring${parts>1?", part "+part+" of "+parts:""}">`);
 // Faceplate: a nameplate band over a light body, with the jacks on its right edge.
 out.push(`<rect x="18" y="8" width="${JACK-18}" height="${height-18}" rx="14" class="plate"/>`);
 out.push(`<path d="M18 22a14 14 0 0 1 14-14h${JACK-46}a14 14 0 0 1 14 14v40H18z" class="nameplate"/>`);
 out.push(`<text x="34" y="34" class="plateName">${esc(box.name.length>22?box.name.slice(0,21)+"…":box.name)}</text>`);
 out.push(`<text x="34" y="52" class="plateMeta">${esc([model.name,isSerial(network)?"ID "+box.unit:network?"U"+box.universe:""].filter(Boolean).join(" · "))}</text>`);
 const facts = [["Network",network?network.name:"None"],["In use",group.outputs.size+" of "+model.ports],pixels&&["Pixels",pixels]].filter(Boolean);
 facts.forEach(([k,v],i)=>{ if (92+i*34 < height-24) out.push(`<text x="34" y="${92+i*34}" class="factKey">${esc(k)}</text><text x="34" y="${108+i*34}" class="factVal">${esc(v)}</text>`); });
 // Notes wrap onto as many short lines as the faceplate has room for.
 const noteTop = 92+facts.length*34, room = Math.min(4,Math.floor((height-30-noteTop-16)/15));
 if (box.notes && room>0) {
  const lines = [];
  for (const word of box.notes.trim().split(/\s+/)) {
   if (lines.length && (lines.at(-1)+" "+word).length <= 24) lines[lines.length-1] += " "+word;
   else lines.push(word);
  }
  const shown = lines.slice(0,room);
  if (lines.length>room) shown[room-1] = shown[room-1].slice(0,22)+"…";
  out.push(`<text x="34" y="${noteTop}" class="factKey">Notes</text><text x="34" y="${noteTop+16}" class="noteText">${shown.map((l,i)=>`<tspan x="34" dy="${i?15:0}">${esc(l)}</tspan>`).join("")}</text>`);
 }
 if (parts>1) out.push(`<text x="${W-6}" y="22" text-anchor="end" class="partNo">Part ${part} of ${parts}</text>`);

 let y = TOP, prev = 0;
 rows.forEach(r => {
  const cy = y + r.h/2, name = portName(model.kind,r), above = prev;
  y += r.h; prev = cy;
  // Port badge and jack, once per output (chained strands share the jack above).
  if (!r.f || r.first) {
   const bw = Math.max(46,textWidth(name,12)+18), bx = JACK-16-bw;
   out.push(`<rect x="${bx}" y="${cy-10}" width="${bw}" height="20" rx="10" class="badge${r.f?" on":""}${r.off?" off":""}"/>`);
   out.push(`<text x="${bx+bw/2}" y="${cy+4}" text-anchor="middle" class="badgeText${r.f?" on":""}${r.off?" off":""}">${name}</text>`);
   out.push(`<circle cx="${JACK}" cy="${cy}" r="${r.f?7:5.5}" class="jack${r.f?" on":""}${r.off?" off":""}"/>`);
   if (r.off) out.push(`<path d="M${JACK-4.5} ${cy-4.5}l9 9m0-9l-9 9" class="offMark"/>`);
  }
  if (!r.f) {
   const note = r.off ? "Switched off" : r.n===r.last ? "Free" : "Free · "+(r.last-r.n+1)+" outputs";
   out.push(`<text x="${JACK+18}" y="${cy+4}" class="idleText${r.off?" off":""}">${note}${r.label?` · <tspan class="planned">planned for ${esc(r.label)}</tspan>`:""}</text>`);
   return;
  }
  const color = esc(r.f.color), cw = W-CARD-8, top = cy-r.h/2+5, ch = r.h-10;
  if (r.first) {
   out.push(`<line x1="${JACK+7}" y1="${cy}" x2="${CARD-12}" y2="${cy}" class="cableUnder"/>`);
   out.push(`<line x1="${JACK+7}" y1="${cy}" x2="${CARD-12}" y2="${cy}" class="cable" style="stroke:${color}"/>`);
   out.push(`<rect x="${CARD-16}" y="${cy-6}" width="16" height="12" rx="2.5" class="plug"/>`);
   if (r.label && r.label!==r.f.name) {
    const tw = Math.min(CARD-JACK-60,textWidth(r.label,11)+22), tx = (JACK+CARD)/2-tw/2;
    out.push(`<rect x="${tx}" y="${cy-10}" width="${tw}" height="20" rx="10" class="tag"/>`);
    out.push(`<text x="${tx+tw/2}" y="${cy+4}" text-anchor="middle" class="tagText">${esc(r.label)}</text>`);
   }
  } else {
   // A chained strand plugs into the end of the strand above it.
   out.push(`<path d="M${CARD-8} ${above+6}V${cy}H${CARD}" class="chain"/>`);
   out.push(`<text x="${CARD-14}" y="${(above+cy)/2+7}" text-anchor="end" class="chainText">then</text>`);
  }
  const meta = [r.f.zone,fixtures[r.f.type],size(r.f),channelRange(r.f,box,network),isPixel(r.f)&&model.kind==="pixel"&&"px "+r.f.offset+"–"+(r.f.offset+r.f.count-1)].filter(Boolean).join(" · ");
  out.push(`<rect x="${CARD}" y="${top}" width="${cw}" height="${ch}" rx="8" class="card${r.off?" off":""}"/>`);
  out.push(`<rect x="${CARD}" y="${top}" width="10" height="${ch}" rx="4" style="fill:${color}"/><rect x="${CARD+5}" y="${top}" width="5" height="${ch}" style="fill:${color}"/>`);
  out.push(`<text x="${CARD+22}" y="${cy-2}" class="fxName">${esc(model.kind==="pixel"&&r.f.name.length>28?r.f.name.slice(0,27)+"…":r.f.name)}${r.off?' <tspan class="offTag">· OUTPUT OFF</tspan>':""}</text>`);
  out.push(`<text x="${CARD+22}" y="${cy+11}" class="fxMeta">${esc(meta.length>66?meta.slice(0,65)+"…":meta)}</text>`);
  out.push(`<text x="${CARD+cw-12}" y="${cy+5}" text-anchor="end" class="cardPort">${name}</text>`);
  if (model.kind==="pixel" && isPixel(r.f)) {
   // Where this strand sits within the port's pixel run.
   const load = portLoad(group,r.n,network), bw = 56, bx = CARD+cw-66-bw, by = cy-9;
   out.push(`<rect x="${bx}" y="${by}" width="${bw}" height="5" rx="2.5" class="load"/>`);
   out.push(`<rect x="${bx+Math.min(bw,(r.f.offset-1)/load.limit*bw)}" y="${by}" width="${Math.max(2,Math.min(bw,r.f.count/load.limit*bw))}" height="5" rx="2.5" style="fill:${color}"/>`);
   out.push(`<text x="${bx-6}" y="${by+5}" text-anchor="end" class="loadText${load.used>load.limit?" over":""}">${load.used}/${load.limit} px on port</text>`);
  }
 });
 out.push(`</svg>`);
 return out.join("");
}

function checklist(group,network,rows) {
 const {box,model} = group;
 const body = rows.map(r => {
  const port = portName(model.kind,r);
  if (!r.f) return `<tr class="idle"><td class="tick"></td><td class="mono">${port}</td><td>${r.label?`<i>planned: ${esc(r.label)}</i>`:""}</td><td colspan="4">${r.off?"Switched off":r.n===r.last?"Free":"Free · "+(r.last-r.n+1)+" outputs"}</td><td class="notes"></td></tr>`;
  return `<tr><td class="tick"><span></span></td><td class="mono"><b>${r.first?port:"↳"}</b></td><td><b>${esc(r.label)}</b></td>
   <td><i class="sw" style="background:${esc(r.f.color)}"></i>${esc(r.f.name)}${r.off?' <em>off</em>':""}${r.after?`<small> after ${esc(r.after.name)}</small>`:""}</td><td>${esc(r.f.zone)}</td>
   <td>${esc(fixtures[r.f.type])} · ${size(r.f)}</td><td class="mono">${esc(channelRange(r.f,box,network))}</td><td class="notes"></td></tr>`;
 }).join("");
 return `<table class="check"><thead><tr><th class="tick">✓</th><th>${word(model.kind)}</th><th>Location</th><th>Fixture</th><th>Area</th><th>Type</th><th>Address</th><th class="notes">Notes</th></tr></thead><tbody>${body}</tbody></table>`;
}

function matrixTable(groups,design) {
 const max = Math.max(0,...groups.map(g=>g.model.ports)), blocks = [];
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
    cells.push(`<td${span>1?` colspan="${span}"`:""} class="${list.length?"used":"free"}${off?" off":""}">${off?"<em>off</em>":""}${fx}${label&&label!==list[0]?.name?`<small>${list.length?"":"planned: "}${esc(label)}</small>`:""}</td>`);
    n += span;
   }
   const net = design.networks.find(x=>x.id===g.box.net);
   if (spare) cells.push(`<td class="pad" colspan="${spare}"></td>`);
   return `<tr><th><b>${esc(g.box.name)}</b><small>${esc([g.model.name,net?.name].filter(Boolean).join(" · "))}</small></th>${cells.join("")}</tr>`;
  }).join("");
  blocks.push(`<table class="matrix"><thead><tr><th>Controller</th>${cols.map(n=>`<th>${pad(n)}</th>`).join("")}${spare?`<th colspan="${spare}"></th>`:""}</tr></thead><tbody>${body}</tbody></table>`);
 }
 return blocks.join("")+`<div class="key"><span><i class="k used"></i>Assigned (bar shows fixture color)</span><span><i class="k free"></i>Free output</span><span><i class="k void"></i>No output on this box</span><span><em>off</em>Output switched off</span><span><small>Gray text</small>Location label</span></div>`;
}

function lidCard(group,network) {
 const {box,model} = group;
 const lines = wiringRows(group).filter(r=>r.f||r.label||r.off).map(r =>
  `<li><b>${r.f&&!r.first?"↳":portName(model.kind,r)}</b><span>${r.f?`<i class="sw" style="background:${esc(r.f.color)}"></i>${esc(r.f.name)}`:`<i class="dim">${r.off?"off":"free"}</i>`}</span><small>${esc(r.label&&r.label!==r.f?.name?r.label:r.f?.zone||"")}</small></li>`).join("");
 return `<div class="lid"><header><b>${esc(box.name)}</b><span>${esc([model.name,network?.name,isSerial(network)?"ID "+box.unit:network?"U"+box.universe:""].filter(Boolean).join(" · "))}</span></header>
  ${lines?`<ul>${lines}</ul>`:`<p class="dim">Nothing assigned yet</p>`}</div>`;
}

export function matrixDocument(design,{generated=new Date(),origin=""}={}) {
 const {groups,loose} = matrixGroups(design);
 const issues = review(design).filter(i=>i.level==="error");
 const when = generated.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
 const used = groups.reduce((s,g)=>s+g.outputs.size,0), total = groups.reduce((s,g)=>s+g.model.ports,0);
 const assigned = design.fixtures.length - loose.length;
 const netOf = g => design.networks.find(n=>n.id===g.box.net);
 const head = (title,sub,chips=[]) => `<header class="pageHead"><div><h1>${esc(title)}</h1>${sub?`<p>${esc(sub)}</p>`:""}${chips.length?`<p class="chips">${chips.filter(Boolean).map(c=>`<span>${esc(c)}</span>`).join("")}</p>`:""}</div><span>${esc(design.name)}<br>${esc(when)}</span></header>`;

 const index = groups.map(g => {
  const net = netOf(g);
  return `<tr><td><b>${esc(g.box.name)}</b></td><td>${esc(g.model.name)}</td><td>${esc(net?net.name+" · "+protocols[net.protocol]:"No network")}</td>
   <td class="mono">${isSerial(net)?"ID "+esc(g.box.unit):net?"U"+esc(g.box.universe):""}</td><td><span class="meter"><i style="width:${Math.round(g.outputs.size/g.model.ports*100)}%"></i></span><span class="mono">${g.outputs.size}/${g.model.ports}</span></td><td>${esc(g.box.notes)}</td></tr>`;
 }).join("");

 const legend = `<div class="legend">
   <span><svg viewBox="0 0 60 22"><rect x="2" y="2" width="44" height="18" rx="9" class="badge on"/><text x="24" y="15" text-anchor="middle" class="badgeText on">P05</text><circle cx="53" cy="11" r="6" class="jack on"/></svg>Output in use</span>
   <span><svg viewBox="0 0 60 22"><rect x="2" y="2" width="44" height="18" rx="9" class="badge"/><text x="24" y="15" text-anchor="middle" class="badgeText">P06</text><circle cx="53" cy="11" r="5" class="jack"/></svg>Free output</span>
   <span><svg viewBox="0 0 60 22"><rect x="2" y="2" width="44" height="18" rx="9" class="badge off"/><text x="24" y="15" text-anchor="middle" class="badgeText off">P09</text><circle cx="53" cy="11" r="6" class="jack off"/><path d="M49 7l8 8m0-8l-8 8" class="offMark"/></svg>Switched off</span>
   <span><svg viewBox="0 0 120 22"><line x1="2" y1="11" x2="104" y2="11" class="cableUnder"/><line x1="2" y1="11" x2="104" y2="11" class="cable" style="stroke:#e8b34a"/><rect x="104" y="5" width="14" height="12" rx="2.5" class="plug"/><rect x="18" y="2" width="70" height="18" rx="9" class="tag"/><text x="53" y="15" text-anchor="middle" class="tagText">Location</text></svg>Cable in the fixture's color, tagged with where it goes</span>
   <span><svg viewBox="0 0 40 22"><path d="M30 1V15H4" class="chain"/></svg>Strand plugged into the end of the one above</span>
  </div>`;

 const overview = `<section class="page">${head("Show build sheet","Controller wiring, output by output")}
  <div class="stats"><div><b>${groups.length}</b><span>controllers</span></div><div><b>${used}<small>/${total}</small></b><span>outputs used</span></div>
   <div><b>${assigned}<small>/${design.fixtures.length}</small></b><span>fixtures assigned</span></div><div class="${issues.length?"warn":"ok"}"><b>${issues.length}</b><span>${issues.length===1?"issue":"issues"} to check</span></div></div>
  <h2>Controllers</h2>
  <table class="index"><thead><tr><th>Controller</th><th>Hardware</th><th>Network</th><th>Address</th><th>Used</th><th>Notes</th></tr></thead><tbody>${index||`<tr><td colspan="6">No controllers yet</td></tr>`}</tbody></table>
  ${issues.length?`<h2>Check before building</h2><ul class="issues">${issues.map(i=>`<li><b>${esc(i.name)}</b> ${esc(i.message)}</li>`).join("")}</ul>`:""}
  ${loose.length?`<h2>Not assigned to an output</h2><ul class="loose">${loose.map(f=>`<li><i class="sw" style="background:${esc(f.color)}"></i>${esc(f.name)} <small>${esc(f.zone)} · ${esc(fixtures[f.type])}</small></li>`).join("")}</ul>`:""}
  <h2>Reading the wiring pages</h2>${legend}
 </section>`;

 const matrix = groups.length ? `<section class="page">${head("Matrix","Controllers down, outputs across")}${matrixTable(groups,design)}</section>` : "";

 const sheets = groups.map(g => {
  const network = netOf(g), parts = paginate(wiringRows(g));
  const strands = [...new Set([...g.outputs.values()].flat())];
  const boxIssues = issues.filter(i=>i.id===g.box.id || strands.some(f=>f.id===i.id));
  const chips = [g.model.name,network?network.name+" · "+protocols[network.protocol]:"No network",isSerial(network)?"Unit ID "+g.box.unit:network?"Universe "+g.box.universe:"",g.outputs.size+" of "+g.model.ports+" outputs"];
  return parts.map((part,i) => `<section class="page">${head(g.box.name,"",chips)}
   ${i===0&&boxIssues.length?`<ul class="issues">${boxIssues.map(x=>`<li><b>${esc(x.name)}</b> ${esc(x.message)}</li>`).join("")}</ul>`:""}
   ${i===0&&g.model.ports>32?`<p class="note">Only outputs in use are shown.</p>`:""}
   ${schematic(g,network,part,i+1,parts.length)}${checklist(g,network,part)}</section>`).join("");
 }).join("");

 const lids = groups.length ? `<section class="page">${head("Lid cards","Cut out and keep one inside each controller")}<div class="lids">${groups.map(g=>lidCard(g,netOf(g))).join("")}</div></section>` : "";

 const font = (name,file,weight) => `@font-face{font-family:"${name}";src:url("${origin}/fonts/${file}") format("woff2");font-weight:${weight};font-display:block}`;
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(design.name)} · Build sheet</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
${font("Figtree","figtree.woff2","300 900")}${font("Fraunces","fraunces.woff2","100 900")}${font("JetBrains Mono","jetbrains-mono.woff2","100 800")}
@page{size:letter landscape;margin:11mm 12mm 13mm;
 @bottom-left{content:${cssText(design.name+" · Build sheet")};font:8pt Figtree,sans-serif;color:#6b7385}
 @bottom-right{content:"Page " counter(page) " of " counter(pages);font:8pt Figtree,sans-serif;color:#6b7385}}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#e3e7ee;color:#141a26;font:10pt/1.35 Figtree,"Segoe UI",system-ui,sans-serif}
.bar{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:14px;padding:12px 20px;background:#0b1220;color:#f5f0e6;box-shadow:0 2px 12px #0004}
.bar b{font:600 15px Fraunces,Georgia,serif}.bar span{color:#a4aec6;font-size:13px;flex:1}
.bar button{font:700 13px Figtree,sans-serif;border:0;border-radius:8px;padding:9px 16px;background:linear-gradient(#ffd286,#ffb955);color:#2a1903;cursor:pointer}
.page{width:11in;min-height:8.5in;margin:22px auto;padding:11mm 12mm;background:#fff;box-shadow:0 8px 34px #0002}
.pageHead{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;padding-bottom:9px;margin-bottom:14px;border-bottom:2.5px solid #141a26}
h1{margin:0;font:600 23pt/1.05 Fraunces,Georgia,serif;letter-spacing:-.01em}
.pageHead p{margin:5px 0 0;color:#4a5568;font-size:10pt}.pageHead>span{color:#6b7385;font-size:8.5pt;text-align:right;line-height:1.4}
.chips{display:flex;flex-wrap:wrap;gap:5px}.chips span{padding:2px 9px;border-radius:99px;background:#eef1f6;border:1px solid #dbe0e8;color:#2d3748;font-size:8.5pt;font-weight:600}
h2{margin:18px 0 8px;font:700 8.5pt Figtree,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#4a5568}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.stats div{border:1px solid #d5dae3;border-radius:10px;padding:10px 14px;border-top:4px solid #141a26}
.stats div.warn{border-top-color:#d14343;background:#fff8f8}.stats div.ok{border-top-color:#2f9e6a}
.stats b{display:block;font:600 21pt Fraunces,Georgia,serif}.stats b small{font-size:13pt;color:#8a93a6}.stats span{color:#4a5568;font-size:9pt}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;vertical-align:top;padding:5px 7px;border-bottom:1px solid #e1e5ec}
thead th{font:700 7.5pt Figtree,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#4a5568;border-bottom:1.5px solid #141a26}
thead{display:table-header-group}
.mono{font-family:"JetBrains Mono",Consolas,monospace;font-size:8.5pt}
small{color:#6b7385}
.sw{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:-1px;box-shadow:0 0 0 1px #0003}
.meter{display:inline-block;width:46px;height:5px;margin-right:7px;border-radius:3px;background:#e6e9ef;vertical-align:1px;overflow:hidden}.meter i{display:block;height:100%;background:#141a26}
ul.loose,ul.issues{margin:0;padding:0;list-style:none;columns:2;column-gap:24px}
ul.loose li,ul.issues li{padding:3px 0;break-inside:avoid}
ul.issues li{color:#9b1c1c}ul.issues{columns:1;margin-bottom:10px;padding:8px 12px;border:1px solid #f3b4b4;border-left:4px solid #d14343;border-radius:8px;background:#fff7f7}
.legend{display:flex;flex-wrap:wrap;gap:10px 26px;font-size:9pt;color:#2d3748}
.legend span{display:flex;align-items:center;gap:8px}.legend svg{height:22px;width:auto}
.note{color:#4a5568;font-style:italic;margin:0 0 6px}
.matrix{table-layout:fixed;margin-bottom:12px}
.matrix th:first-child{width:1.45in}
.matrix thead th{text-align:center;font-family:"JetBrains Mono",monospace;letter-spacing:0;font-size:8pt}
.matrix thead th:first-child{text-align:left;font-family:Figtree,sans-serif;letter-spacing:.08em;font-size:7.5pt}
.matrix tbody th b{display:block;font-size:9pt}.matrix tbody th small{font-size:7pt}
.matrix td{height:.6in;padding:4px;border:1px solid #dfe3ea;font-size:7.5pt;line-height:1.2;overflow:hidden}
.matrix td.used{background:#fbfcfd}
.matrix td.free,.k.free{background:repeating-linear-gradient(135deg,#fff 0 5px,#eef1f5 5px 6px)}
.matrix td.void,.k.void{background:#e9ecf1}
.matrix td.pad{border:0;background:none}
.matrix em,.key em{display:block;color:#b42318;font-weight:800;font-style:normal;text-transform:uppercase;font-size:6.5pt;letter-spacing:.06em}
.cellFx{display:block;font-weight:700;padding-top:3px;border-top:5px solid var(--c);margin-bottom:2px;word-break:break-word}
.matrix td small{display:block;color:#6b7385;font-size:7pt}
.key{display:flex;flex-wrap:wrap;gap:6px 20px;font-size:8pt;color:#4a5568}.key span{display:flex;align-items:center;gap:6px}.key em{display:inline}
.k{display:inline-block;width:20px;height:13px;border:1px solid #cfd5df}.k.used{background:#fbfcfd;border-top:4px solid #e8b34a}
.wiring{display:block;width:100%;height:auto;margin:0 0 12px}
.plate{fill:#f3f5f9;stroke:#141a26;stroke-width:2}.nameplate{fill:#141a26}
.plateName{font:600 16px Fraunces,Georgia,serif;fill:#fff}.plateMeta{font:500 10px Figtree,sans-serif;fill:#c5cddb}
.factKey{font:700 8px Figtree,sans-serif;letter-spacing:.1em;text-transform:uppercase;fill:#7a8396}.factVal{font:600 12.5px Figtree,sans-serif;fill:#141a26}
.noteText{font:500 11px Figtree,sans-serif;fill:#2d3748}
.partNo{font:700 10px Figtree,sans-serif;fill:#6b7385;letter-spacing:.06em;text-transform:uppercase}
.badge{fill:#fff;stroke:#b8c0cd;stroke-width:1.3}.badge.on{fill:#141a26;stroke:#141a26}.badge.off{fill:#fff4f3;stroke:#d14343}
.badgeText{font:600 11px "JetBrains Mono",monospace;fill:#8a93a6}.badgeText.on{fill:#fff;font-weight:700}.badgeText.off{fill:#b42318;font-weight:700}
.jack{fill:#fff;stroke:#8a93a6;stroke-width:1.8}.jack.on{fill:#141a26;stroke:#141a26}.jack.off{stroke:#d14343;fill:#fff}.offMark{stroke:#d14343;stroke-width:2;stroke-linecap:round}
.cableUnder{stroke:#141a26;stroke-width:7;stroke-linecap:round}.cable{stroke-width:4;stroke-linecap:round}
.plug{fill:#141a26}
.tag{fill:#fff;stroke:#141a26;stroke-width:1.4}.tagText{font:700 10.5px Figtree,sans-serif;fill:#141a26}
.idleText{font:500 10.5px Figtree,sans-serif;fill:#9aa3b5}.idleText.off{fill:#b42318;font-weight:600}.planned{fill:#4a5568;font-style:italic}
.chain{fill:none;stroke:#141a26;stroke-width:2;stroke-dasharray:5 3}.chainText{font:700 8.5px Figtree,sans-serif;fill:#6b7385;letter-spacing:.06em;text-transform:uppercase}
.card{fill:#fff;stroke:#c3c9d4;stroke-width:1.2}.card.off{stroke:#d14343;stroke-dasharray:4 3}
.fxName{font:700 13px Figtree,sans-serif;fill:#141a26}.fxMeta{font:500 9.5px Figtree,sans-serif;fill:#4a5568}.offTag{fill:#b42318;font-size:9.5px;letter-spacing:.04em}
.cardPort{font:700 13px "JetBrains Mono",monospace;fill:#141a26}
.load{fill:#e6e9ef}.loadText{font:600 8px Figtree,sans-serif;fill:#6b7385}.loadText.over{fill:#b42318}
.check td.tick,.check th.tick{width:28px;text-align:center}
.check td.tick span{display:inline-block;width:14px;height:14px;border:1.6px solid #141a26;border-radius:3px;vertical-align:-2px}
.check th.notes{width:1.6in}.check td.notes{border-bottom:1px solid #b8c0cd}
.check tr.idle td{color:#9aa3b5}.check tr.idle td.notes{border-bottom-color:#e1e5ec}.check em{color:#b42318;font-style:normal;font-weight:700;font-size:8pt;text-transform:uppercase}
.check tr{break-inside:avoid}
.check td.mono{white-space:nowrap}
.lids{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
.lid{border:1.5px dashed #8a93a6;border-radius:10px;padding:10px 12px;break-inside:avoid}
.lid header{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding-bottom:6px;margin-bottom:6px;border-bottom:1.5px solid #141a26}
.lid header b{font:600 14pt Fraunces,Georgia,serif}.lid header span{font-size:8pt;color:#4a5568;text-align:right}
.lid ul{margin:0;padding:0;list-style:none;columns:2;column-gap:14px;font-size:8.5pt}
.lid li{display:grid;grid-template-columns:52px 1fr;column-gap:4px;padding:2px 0;break-inside:avoid}
.lid li b{font:700 8.5pt "JetBrains Mono",monospace}.lid li small{grid-column:2;font-size:7.5pt}
.dim{color:#9aa3b5;font-style:italic}.lid p{margin:2px 0;font-size:8.5pt}
@media print{body{background:#fff}.bar{display:none}.page{width:auto;min-height:0;margin:0;padding:0;box-shadow:none;break-after:page}.page:last-child{break-after:auto}}
</style></head><body>
<div class="bar"><b>Build sheet</b><span>${esc(design.name)} · Save as PDF from the print dialog</span><button type="button" onclick="print()">Print or save PDF</button></div>
${overview}${matrix}${sheets}${lids}
</body></html>`;
}
