import {useCallback,useEffect,useRef,useState} from "react";

const paths={
 layout:"m12 2 9 5v10l-9 5-9-5V7z M3 7l9 5 9-5 M12 12v10",
 network:"M9 3h6v5H9z M12 8v4 M5 16v-4h14v4 M2 16h6v5H2z M16 16h6v5h-6z",
 patch:"M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h4",
 undo:"m8 5-5 5 5 5 M4 10h9c5 0 7 3 7 8",
 redo:"m16 5 5 5-5 5 M20 10h-9c-5 0-7 3-7 8",
 eye:"M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
 eyeOff:"M3 3l18 18 M10.5 5.2Q11.2 5 12 5c6 0 10 7 10 7q-1.3 2.2-3.2 3.9 M6.3 6.3Q3.6 8.6 2 12s4 7 10 7q2.3 0 4.2-1",
 search:"m16 16 5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
 plus:"M12 4v16 M4 12h16",
 minus:"M4 12h16",
 x:"M6 6l12 12 M18 6 6 18",
 draw:"m4 17 4 2 12-13-4-3z M3 21l5-2",
 cursor:"m5 3 15 10-8 1-4 7z",
 moon:"M19 15A9 9 0 0 1 9 4a9 9 0 1 0 10 11z",
 sun:"M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M12 1v3 M12 20v3 M1 12h3 M20 12h3 M4 4l2 2 M18 18l2 2 M20 4l-2 2 M6 18l-2 2",
 tag:"M3 3h8l10 10-8 8L3 11z M7 7h.01",
 play:"m7 4 13 8-13 8z",
 pause:"M8 4v16 M16 4v16",
 home:"M3 11 12 3l9 8 M5 10v10h14V10 M10 20v-6h4v6",
 expand:"M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6",
 shrink:"M9 3v6H3 M21 9h-6V3 M15 21v-6h6 M3 15h6v6",
 strand:"M2 15q5-12 10-4t10-3 M5 9v4 M12 11v5 M19 11v4",
 tree:"m12 2-5 7h3l-6 7h6v5h4v-5h6l-6-7h3z",
 box:"M4 4h16v16H4z M8 8h8 M8 12h2 M8 16h2",
 layers:"m3 8 9-5 9 5-9 5z M3 12l9 5 9-5 M3 16l9 5 9-5",
 camera:"M3 7h4l2-3h6l2 3h4v13H3z M15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
 edit:"m4 16 12-12 4 4L8 20l-5 1z",
 check:"m4 12 5 5L20 6",
 folder:"M3 5h7l2 3h9v12H3z",
 chevron:"m9 6 6 6-6 6",
 down:"m6 9 6 6 6-6",
 up:"m6 15 6-6 6 6",
 trash:"M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6",
 copy:"M9 9h11v11H9z M5 15H4V4h11v1",
 target:"M12 2v5 M12 17v5 M2 12h5 M17 12h5 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
 zoomIn:"m16 16 5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0 M10 7v6 M7 10h6",
 zoomOut:"m16 16 5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0 M7 10h6",
 keyboard:"M2 6h20v12H2z M6 10h.01 M10 10h.01 M14 10h.01 M18 10h.01 M7 14h10",
 alert:"M12 3 2 20h20z M12 10v4 M12 17h.01",
 info:"M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 11v5 M12 8h.01",
 sidebar:"M3 4h18v16H3z M9 4v16",
 download:"M12 3v12 M7 10l5 5 5-5 M4 20h16",
 upload:"M12 16V4 M7 9l5-5 5 5 M4 20h16",
 printer:"M7 8V3h10v5 M5 17H3V8h18v9h-2 M7 14h10v7H7z",
 power:"M12 3v9 M6.5 7a8 8 0 1 0 11 0",
 pin:"M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z M14.5 9a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0",
 external:"M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6",
 move:"M12 3v18 M3 12h18 M9 6l3-3 3 3 M9 18l3 3 3-3 M6 9l-3 3 3 3 M18 9l3 3-3 3",
 bulb:"M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
 cable:"M2 16h4v4H2z M4 16v-3q0-4 4-4h7q4 0 4-4 M17 2h4v4h-4z",
 book:"M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z M20 4h-5a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h5z",
 trace:"M3 11 12 4l9 7 M6 9.5V20h12V9.5 M12 13.5h.01",
 path:"M4 19 9 8l6 8 5-11 M4 19h.01 M9 8h.01 M15 16h.01 M20 5h.01",
 line:"M5 19 19 5 M5 19h.01 M19 5h.01",
 rect:"M4 6h16v12H4z",
 circle:"M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
 arc:"M3 19a9 9 0 0 1 18 0",
 swag:"M2 7q5 11 10 0 M12 7q5 11 10 0",
 free:"M3 17c3-9 5 4 8-3s4-8 6-3 2 6 4 3",
 magnet:"M5 4v8a7 7 0 0 0 14 0V4h-4v8a3 3 0 0 1-6 0V4z M5 8h4 M15 8h4",
 route:"M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M8 17h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6"
};

