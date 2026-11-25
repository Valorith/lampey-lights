import {env} from "cloudflare:workers";
import {showSchema} from "../../../lib/show";
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(req:Request){
 const db=env.DB!; const id=new URL(req.url).searchParams.get("id");
 if(!id){const r=await db.prepare("SELECT id,name,revision,updated FROM designs ORDER BY updated DESC").all();return json(r.results)}
 const row=await db.prepare("SELECT body,revision FROM designs WHERE id=?").bind(id).first<{body:string,revision:number}>();
 return row?json({design:JSON.parse(row.body),revision:row.revision}):json({error:"Design not found"},404)
}
export async function PUT(req:Request){
 let data;
 try{const body=await req.text(); if(body.length>900000)return json({error:"Design is too large"},413); data=JSON.parse(body)}catch{return json({error:"Invalid design"},400)}
 const d=showSchema.safeParse(data?.design);
 if(!d.success||typeof data.id!=="string"||!/^[a-zA-Z0-9-]{1,80}$/.test(data.id)||!Number.isInteger(data.revision)||data.revision<0)return json({error:"Invalid project data"},400);
 const body=JSON.stringify(d.data),now=Date.now(),db=env.DB!;
 const result=data.revision===0?await db.prepare("INSERT INTO designs(id,name,body,revision,updated) VALUES(?,?,?,1,?) ON CONFLICT(id) DO NOTHING").bind(data.id,d.data.name,body,now).run():
 await db.prepare("UPDATE designs SET name=?,body=?,revision=revision+1,updated=? WHERE id=? AND revision=?").bind(d.data.name,body,now,data.id,data.revision).run();
 return result.meta.changes?json({revision:data.revision+1}):json({error:"A newer version is saved. Reopen it or save your edits as a copy."},409)
}
