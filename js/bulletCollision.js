import { gunAimTransform } from './sprites.js';
import { playerSouthEdgeZ } from './buildingGen.js';
import { TILE } from './worldGen.js';

/** Keep in sync with player.js movement / spawn lift. */
const PLAYER_SPRITE_SCALE = 1.5;
const BULLET_SPAWN_RAISE_PX = 6;

/** Extra south (+Z) offset for south-wall bullet exterior tests. */
export const BULLET_OWNER_FEET_Z_OFF = TILE * 0.14;

/** Feet sample for south-wall bullet collision — slightly below sprite feet. */
export function bulletOwnerFeetZ(px, pz) {
  return playerSouthEdgeZ(px, pz) + BULLET_OWNER_FEET_Z_OFF;
}

/** Drop from bullet path to player foot collision height (world Z, +Z = south). */
export const BULLET_FOOT_Z_OFF = (6 * PLAYER_SPRITE_SCALE) / 8 + BULLET_SPAWN_RAISE_PX / 8;

/** Foot-level bullet tests only on south wall strips (+Z perimeter). */
export function bulletUsesFootLevel(obs) {
  return !!(obs?.floorEdge && obs.edgeDir === 's');
}

/** South walls always test at the foot strip — ignore aim pitch so low lips register. */
export function bulletSouthWallTestZ(bulletZ) {
  return bulletZ + BULLET_FOOT_Z_OFF;
}

/**
 * Wall tests use foot height when aiming horizontally; raised aim (north/south on screen)
 * moves the hit point up so shots over low foot strips still hit when fired into a wall.
 */
export function bulletWallCollisionZ(bulletZ, aimAngle) {
  const aim = gunAimTransform(aimAngle);
  const raiseT = Math.min(1, Math.abs(aim.angle) / (Math.PI * 0.5));
  const footBlend = 1 - raiseT;
  return bulletZ + BULLET_FOOT_Z_OFF * footBlend;
}

/** True when an obstacle center sits behind the shooter along the aim ray. */
export function obstacleBehindAlongAim(obs, shooterX, shooterZ, aimAngle, margin = 0.2) {
  if (obs.doorSeal) return false;
  const sin = Math.sin(aimAngle);
  const cos = Math.cos(aimAngle);
  const ox = (obs.softX ?? obs.x) - shooterX;
  const oz = (obs.softZ ?? obs.z) - shooterZ;
  return ox * sin + oz * cos < -margin;
}