export function I({n,size=17}){
 return <svg className="ico" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[n]}/></svg>
}

// Icon button. `tip` renders the styled tooltip; `pos` is up (default), down, or an -end variant near the right edge.
export function Tool({n,label,tip,action,active,disabled,pos,className=""}){
 return <button type="button" className={"tool "+(active?"on ":"")+className} aria-label={label} aria-pressed={active===undefined?undefined:!!active} data-tip={tip||label} data-tip-pos={pos} onClick={action} disabled={disabled}><I n={n}/></button>
}

export function Kbd({children}){return <kbd>{children}</kbd>}

// A value kept in localStorage across visits. Reads lazily so the server render stays on the default.
export function usePref(name,initial){
 const key="lampey.ui."+name;
 const [value,set]=useState(()=>{try{const raw=typeof window==="undefined"?null:localStorage.getItem(key);return raw===null?initial:JSON.parse(raw)}catch{return initial}});
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}},[key,value]);
 return [value,set];
}

export function useToasts(){
 const [toasts,setToasts]=useState([]),timers=useRef(new Map());
 const dismiss=useCallback(key=>{clearTimeout(timers.current.get(key));timers.current.delete(key);setToasts(list=>list.filter(t=>t.key!==key))},[]);
 // A toast given an id replaces the previous one with that id instead of stacking.
 const toast=useCallback((message,{kind="info",action=null,ttl,id}={})=>{
  if(!message)return;const key=id||kind+":"+message;
  setToasts(list=>[...list.filter(t=>t.key!==key).slice(-3),{key,message,kind,action}]);
  clearTimeout(timers.current.get(key));timers.current.set(key,setTimeout(()=>dismiss(key),ttl??(kind==="error"?9000:action?6500:3200)));
 },[dismiss]);
 // Drop toasts that offer an action once that action no longer applies.
 const settle=useCallback(()=>setToasts(list=>list.filter(t=>!t.action)),[]);
 useEffect(()=>{const pending=timers.current;return()=>pending.forEach(clearTimeout)},[]);
 return {toasts,toast,dismiss,settle};
}

export function Toaster({toasts,dismiss}){
 return <div className="toaster" aria-live="polite">{toasts.map(t=><div key={t.key} className={"toast "+t.kind} role={t.kind==="error"?"alert":"status"}>
  <I n={t.kind==="error"?"alert":t.kind==="success"?"check":"info"}/><span>{t.message}</span>
  {t.action&&<button type="button" className="toastAction" onClick={()=>{t.action.run();dismiss(t.key)}}>{t.action.label}</button>}
  <button type="button" className="plain toastClose" aria-label="Dismiss" onClick={()=>dismiss(t.key)}><I n="x" size={14}/></button>
 </div>)}</div>
}

export function Empty({icon="bulb",title,children}){
 return <div className="empty"><span className="emptyMark"><I n={icon} size={22}/></span><strong>{title}</strong>{children}</div>
}
