import { gunAimTransform } from './sprites.js';

/** Keep in sync with player.js movement / spawn lift. */
const PLAYER_SPRITE_SCALE = 1.5;
const BULLET_SPAWN_RAISE_PX = 6;

/** Drop from bullet path to player foot collision height (world Z, +Z = south). */
export const BULLET_FOOT_Z_OFF = (6 * PLAYER_SPRITE_SCALE) / 8 + BULLET_SPAWN_RAISE_PX / 8;

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
