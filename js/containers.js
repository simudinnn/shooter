export const isTieredItem=item=>isPack(item)||(item?.kind==='material'&&item.key==='keycard');
export const isPack=item=>item?.kind==='material'&&item.key?.endsWith('_pack');
export const isContainer=item=>isPack(item)||(item?.kind==='material'&&['pistol_box','rifle_box','shotgun_box','sniper_box'].includes(item.key));
export const packTier=item=>Math.max(1,Math.min(3,Math.floor(item?.tier??1)));
export function rollPackTier(){const roll=Math.random();return roll<0.7?1:roll<0.95?2:3;}
const pick=values=>values[Math.floor(Math.random()*values.length)];
export function containerLoot(item){
 if(!isContainer(item))return [];
 if(!isPack(item)){const ammoType=item.key.replace('_box','');return [{kind:'ammo',ammoType,amount:{pistol:48,rifle:60,shotgun:24,sniper:20}[ammoType]}];}
 const tier=packTier(item),roll=Math.random();
 if(roll<[0,0.002,0.005,0.01][tier])return [{kind:'material',key:'blueprint',amount:1}];
 if(roll<[0,0.012,0.035,0.07][tier])return [{kind:'weapon',key:pick(tier===3?['m16','famas','fal','m24']:['glock','revolver','uzi','m870']),ammo:0,durability:65+Math.floor(Math.random()*36)}];
 // Tools and valuables share the pack's tier without replacing rare blueprint/weapon rolls.
 const extraPools={equipment_pack:['radar','matches'],military_pack:['keycard','barbed_wire','gas_bottle','barbed_wire','gas_bottle'],archive_pack:['keycard','key','phone','phone','phone',...(tier===3?['laptop']:[])],industrial_pack:['barbed_wire','gas_bottle','matches',...(tier>=2?['generator']:[])]};
 if(Math.random()<0.25){const key=pick(extraPools[item.key]??['matches']);return [{kind:'material',key,amount:1,...(key==='keycard'?{tier}:{})}];}
 if(item.key==='equipment_pack')return [{kind:'equipment',key:pick(tier===3?['backpack2','backpack3','police_vest','military_vest']:['backpack_1','vest','hunting_vest']),durability:60+Math.floor(Math.random()*41)}];
 if(item.key==='industrial_pack')return [{kind:'material',key:pick(['fuel','repair_kit','sewing_kit','electrical_comp']),amount:tier===3?2:1}];
 if(item.key==='archive_pack')return Math.random()<0.1*tier?[{kind:'material',key:'blueprint_old',amount:1}]:[{kind:'material',key:'cash',amount:15+Math.floor(Math.random()*20)*tier}];
 return [{kind:'ammo',ammoType:pick(['pistol','rifle','shotgun','sniper']),amount:10+tier*8},{kind:'consumable',key:pick(['bandage','apple','medkit']),amount:1}];
}
export function openContainer(player,index){
 const item=player.itemSlots[index];if(!isContainer(item))return false;
 const previous=structuredClone(player.itemSlots),loot=containerLoot(item);
 player.itemSlots[index]=(item.amount??1)>1?{...item,amount:item.amount-1}:null;
 for(const reward of loot){const result=player.tryStoreItem(reward);if(!result.ok||result.remainder){player.itemSlots=previous;return false;}}
 if(isPack(item)&&player.raidStats)player.raidStats.packsOpened=(player.raidStats.packsOpened??0)+1;
 return true;
}
