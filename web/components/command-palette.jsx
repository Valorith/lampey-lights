import {useEffect,useMemo,useRef,useState} from "react";
import {Modal} from "./forms";
import {I,Kbd} from "./ui-kit";

// items: [{group,label,icon,hint,keys,color,run}]
export function CommandPalette({items,close}){
 const [query,setQuery]=useState(""),[active,setActive]=useState(0),list=useRef(null);
 const shown=useMemo(()=>{const words=query.toLowerCase().split(/\s+/).filter(Boolean);
  if(!words.length)return items.filter(it=>it.group!=="Scene");
  // Rank names that start with the query ahead of matches inside a word, keeping each group together.
  const rank=it=>{const label=it.label.toLowerCase();return label.startsWith(words[0])?0:label.split(" ").some(w=>w.startsWith(words[0]))?1:2};
  const hits=items.filter(it=>{const text=(it.label+" "+it.group+" "+(it.hint||"")).toLowerCase();return words.every(w=>text.includes(w))}).map((it,order)=>({it,order,score:rank(it)}));
  const best=new Map(),first=new Map();for(const h of hits){best.set(h.it.group,Math.min(best.get(h.it.group)??9,h.score));if(!first.has(h.it.group))first.set(h.it.group,h.order)}
  return hits.sort((a,b)=>best.get(a.it.group)-best.get(b.it.group)||first.get(a.it.group)-first.get(b.it.group)||a.score-b.score||a.order-b.order).map(h=>h.it).slice(0,60)},[items,query]);
 useEffect(()=>{list.current?.querySelector("[aria-selected=true]")?.scrollIntoView({block:"nearest"})},[active,shown]);
 const run=it=>{if(!it)return;close();it.run()};
 function keys(e){
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setActive(i=>shown.length?(i+(e.key==="ArrowDown"?1:-1)+shown.length)%shown.length:0)}
  else if(e.key==="Enter"){e.preventDefault();run(shown[active])}
 }
 return <Modal title="Command palette" close={close} className="palette">
  <label className="paletteInput"><I n="search"/><input autoFocus role="combobox" aria-expanded="true" aria-controls="paletteList" aria-label="Search commands and scene" placeholder="Search commands, views and fixtures" value={query} onChange={e=>{setQuery(e.target.value);setActive(0)}} onKeyDown={keys}/><Kbd>Esc</Kbd></label>
  <div className="paletteList" id="paletteList" role="listbox" ref={list}>
   {shown.map((it,i)=><div key={it.group+it.label+i}>{(!i||shown[i-1].group!==it.group)&&<h4>{it.group}</h4>}
    <button type="button" role="option" aria-selected={i===active} onMouseMove={()=>setActive(i)} onClick={()=>run(it)}>{it.color?<i className="lamp" style={{"--c":it.color}}/>:<I n={it.icon||"chevron"} size={16}/>}<span>{it.label}</span>{it.hint&&<small>{it.hint}</small>}{it.keys&&<Kbd>{it.keys}</Kbd>}</button></div>)}
   {!shown.length&&<p className="paletteNone">No matches</p>}
  </div>
 </Modal>
}

const shortcuts=[
 ["General",[["Command palette","Ctrl K"],["Undo / redo","Ctrl Z / Ctrl Shift Z"],["Layout, Network, Patch","1  2  3"],["Shortcuts","?"],["Cancel or deselect","Esc"]]],
 ["Scene",[["Toolbox","T"],["Draw strand","D"],["Find in scene","/"],["Scene panel","["],["Edit selection","E"],["Duplicate selection","Ctrl D"],["Hide or show selection","H"],["Remove selection","Del"]]],
 ["View",[["Preview show","Space"],["Night or daylight","N"],["Labels","L"],["Wiring","W"],["Frame selection","F"],["Reset camera","R"],["Zoom","+  −"]]],
 ["Drawing",[["Pick a drawing tool","1 – 8"],["Finish a path","Enter"],["Remove last point","Backspace"],["Level, plumb or square","Shift"],["Ignore snapping","Alt"],["Resize a prop","[  ]"],["Turn a prop",",  ."]]]
];
export function Shortcuts({close}){
 return <Modal title="Keyboard shortcuts" close={close} className="wide"><div className="shortcutGrid">{shortcuts.map(([title,rows])=><section key={title}><h3>{title}</h3>{rows.map(([label,keys])=><div key={label}><span>{label}</span><Kbd>{keys}</Kbd></div>)}</section>)}</div></Modal>
}
