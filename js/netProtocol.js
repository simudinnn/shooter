/** Shared multiplayer protocol — dedicated server authoritative. */

export const INPUT_HZ = 20;
export const SNAPSHOT_HZ = 15;
export const SIM_HZ = 20;

export const MSG = {
  WELCOME: 'welcome',
  JOINED: 'player_joined',
  LEFT: 'player_left',
  RENAME: 'player_rename',
  JOIN_ROOM: 'join_room',
  INPUT: 'input',
  SNAPSHOT: 'snapshot',
  EVENTS: 'events',
};

/** Client → server input (sent ~20 Hz). */
export function emptyInput() {
  return {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    angle: 0,
    moving: false,
    shoot: false,
    shootHeld: false,
    interact: false,
    reload: false,
  };
}
