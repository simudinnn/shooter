/** Stage an entire group before committing, so full destinations cannot lose items. */
export function moveStacks(containers,selection,target,capacities){
 const next=Object.fromEntries(Object.entries(containers).map(([key,slots])=>[key,slots.map(item=>item?{...item}:null)]));
 const picked=[];const seen=new Set();
 for(const {container,index} of selection){const token=container+':'+index;if(seen.has(token))continue;seen.add(token);if(index<0||index>=capacities[container]||!next[container]?.[index])return null;picked.push(next[container][index]);next[container][index]=null;}
 if(!next[target.container]||!picked.length)return null;
 const cap=capacities[target.container],start=Math.max(0,Math.min(cap-1,target.index));
 for(const item of picked){let placed=false;for(let n=0;n<cap;n++){const i=(start+n)%cap;if(!next[target.container][i]){next[target.container][i]=item;placed=true;break;}}if(!placed)return null;}
 return next;
}
