import {I,Tool} from "./ui-kit";
import {drawTools,dragTools,spacings,toolDefaults} from "../lib/draw-tools";
import {lampPresets} from "../lib/stage";

export const strandPresets=lampPresets.filter(p=>p[1]==="run");
// Lamp spacing in inches that suits each kind of strand.
export const presetSpacing={"Pixel strand":3,"C9 roof bulbs":12,"Mini LED string":4,"RGB strip":2,"RGBW pixels":3};
const toolIcons={feature:"trace",path:"path",line:"line",rect:"rect",circle:"circle",arc:"arc",swag:"swag",free:"free"};
export const toolKeys=Object.keys(toolIcons);
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,Number(n)||lo));

function Num({label,value,set,min,max,step=1,width=62}){
 return <label className="opt">{label}<input type="number" style={{width}} min={min} max={max} step={step} value={value} onChange={e=>set(clamp(e.target.value,min,max))}/></label>
}

// Tool picker and options shown while drawing strands. `series` is true when drawing new strands one after another.
export function DrawBar({tool,setTool,opts,setOpts,fixture,setFixture,preset,setPreset,spacing,setSpacing,series,points,back,finish,done}){
 const o={...toolDefaults,...opts},change=(k,v)=>setOpts({...o,[k]:v});
 return <div className="drawBar" role="toolbar" aria-label="Strand drawing tools">
  <div className="toolRow">
   {toolKeys.map((key,i)=><button type="button" key={key} className={"tool"+(tool===key?" on":"")} aria-label={drawTools[key].name} aria-pressed={tool===key} data-tip={drawTools[key].name+" · "+(i+1)} onClick={()=>setTool(key)}><I n={toolIcons[key]}/></button>)}
   <span className="divider"/>
   <Tool n="magnet" label="Snap to corners and edges" tip="Snap · Alt to bypass" active={o.snap} action={()=>change("snap",!o.snap)}/>
   <span className="grow"/>
   {tool==="path"&&<><button type="button" disabled={!points} data-tip="Backspace" onClick={back}><I n="undo" size={15}/>Back</button><button type="button" disabled={points<2} className="primary" data-tip="Enter" onClick={finish}><I n="check" size={15}/>Finish</button></>}
   <button type="button" data-tip="Esc" onClick={done}>{series?"Done":"Cancel"}</button>
  </div>
  <div className="optRow">
   {series&&<label className="opt">Lights<select aria-label="Light type" value={preset} onChange={e=>setPreset(e.target.value)}>{strandPresets.map(p=><option key={p[0]}>{p[0]}</option>)}</select></label>}
   <label className="opt colorOpt" data-tip="Light colour"><input type="color" aria-label="Light colour" value={fixture.color} onChange={e=>setFixture({...fixture,color:e.target.value})}/></label>
   {series&&<label className="opt">Spacing<select aria-label="Lamp spacing" value={spacing} onChange={e=>setSpacing(Number(e.target.value))}>{spacings.map(n=><option key={n} value={n}>{n?n+" in":"Fixed count"}</option>)}</select></label>}
   {series&&!spacing&&<Num label="Count" value={fixture.count} set={n=>setFixture({...fixture,count:Math.round(n)})} min={2} max={2048}/>}
   {tool==="swag"&&<><Num label="Drapes" value={o.drapes} set={n=>change("drapes",Math.round(n))} min={1} max={24} width={52}/><Num label="Sag (m)" value={o.sag} set={n=>change("sag",n)} min={0} max={3} step={.05}/></>}
   {tool==="arc"&&<Num label="Rise (%)" value={Math.round(o.rise*100)} set={n=>change("rise",n/100)} min={5} max={150} step={5}/>}
   <span className="drawHint"><i className="pulse"/>{drawTools[tool].hint}{tool==="path"&&points>0&&<b>{points}</b>}{dragTools.includes(tool)&&<em>Right-drag to orbit</em>}</span>
  </div>
 </div>
}

// Options shown while a prop follows the cursor. `turn` is null while the prop faces out of whatever wall it is over.
export function PropBar({fixture,setFixture,turn,setTurn,repeat,setRepeat,cancel}){
 const flat=!["tree","flood"].includes(fixture.shape);
 return <div className="drawBar" role="toolbar" aria-label="Prop placement">
  <div className="optRow">
   <span className="drawHint"><i className="pulse"/>{fixture.shape==="flood"?"Click a surface to mount the flood":"Click a surface to place "+fixture.name}</span>
   <span className="grow"/>
   {fixture.shape!=="flood"&&<Num label="Height (m)" value={fixture.size} set={n=>setFixture({...fixture,size:Number(n.toFixed(2))})} min={.1} max={20} step={.1}/>}
   {flat&&<><Num label="Turn (°)" value={turn??fixture.yaw??0} set={n=>setTurn(Math.round(n))} min={-180} max={180} step={15}/><button type="button" className={"chipBtn"+(turn===null?" on":"")} aria-pressed={turn===null} data-tip="Face out of the wall under the cursor" onClick={()=>setTurn(turn===null?fixture.yaw||0:null)}>Auto</button></>}
   <label className="opt colorOpt" data-tip="Light colour"><input type="color" aria-label="Light colour" value={fixture.color} onChange={e=>setFixture({...fixture,color:e.target.value})}/></label>
   <button type="button" className={"chipBtn"+(repeat?" on":"")} aria-pressed={repeat} data-tip="Keep placing copies · Shift-click" onClick={()=>setRepeat(!repeat)}><I n="copy" size={14}/>Several</button>
   <button type="button" data-tip="Esc" onClick={cancel}>{repeat?"Done":"Cancel"}</button>
  </div>
 </div>
}
