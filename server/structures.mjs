import { readdir, mkdir, writeFile, rename } from 'fs/promises';
import { join } from 'path';
import { validateStructure } from '../js/structures.js';
export async function serveStructures(req,res,ROOT,urlPath){
  if(req.method==='POST'&&/^\/structures\/[a-z0-9_-]+\.json$/i.test(urlPath)){
    if(urlPath.toLowerCase()==='/structures/catalog.json'){res.writeHead(400);res.end('This structure name is reserved.');return true;}
    let body='';for await(const chunk of req){body+=chunk;if(body.length>2_000_000){res.writeHead(413);res.end('Structure too large');return true;}}
    try{const data=validateStructure(JSON.parse(body));await mkdir(join(ROOT,'structures'),{recursive:true});const target=join(ROOT,'structures',urlPath.split('/').at(-1));await writeFile(target+'.tmp',JSON.stringify(data,null,2)+'\n');await rename(target+'.tmp',target);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({saved:true}));}catch(error){res.writeHead(400);res.end(error.message);}return true;
  }
  if(urlPath==='/structures/catalog.json'){
    const entries=await readdir(join(ROOT,'structures'),{withFileTypes:true}).catch(()=>[]);
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify(entries.filter(entry=>entry.isFile()&&/^[a-z0-9_-]+\.json$/i.test(entry.name)&&entry.name.toLowerCase()!=='catalog.json').map(entry=>entry.name).sort()));return true;
  }
  return false;
}
