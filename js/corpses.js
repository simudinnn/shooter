import { TILE } from './worldGen.js';
import { CHEST_SLOT_COUNT, rollWeightedLootSlot } from './loot.js';
import { normalizeAmmoItem } from './ammo.js';
import { makeBarrelObstacle } from './buildingGen.js';

export const CORPSE_SLOT_COUNT = CHEST_SLOT_COUNT;
export const CORPSE_INTERACT_DIST = 3;
export const CORPSE_LIFETIME_SEC = 300;
export const CORPSE_DRAW_SCALE = 1.45;

const SPIDER_LOOT_KEYS = [
  'battery', 'electrical_comp', 'metal', 'microchip', 'rubber', 'spring', 'wires',
];

const SCOUT_MATERIAL_KEYS = [
  'battery', 'copper_coil', 'electrical_comp', 'electrical_trans', 'mechanical_comp',
  'metal', 'microchip', 'military_comp', 'rubber', 'spring', 'wires',
];

export function rollCorpseLoot(type) {
  const slots = Array(CORPSE_SLOT_COUNT).fill(null);
  const materialPool = type === 'scout' ? SCOUT_MATERIAL_KEYS : SPIDER_LOOT_KEYS;
  const ammoSlot = type === 'scout' ? Math.floor(Math.random() * CORPSE_SLOT_COUNT) : -1;

  for (let i = 0; i < CORPSE_SLOT_COUNT; i++) {
    const rolled = rollWeightedLootSlot(materialPool);
    if (!rolled) continue;
    if (type === 'scout' && i === ammoSlot) {
      slots[i] = normalizeAmmoItem({
        kind: 'ammo',
        ammoType: 'rifle',
        amount: 12 + Math.floor(Math.random() * 9),
      });
    } else {
      slots[i] = rolled;
    }
  }
  return slots;
}

export function corpseSpriteName(type) {
  return `${type}_dead`;
}

function makeCorpseObstacle(x, z) {
  const obs = makeBarrelObstacle(x, z);
  obs.halfW *= 1.2;
  obs.halfH *= 1.2;
  return obs;
}

export class CorpseManager {
  constructor(world) {
    this.world = world;
    this.corpses = [];
  }

  spawnFromRobot(robot, time = 0) {
    const corpse = {
      x: robot.x,
      z: robot.z,
      type: robot.type ?? 'spider',
      slots: rollCorpseLoot(robot.type),
      spawnTime: time,
      despawnAt: time + CORPSE_LIFETIME_SEC,
      isCorpse: true,
      smokeAcc: 0,
      sortZ: robot.z + TILE * 0.5,
      obstacle: null,
    };
    corpse.obstacle = makeCorpseObstacle(corpse.x, corpse.z);
    this.world.addDynamicObstacle(corpse.obstacle);
    this.corpses.push(corpse);
    return corpse;
  }

  _removeCorpseAt(i) {
    const c = this.corpses[i];
    if (c?.obstacle) {
      this.world.removeDynamicObstacle(c.obstacle);
      c.obstacle = null;
    }
    this.corpses.splice(i, 1);
  }

  update(dt, time, onSmoke) {
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      if (time >= c.despawnAt || this.isEmpty(c)) {
        this._removeCorpseAt(i);
        continue;
      }
      c.smokeAcc += dt;
      const rate = 0.72;
      while (c.smokeAcc >= rate) {
        c.smokeAcc -= rate;
        onSmoke?.(c.x, c.z);
      }
    }
  }

  getNearby(player, maxDist = CORPSE_INTERACT_DIST) {
    let best = null;
    let bestD = maxDist + player.radius;
    for (const corpse of this.corpses) {
      const d = Math.hypot(player.x - corpse.x, player.z - corpse.z);
      if (d < bestD) {
        bestD = d;
        best = corpse;
      }
    }
    return best;
  }

  isInInteractRange(player, corpse) {
    return Math.hypot(player.x - corpse.x, player.z - corpse.z) <= CORPSE_INTERACT_DIST + player.radius;
  }

  isEmpty(corpse) {
    return corpse.slots.every((s) => s == null);
  }

  remove(corpse) {
    const i = this.corpses.indexOf(corpse);
    if (i >= 0) this._removeCorpseAt(i);
  }

  sortZ(corpse) {
    return corpse.sortZ ?? corpse.z + TILE * 0.5;
  }
}
