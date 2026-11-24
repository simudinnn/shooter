import { DISPLAY_ONLY_GUNS } from './blueprints.js';

/** Inventory dimensions are independent of the held weapon sprite. */
export function itemWidth(item) { return 1; }
export function itemSize(item) { const width=itemWidth(item); return item?.rotated && width>1 ? {width:1,height:width} : {width,height:1}; }
export function canEquipHand(index,item) { return !item || (['weapon','melee'].includes(item.kind) && !(item.kind === 'weapon' && DISPLAY_ONLY_GUNS[item.key])); }
export function styleItemSlot(slot,item,forcedWidth=null) {
 const {width,height}=itemSize(item);
 slot.classList.toggle('inventory-wide-item',width>1||height>1);
 slot.classList.toggle('inventory-rotated-item',!forcedWidth&&!!item?.rotated&&itemWidth(item)>1);
 slot.style.setProperty('--item-width',width);slot.style.setProperty('--item-height',height);
 slot.style.backgroundImage=width>1||height>1?`url('assets/ui/${width}x${height}_slot.png')`:'';
}
export function storageLayout(items,capacity,columns) {
 const occupied=new Set(),positions=new Map();let overflow=0;
 const cells=(cell,w,h)=>Array.from({length:w*h},(_,n)=>cell+Math.floor(n/w)*columns+n%w);
 const fits=(cell,w,h,bound)=>cell>=0&&cell%columns+w<=columns&&cell+(h-1)*columns+w<=bound&&cells(cell,w,h).every(c=>!occupied.has(c));
 const order=Array.from({length:items.length},(_,i)=>i).sort((a,b)=>Number(Number.isInteger(items[b]?.storageCell))-Number(Number.isInteger(items[a]?.storageCell)));
 for(const index of order) {
  const item=items[index];if(!item)continue;const {width,height}=itemSize(item);let cell=index;
  if(!fits(cell,width,height,capacity)){cell=-1;for(let c=0;c<capacity;c++)if(fits(c,width,height,capacity)){cell=c;break;}}
  if(cell<0||!fits(cell,width,height,capacity)){overflow+=width*height;cell=Math.ceil(capacity/columns)*columns;while(!fits(cell,width,height,Infinity))cell++;}
  positions.set(index,{cell,width,height});for(const c of cells(cell,width,height))occupied.add(c);
 }
 let emptyCell=0;for(let index=0;index<capacity;index++){if(items[index])continue;while(occupied.has(emptyCell)&&emptyCell<capacity)emptyCell++;if(emptyCell>=capacity)break;positions.set(index,{cell:emptyCell++,width:1,height:1});}
 return {positions,overflow,used:occupied.size};
}
export function applyStorageLayout(grid,items,capacity,columns,unlockedCapacity=capacity){
 const {positions}=storageLayout(items,unlockedCapacity,columns);
 for(let i=unlockedCapacity;i<capacity;i++)if(!items[i])positions.set(i,{cell:i,width:1,height:1});
 Array.from(grid.children).forEach((slot,index)=>{const p=positions.get(index);slot.hidden=!p;if(!p)return;slot.dataset.storageCell=p.cell;slot.style.gridColumn=`${p.cell%columns+1} / span ${p.width}`;slot.style.gridRow=`${Math.floor(p.cell/columns)+1} / span ${p.height}`;styleItemSlot(slot,items[index]);});
}
