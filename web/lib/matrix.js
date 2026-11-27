import {address,channels,hex,isPixel,isSerial,mountNames,profile,serialPixel} from "./show.js";
import {acceptsFixture,circuitSpan,universePatch} from "./patch.js";
import {cablePoints,fixtureLeads} from "./stage.js";

export function channelRange(f,box,network) {
 const start=address(f,box,network);
 if (!network || channels(f)===1) return start;
 if (!isSerial(network)) {
  const slots=network.protocol==="dmx"?512:network.slots;
  const last=f.slot+channels(f)-2;
  const endUniverse=f.universe+Math.floor(last/slots);
  return start+"–"+(endUniverse===f.universe?"":"U"+endUniverse+" · ch ")+(last%slots+1);
 }
 if (profile(box).kind==="pixel" && isPixel(f)) {
  const first=serialPixel(f,box), last=serialPixel(f,box,f.offset+f.count-1);
  const lastChannel=last.channel+(f.type==="rgbw"?3:2);
  return start+"–"+(first.relative===last.relative?"":hex(parseInt(box.unit,16)+last.relative)+" · ch ")+lastChannel;
 }
 const [,last]=circuitSpan(f,profile(box).kind);
 return start+"–"+last;
}

function firstGap(ranges, size, preferred, limit) {
 const fits = start => start >= 1 && start + size - 1 <= limit &&
  ranges.every(([a,b]) => start > b || start + size - 1 < a);
 if (fits(preferred)) return preferred;
 let start = 1;
 for (const [a,b] of ranges.toSorted((x,y) => x[0]-y[0])) {
  if (start + size <= a) break;
  start = Math.max(start,b+1);
 }
 return start + size - 1 <= limit ? start : null;
}

export function matrixGroups(show) {
 const groups = new Map(), loose = [];
 for (const box of show.devices) {
  const model = profile(box);
  if (model.ports) groups.set(box.id,{box,model,outputs:new Map(),overflow:[]});
 }
 for (const f of show.fixtures) {
  const group = groups.get(f.device);
  if (!group) { loose.push(f); continue; }
  const [first,last] = circuitSpan(f,group.model.kind);
  if (first < 1 || last > group.model.ports) { group.overflow.push(f); continue; }
  for (let n = first; n <= last; n++) {
   if (!group.outputs.has(n)) group.outputs.set(n,[]);
   group.outputs.get(n).push(f);
  }
 }
 return {groups:[...groups.values()],loose};
}

// Pixels a single port can drive on this box and network.
export function pixelLimit(box,network) {
 return box.model==="pixcon" && network?.protocol==="elor" ? Math.min(170,box.pixelLimit) : box.pixelLimit;
}

// Pixel strands sharing one port, as ranges of the port's pixel run.
export function portLoad(group,n,network) {
 const rows = group.outputs.get(n) || [];
 const limit = pixelLimit(group.box,network);
 const segments = rows.map(f=>({f,start:f.offset,end:f.offset+f.count-1})).sort((a,b)=>a.start-b.start);
 return {limit,used:rows.reduce((sum,f)=>sum+f.count,0),segments};
}

function networkPatch(show,f,box,network) {
 const upstream = network.bridge ? show.devices.find(d=>d.id===network.bridge)?.net : network.id;
 return universePatch(f,box,network,show.networks.find(n=>n.id===upstream));
}

// Plan one move before changing the fixture or its traced leads.
export function planPatch(show,id,boxId,channel) {
 const f = show.fixtures.find(x=>x.id===id);
 if (!f) return {error:"This fixture is no longer in the show."};
 if (!boxId) return {fixture:f.device?{...f,device:""}:f};
 const box = show.devices.find(d=>d.id===boxId);
 const network = show.networks.find(n=>n.id===box?.net);
 if (!box || !network) return {error:"Choose a box with a configured network."};
 const {kind,ports} = profile(box);
 if (!acceptsFixture(kind,f)) return {error:"This light type cannot use that controller."};
 if (!Number.isInteger(channel) || channel<1 || channel>ports) return {error:"Choose an output on this box."};
 const port = kind==="dc" && f.type==="rgb" ? (channel-1)/3+1 : channel;
 if (!Number.isInteger(port)) return {error:"RGB groups start on circuits 1, 4, 7 and every third circuit after."};
 if (kind==="flood" && f.type==="rgb" && port!==1) return {error:"The RGB flood uses channels 1–3."};
 let next = {...f,device:boxId,port};
 const others = show.fixtures.filter(x=>x.id!==id);
 const neighbors = others.filter(x=>x.device===boxId);
 if (kind==="pixel") {
  const ranges = neighbors.filter(x=>x.port===port).map(x=>[x.offset,x.offset+x.count-1]);
  next.offset = firstGap(ranges,f.count,f.offset,pixelLimit(box,network));
  if (!next.offset) return {error:"This port has no free run of "+f.count+" pixels."};
 } else {
  if (kind==="dmx") next.slot=channel;
  const [first,last] = circuitSpan(next,kind);
  if (last>ports) return {error:"The fixture needs "+channels(f)+" consecutive channels."};
  const conflict = neighbors.find(x=>{const [a,b]=circuitSpan(x,kind);return first<=b && a<=last});
  if (conflict) return {error:"Channel already used by "+conflict.name+"."};
 }
 const patch = networkPatch(show,next,box,network);
 if (patch) {
  const used = [];
  for (const other of others) {
   const d = show.devices.find(x=>x.id===other.device), n = show.networks.find(x=>x.id===d?.net);
   if (!n) continue;
   const p = networkPatch(show,other,d,n);
   if (p?.net===patch.net) used.push(...p.ranges);
  }
  if (!isSerial(network) && kind==="pixel") {
   const start = firstGap(used,channels(next),patch.ranges[0][0],patch.slots*63999);
   if (!start) return {error:"No free universe range fits this fixture."};
   next.universe=Math.floor((start-1)/patch.slots)+1;
   next.slot=(start-1)%patch.slots+1;
  } else if (patch.overflow || patch.ranges.some(([lo,hi])=>hi>63999*patch.slots || used.some(([a,b])=>lo<=b && a<=hi))) {
   return {error:"This universe range is unavailable. Check the fixture and box addresses."};
  }
 }
 return {fixture:Object.keys(next).every(k=>next[k]===f[k])?f:next};
}

