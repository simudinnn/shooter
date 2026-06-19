import { getWorldSeed } from './worldGen.js';
export const SAVE_KEY = 'robot-ruins-save-v1';
export const SAVE_VERSION = 1;

export function hasSavedGame() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== SAVE_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, v: SAVE_VERSION, savedAt: Date.now() }));
    return true;
  } catch (err) {
    console.error('Save failed:', err);
    return false;
  }
}

function cloneSlots(slots) {
  return slots.map((s) => (s ? { ...s } : null));
}

/** Snapshot live game state for localStorage. */
export function captureGameState(game) {
  const { player, world, dayNight, buildings, chests, robots } = game;

  const buildingSaves = (buildings?.buildings ?? []).map((b) => ({
    originX: b.originX,
    originZ: b.originZ,
    w: b.w,
    h: b.h,
    cells: [...b.cells],
    doorTx: b.doorTx,
    doorTz: b.doorTz ?? b.h - 1,
    doorOpen: !!b.doorOpen,
    shape: b.shape ?? 'rect',
    style: { ...b.style },
    homeCx: b.homeCx,
    homeCz: b.homeCz,
    chestTile: b.chestTile ? { ...b.chestTile } : null,
    chest: b.chest
      ? {
          x: b.chest.x,
          z: b.chest.z,
          variant: b.chest.variant,
          slots: cloneSlots(b.chest.slots),
          opened: !!b.chest.opened,
        }
      : null,
  }));

  const robotSaves = (robots ?? [])
    .filter((r) => r.alive || r.emerging)
    .map((r) => ({
      type: r.type ?? 'spider',
      x: r.x,
      z: r.z,
      angle: r.angle,
      health: r.health,
      maxHealth: r.maxHealth,
      wave: r.spawnWave ?? 1,
      homeCx: r.homeCx,
      homeCz: r.homeCz,
      alive: !!r.alive,
    }));

  const chunkFlags = [];
  for (const chunk of world?.chunks?.values() ?? []) {
    if (!chunk.spidersSpawned && !chunk.buildingsSpawned && !chunk.chestsSpawned) continue;
    chunkFlags.push({
      cx: chunk.cx,
      cz: chunk.cz,
      spidersSpawned: !!chunk.spidersSpawned,
      buildingsSpawned: !!chunk.buildingsSpawned,
      chestsSpawned: !!chunk.chestsSpawned,
    });
  }

  return {
    v: SAVE_VERSION,
    worldSeed: getWorldSeed(),
    kills: game.kills ?? 0,
    playTimeMs: (game.playTimeBase ?? 0) + (performance.now() - (game.startTime ?? performance.now())),
    dayNight: {
      timeMinutes: dayNight?.timeMinutes ?? 0,
      day: dayNight?.day ?? 1,
    },
    player: {
      x: player.x,
      z: player.z,
      angle: player.angle,
      health: player.health,
      maxHealth: player.maxHealth,
      shield: player.shield ?? 0,
      alive: !!player.alive,
      weaponKey: player.weaponKey,
      weaponSlot: player.weaponSlot,
      meleeKey: player.meleeKey,
      weaponAmmo: player.weapon?.ammo ?? 0,
      itemSlots: cloneSlots(player.itemSlots),
      equipmentSlots: cloneSlots(player.equipmentSlots),
      powerUps: {
        speed: { until: player.powerUps?.speed?.until ?? 0 },
        damage: {
          mult: player.powerUps?.damage?.mult ?? 1.5,
          until: player.powerUps?.damage?.until ?? 0,
        },
      },
    },
    buildings: buildingSaves,
    robots: robotSaves,
    chunkFlags,
  };
}
