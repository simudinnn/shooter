/** HUD pickup / status messages (ground loot removed — use chests). */
export class ItemManager {
  constructor(world) {
    this.world = world;
    this.pickupMsg = '';
    this.pickupMsgTimer = 0;
  }

  update(dt) {
    if (this.pickupMsgTimer > 0) {
      this.pickupMsgTimer -= dt;
      if (this.pickupMsgTimer <= 0) this.pickupMsg = '';
    }
  }
}