export function applyPatch(show,fixture) {
 const old=show.fixtures.find(x=>x.id===fixture.id);
 if (!old || old===fixture) return show;
 const leads=new Set(fixtureLeads(old,show.cables||[]));
 const light="f/"+fixture.id;
 const cables=(show.cables||[]).map(c=>{
  const loose=c.detachedLead && ((!c.from && c.to===light)||(!c.to && c.from===light));
  if (!leads.has(c) && !loose) return c;
  const end=c.from===light?"to":"from";
  return {...c,[end]:fixture.device?"d/"+fixture.device:"",output:fixture.device?fixture.port:undefined,
   points:cablePoints(c,show),detachedLead:fixture.device?undefined:true};
 });
 return {...show,fixtures:show.fixtures.map(x=>x===old?fixture:x),cables};
}

const onOutput = (show,boxId,n) => {
 const box = show.devices.find(d=>d.id===boxId);
 if (!box) return [];
 const {kind} = profile(box);
 return show.fixtures.filter(f=>{
  if (f.device!==boxId) return false;
  const [a,b] = circuitSpan(f,kind);
  return a<=n && n<=b;
 });
};

// Trade places with the single fixture on an output, or bump it to unpatched when
// the moving fixture had no output. Returns the next show, or null when no trade fits.
export function planSwap(show,id,boxId,n) {
 const f = show.fixtures.find(x=>x.id===id);
 const others = onOutput(show,boxId,n).filter(x=>x.id!==id);
 if (!f || !boxId || others.length!==1) return null;
 const other = others[0];
 const cleared = applyPatch(show,{...other,device:""});
 const first = planPatch(cleared,id,boxId,n);
 if (first.error) return null;
 const moved = applyPatch(cleared,first.fixture);
 let back = {fixture:moved.fixtures.find(x=>x.id===other.id)};
 if (f.device) {
  const home = show.devices.find(d=>d.id===f.device);
  if (!home) return null;
  back = planPatch(moved,other.id,f.device,circuitSpan(f,profile(home).kind)[0]);
  if (back.error) return null;
 }
 return {show:applyPatch(moved,back.fixture),other,replaced:!f.device};
}

// Location labels belong to a box's physical outputs, so they stay put when fixtures move.
export const outputLabel = (box,n) => box?.labels?.[n] || "";

export function labelOutput(show,boxId,n,text) {
 const label = String(text ?? "").trim().slice(0,48);
 const box = show.devices.find(d=>d.id===boxId);
 if (!box || !Number.isInteger(n) || n<1 || n>512 || outputLabel(box,n)===label) return show;
 const labels = {...(box.labels||{})};
 if (label) labels[n] = label; else delete labels[n];
 return {...show,devices:show.devices.map(d=>d===box?{...d,labels}:d)};
}

export function fixtureLocation(f,show) {
 const box = show.devices.find(d=>d.id===f.device);
 return box && profile(box).ports ? outputLabel(box,circuitSpan(f,profile(box).kind)[0]) : "";
}

// Name every unlabeled output after the first fixture patched to it.
export function fillLabels(show) {
 let next = show, count = 0;
 for (const {box,outputs} of matrixGroups(show).groups) {
  for (const [n,rows] of outputs) {
   const first = rows[0];
   if (outputLabel(box,n) || circuitSpan(first,profile(box).kind)[0]!==n) continue;
   next = labelOutput(next,box.id,n,first.name); count++;
  }
 }
 return {show:next,count};
}

export function locationSuggestions(show,first=[]) {
 const seen = new Set(), list = [];
 const add = v => { const t = String(v||"").trim(); if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); list.push(t); } };
 first.forEach(add);
 show.devices.forEach(d=>Object.values(d.labels||{}).forEach(add));
 show.fixtures.forEach(f=>{add(f.name);add(f.zone)});
 Object.values(mountNames).forEach(add);
 return list;
}
