import { canonicalAsset, canonicalGround, BASE_GRASS_ASSET } from './assetPaths.js';
const GRASS=BASE_GRASS_ASSET;
export function validateStructure(data){
 if(data?.version!==1||data.tileSize!==16||!Number.isInteger(data.width)||!Number.isInteger(data.height)||data.width<1||data.height<1||data.width>64||data.height>64)throw Error('Structures must be version 1, 16px tiles and at most 64×64 tiles.');
 data={...data,defaultGround:data.defaultGround?canonicalGround(data.defaultGround):undefined,layers:{...data.layers,indoor:data.layers?.indoor??[],roofs:data.layers?.roofs??[]}};
 for(const key of Object.keys(data.layers))if(Array.isArray(data.layers[key]))data.layers[key]=data.layers[key].map(e=>e?{...e,asset:canonicalAsset(e.asset)}:e);
 for(const layer of ['tiles','props','loot','indoor','roofs']){
  if(!Array.isArray(data.layers?.[layer])||data.layers[layer].length>data.width*data.height*3)throw Error('Invalid structure layer.');
  const cells=new Set();
  for(const entry of data.layers[layer]){
   if(!entry||!Number.isInteger(entry.x)||!Number.isInteger(entry.y)||entry.x<0||entry.y<0||entry.x>=data.width||entry.y>=data.height||typeof entry.asset!=='string')throw Error('Invalid structure position or asset.');
   const plane=entry.plane??0,key=plane+':'+entry.x+':'+entry.y;
   if(!Number.isInteger(plane)||plane<0||plane>=(layer==='loot'?1:3)||cells.has(key))throw Error('Invalid or duplicate structure layer cell.');cells.add(key);
   if(layer==='props'&&['offsetX','offsetY'].some(k=>entry[k]!==undefined&&(!Number.isInteger(entry[k])||entry[k]<-8||entry[k]>7)))throw Error('Invalid structure prop offset.');
   if(layer==='props'&&['collision','ySort'].some(k=>entry[k]!==undefined&&typeof entry[k]!=='boolean'))throw Error('Invalid structure prop setting.');
   if(layer==='loot'&&entry.quantity!==undefined&&(!Number.isInteger(entry.quantity)||entry.quantity<1||entry.quantity>999))throw Error('Invalid structure loot amount.');
  }
 }
 return data;
}
export async function loadStructures(fetcher=fetch){
 const response=await fetcher('./structures/catalog.json',{cache:'no-store'});if(!response.ok)throw Error('Could not load structures/catalog.json.');
 const names=await response.json();if(!Array.isArray(names))throw Error('Invalid structure catalog.');
 const structures=await Promise.all(names.filter(name=>typeof name==='string'&&/^[a-z0-9_-]+\.json$/i.test(name)&&name!=='catalog.json').map(async name=>{const result=await fetcher('./structures/'+name,{cache:'no-store'});if(!result.ok)throw Error('Could not load structure '+name);return validateStructure(await result.json());}));
 if(!structures.length)throw Error('Add a structure JSON to the structures folder first.');return structures;
}
export function generateStructureMap(structures,{seed=1,width=125,height=125,count=14}={}){
 structures=structures.map(validateStructure);if(!structures.length)throw Error('No structures available.');
 let state=Number(seed)>>>0;const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
 const map={version:1,tileSize:16,width,height,defaultGround:GRASS,layers:{tiles:[],props:[],loot:[],indoor:[],roofs:[]}},tiles=new Map(),placed=[];
 const mx=Math.floor(width/2),my=Math.floor(height/2),margin=9;
 const tile=(x,y,asset)=>{if(x>=0&&y>=0&&x<width&&y<height)tiles.set(x+','+y,{x,y,asset,plane:0});};
 const reserved=[{x:margin+2,y:my},{x:width-margin-3,y:my},{x:mx,y:margin+2}];
 const weight=structures.reduce((sum,s)=>sum+Math.max(.1,Number(s.weight)||1),0);
 for(let attempt=0;attempt<400&&placed.length<count;attempt++){
  let roll=random()*weight;const structure=structures.find(s=>(roll-=Math.max(.1,Number(s.weight)||1))<=0)??structures[0];
  const w=structure.width,h=structure.height;if(w>width-2*margin||h>height-2*margin)continue;
  const x=margin+Math.floor(random()*(width-2*margin-w+1)),y=margin+Math.floor(random()*(height-2*margin-h+1));
  if(reserved.some(p=>p.x>=x-3&&p.x<x+w+3&&p.y>=y-3&&p.y<y+h+3))continue;
  if(placed.some(p=>x<p.x+p.w+4&&x+w+4>p.x&&y<p.y+p.h+4&&y+h+4>p.y))continue;
  placed.push({x,y,w,h,name:structure.name??'Structure'});
  for(const layer of ['tiles','props','loot','indoor','roofs'])for(const entry of structure.layers[layer]){
   if(entry.asset==='marker:player-spawn'||entry.asset==='assets/buildings/misc/hatch_closed.png')continue;
   const value={...entry,x:x+entry.x,y:y+entry.y};
   if(layer==='tiles'&&!(entry.plane??0))tile(value.x,value.y,value.asset);else map.layers[layer].push(value);
  }

 }
 if(!placed.length)throw Error('No structure fits this map. Use smaller structures.');
 const usedProps=new Set(map.layers.props.map(p=>p.x+','+p.y));
 const open=(x,y,pad=0)=>!placed.some(p=>x>=p.x-pad&&x<p.x+p.w+pad&&y>=p.y-pad&&y<p.y+p.h+pad)&&!reserved.some(p=>Math.abs(x-p.x)<3&&Math.abs(y-p.y)<3);
 for(let i=0;i<700;i++){const x=margin+Math.floor(random()*(width-margin*2)),y=margin+Math.floor(random()*(height-margin*2));if(!open(x,y,2)||tiles.has(x+','+y)||usedProps.has(x+','+y))continue;usedProps.add(x+','+y);map.layers.props.push({x,y,asset:random()<.12?'assets/buildings/foliage/foliage_tree.png':'assets/buildings/foliage/foliage_grass.png',plane:0});}
 map.layers.props.push({x:margin+2,y:my,asset:'marker:player-spawn'},{x:width-margin-3,y:my,asset:'assets/world/hatch_closed.png'},{x:mx,y:margin+2,asset:'assets/world/hatch_closed.png'});
 map.layers.tiles=[...tiles.values()];map.placements=placed;return map;
}
