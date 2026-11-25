import {profile,hardware,isPixel,isSerial,channels,hex,address,doubleID,serialPixel} from "./show.js";
export function review(show){
 const notes=[],seen=new Set(),claims=new Map(),ranges=new Map(),ds=new Map(show.devices.map(d=>[d.id,d])),ns=new Map(show.networks.map(n=>[n.id,n]));
 const flag=(row,message,level="error")=>{const key=row.id+message;if(!seen.has(key)){seen.add(key);notes.push({id:row.id,name:row.name,message,level})}};
 function claim(key,row,label){
  const other=claims.get(key);if(other){flag(row,label+" also used by "+other.name);flag(other,label+" also used by "+row.name)}else claims.set(key,row);
 }
 function reserve(key,lo,hi,row,label){
  const list=ranges.get(key)||[];
  for(const a of list)if(lo<=a.hi&&hi>=a.lo){flag(row,label+" overlaps "+a.row.name);flag(a.row,label+" overlaps "+row.name)}
  list.push({lo,hi,row});ranges.set(key,list)
 }
 for(const n of ns.values()){
  if(n.bridge){const b=ds.get(n.bridge);if(!b||!["bridge","aurora"].includes(b.model))flag(n,"Select a valid upstream bridge");
   else {if(b.net===n.id||ns.get(b.net)?.protocol!=="sacn")flag(n,"Bridge input requires an Ethernet network");
    if(b.model==="aurora"&&(n.protocol!=="dmx"||n.output>2))flag(n,"Aurora Core provides two DMX bridge outputs");
    if(b.model==="bridge"&&!["elor","pixlink","dmx"].includes(n.protocol))flag(n,"Select an ELOR, PixieLink or DMX output");
    claim("bridge:"+b.id+":"+n.output,n,"Bridge output "+n.output)}}
  if(n.protocol==="pixlink"&&!n.bridge)flag(n,"Select a PixieLink bridge");
  if(n.protocol==="lor"&&n.speed>115200)flag(n,"Check the regular network speed");
  if(n.protocol==="elor"&&n.speed>=500000&&n.source==="USB485"&&!n.bridge)flag(n,"Select a high-speed USB adapter for this rate");
 }
 for(const d of ds.values()){
  const n=ns.get(d.net),p=ds.get(d.parent),m=profile(d);if(!n){flag(d,"Network is missing");continue}
  if(!m.net.includes(n.protocol))flag(d,m.name+" does not support this planned mode");
  if(d.parent&&(!p||(p.net!==d.net&&p.model!=="computer")))flag(d,"Upstream box must be on the same network");
  const visited=new Set([d.id]);let cur=p;while(cur){if(visited.has(cur.id)){flag(d,"Connection loop");break}visited.add(cur.id);cur=ds.get(cur.parent)}
  if(d.model==="rx"&&(!p||p.model!=="tx"||p.rf!==d.rf))flag(d,"Pair with a transmitter on the same RF channel");
  if(p?.model==="tx"&&d.model!=="rx")flag(d,"A transmitter feeds a wireless receiver");
  if(d.model==="edge"){
   if(p?.model!=="aurora"||d.branch>2)flag(d,"Select an Aurora Core long-range output 1 or 2");
  }else if(n.protocol==="sacn"&&p&&!["switch","computer"].includes(p.model))flag(d,"Use an Ethernet switch or show computer upstream");
  if(d.model.startsWith("pixie")&&d.pixelLimit>340)flag(d,"Pixie ports support up to 340 pixels in double Unit ID mode");
  if(d.model.startsWith("pixie")&&n.protocol==="lor"&&doubleID(d))flag(d,"Double Unit ID mode requires Enhanced LOR or PixieLink");
  if(d.model==="pixcon"&&d.pixelLimit>(n.protocol==="elor"?170:340))flag(d,"Configured limit exceeds the PixCon16 limit in this mode");
  if(isSerial(n)&&m.ports){const first=parseInt(d.unit,16),total=m.kind==="pixel"?m.ports*(doubleID(d)?2:1):1;
   if(first<1||first+total-1>240)flag(d,"Unit range must fit 01–F0");
   for(let j=0;j<total;j++)claim("id:"+n.id+":"+(first+j),d,"Unit "+hex(first+j));
   if(n.speed===1000000&&!["pixcon"].includes(d.model)&&!d.model.startsWith("pixie"))flag(d,"Check this controller’s 1 Mbps compatibility");
  }
  if(d.ip){if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(d.ip)||d.ip.split(".").some(x=>Number(x)>255))flag(d,"Invalid IPv4 address");else claim("ip:"+d.net+":"+d.ip,d,"IP "+d.ip)}
  if(d.model==="tx"&&n.protocol==="lor"&&n.speed>115200)flag(d,"ELL RF-V5 maximum is 115.2 kbps");
  if(d.parent&&isSerial(n)&&p&&!["tx","repeater"].includes(p.model))claim("chain:"+p.id,d,"Daisy-chain output");
 }
 for(const f of show.fixtures){
  if(!f.points.length)flag(f,"Awaiting placement","note");
  if(f.state==="Needs check")flag(f,"Installation needs checking","note");
  const d=ds.get(f.device);if(!d){flag(f,"Awaiting a controller output","note");continue}
  const n=ns.get(d.net);if(!n)continue;const m=profile(d),pix=isPixel(f);
  const match=m.kind==="pixel"?pix:m.kind==="ac"?["ac","relay"].includes(f.type):m.kind==="dc"?["dc","rgb"].includes(f.type):m.kind==="dmx";
  if(!match&&!(m.kind==="flood"&&["rgb","dc"].includes(f.type)))flag(f,"Fixture type does not match "+m.name);
  if(m.kind==="flood"&&f.type==="rgb"&&f.port!==1)flag(f,"CF50D RGB uses channels 1–3; channels 4 and 5 control strobe timing");
  if(f.type==="rgbw"&&d.model!=="generic")flag(f,"Verify RGBW output support for this hardware","note");
  const portMax=m.kind==="dc"&&f.type==="rgb"?Math.floor(m.ports/3):m.ports;
  if(f.port>portMax)flag(f,"Output exceeds controller capacity");
  if(pix&&m.kind==="pixel"){
   const max=d.model==="pixcon"&&n.protocol==="elor"?170:d.pixelLimit;
   if(f.offset+f.count-1>max)flag(f,"Pixel range exceeds configured port limit of "+max);
   reserve("port:"+d.id+":"+f.port,f.offset,f.offset+f.count-1,f,"Pixel range");
  }else if(["dc","ac","flood"].includes(m.kind)){
   const start=m.kind==="dc"&&f.type==="rgb"?(f.port-1)*3+1:f.port;
   reserve("out:"+d.id,start,start+channels(f)-1,f,"Output circuit");
  }
  const inputNet=n.bridge?ns.get(ds.get(n.bridge)?.net):n;
  if(!isSerial(n)||n.bridge){
   const bridged=n.bridge&&isSerial(n),px=bridged&&m.kind==="pixel"?serialPixel(f,d):null;
   const uni=bridged?d.universe+(px?.relative||0):f.universe;
   const start=bridged?(px?px.channel:Number(address(f,d,n).split("ch ")[1])):f.slot;
   const slots=n.protocol==="dmx"?512:(inputNet?.slots||510);
   const tail=px&&f.offset<=px.split?Math.max(0,f.count-(px.split-f.offset+1)):0;
   const tailChannels=tail*(f.type==="rgbw"?4:3),firstSpan=channels(f)-tailChannels;
   if(start>slots||((n.protocol==="dmx"||bridged)&&start+firstSpan-1>slots)||tailChannels>slots)flag(f,"Channel span exceeds this universe");
   const lo=(uni-1)*slots+start,hi=lo+firstSpan-1;
   if(tail){reserve("universe:"+(inputNet?.id||n.id),uni*slots+1,uni*slots+tailChannels,f,"Universe channels");if(uni>=63999)flag(f,"Universe range exceeds 63999")}
   if(hi>63999*slots)flag(f,"Universe range exceeds 63999");
   reserve("universe:"+(inputNet?.id||n.id),lo,hi,f,"Universe channels");
  }
 }
 return notes;
}
export function patchText(f,show){
 const d=show.devices.find(d=>d.id===f.device),n=show.networks.find(n=>n.id===d?.net);
 return d&&n?d.name+" / "+(hardware[d.model].kind==="pixel"?"P":"Out ")+f.port+" / "+address(f,d,n):"Unpatched";
}

