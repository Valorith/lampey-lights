import {address,channels,hex,isPixel,isSerial,profile,serialPixel} from "./show.js";
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
  const limit = box.model==="pixcon" && network.protocol==="elor" ? Math.min(170,box.pixelLimit) : box.pixelLimit;
  next.offset = firstGap(ranges,f.count,f.offset,limit);
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
