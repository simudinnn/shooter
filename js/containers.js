import { resolveBlueprint } from './blueprints.js';
export const isTieredItem=item=>isPack(item)||(item?.kind==='material'&&item.key==='keycard');
export const isPack=item=>item?.kind==='material'&&item.key?.endsWith('_pack');
export const isContainer=item=>isPack(item)||(item?.kind==='material'&&['pistol_box','rifle_box','shotgun_box','sniper_box'].includes(item.key));
export const packTier=item=>Math.max(1,Math.min(3,Math.floor(item?.tier??1)));
export function rollPackTier(){const roll=Math.random();return roll<0.7?1:roll<0.95?2:3;}
const pick=values=>values[Math.floor(Math.random()*values.length)];
const material = (key, amount = 1) => ({ kind: 'material', key, amount });
const MILITARY_AMMO = ['pistol_box', 'rifle_box', 'shotgun_box', 'sniper_box'];
const EQUIPMENT_BY_TIER = [
  ['backpack_1', 'vest', 'hunting_vest'],
  ['backpack2', 'hunting_vest', 'police_vest'],
  ['backpack3', 'police_vest', 'military_vest'],
];
const ARCHIVE_BY_TIER = [
  ['phone', 'phone', 'jewlery'],
  ['jewlery', 'laptop', 'blueprint_old'],
  ['jewlery', 'laptop', 'laptop'],
];
const INDUSTRIAL_BY_TIER = [
  ['electrical_comp', 'electrical_trans', 'repair_kit'],
  ['electrical_trans', 'electrical_trans', 'generator'],
  ['electrical_trans', 'generator', 'military_comp'],
];

export function containerLoot(item) {
  if (!isContainer(item)) return [];
  if (!isPack(item)) {
    const ammoType = item.key.replace('_box', '');
    return [{ kind: 'ammo', ammoType, amount: { pistol: 48, rifle: 60, shotgun: 24, sniper: 20 }[ammoType] }];
  }

  const tier = packTier(item);
  const roll = Math.random();
  let rewards;
  switch (item.key) {
    case 'equipment_pack':
      rewards = [
        { kind: 'equipment', key: pick(EQUIPMENT_BY_TIER[tier - 1]), durability: 78 + Math.floor(Math.random() * 23) },
        { kind: 'consumable', key: 'medkit', amount: tier === 3 ? 2 : 1 },
      ];
      break;
    case 'military_pack':
      rewards = [
        material('military_comp'),
        material(pick(MILITARY_AMMO.slice(tier === 1 ? 0 : 1)), tier === 3 ? 2 : 1),
      ];
      break;
    case 'archive_pack':
      rewards = [
        material(pick(ARCHIVE_BY_TIER[tier - 1]), tier === 1 ? 2 : 1),
        material('cash', [30, 65, 110][tier - 1] + Math.floor(Math.random() * 21)),
      ];
      break;
    case 'industrial_pack':
      rewards = [
        material(pick(INDUSTRIAL_BY_TIER[tier - 1]), tier === 1 ? 2 : 1),
        material(tier === 3 ? 'upgrade_kit' : 'repair_kit', tier === 1 ? 1 : 2),
      ];
      break;
    default:
      rewards = [material('phone'), material('cash', 25 * tier)];
  }

  // A jackpot takes the bonus slot, so the pack still delivers its main loot.
  if (roll < [0, 0.002, 0.005, 0.01][tier]) {
    rewards.push(material('blueprint'));
  } else if (roll < [0, 0.012, 0.035, 0.07][tier]) {
    const guns = tier === 3 ? ['m16', 'famas', 'fal', 'm24'] : ['glock', 'revolver', 'uzi', 'm870'];
    rewards.push({ kind: 'weapon', key: pick(guns), ammo: 0, durability: 75 + Math.floor(Math.random() * 26) });
  } else if (tier > 1) {
    const bonus = {
      equipment_pack: material(tier === 3 ? 'radar' : 'sewing_kit'),
      military_pack: { ...material('keycard'), tier: tier - 1 },
      archive_pack: tier === 3 ? material('jewlery') : material('key'),
      industrial_pack: material(tier === 3 ? 'electrical_trans' : 'electrical_comp', tier === 3 ? 1 : 2),
    };
    rewards.push(bonus[item.key] ?? material('cash', 30));
  }
  return rewards.map(reward => resolveBlueprint(reward));
}
export function openContainer(player,index){
 const item=player.itemSlots[index];if(!isContainer(item))return false;
 const previous=structuredClone(player.itemSlots),loot=containerLoot(item);
 player.itemSlots[index]=(item.amount??1)>1?{...item,amount:item.amount-1}:null;
 for(const reward of loot){const result=player.tryStoreItem(resolveBlueprint(reward, player.shopBlueprints));if(!result.ok||result.remainder){player.itemSlots=previous;return false;}}
 if(isPack(item)&&player.raidStats)player.raidStats.packsOpened=(player.raidStats.packsOpened??0)+1;
 return true;
}
