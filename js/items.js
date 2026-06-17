/** HUD pickup / status messages (ground loot removed — use chests). */
export class ItemManager {
  constructor(world) {
    this.world = world;
    this.pickupMsg = '';
    this.pickupMsgError = false;
    this.pickupMsgTimer = 0;
  }

  setPickupMsg(text, { error = false, duration = 2 } = {}) {
    this.pickupMsg = text;
    this.pickupMsgError = error;
    this.pickupMsgTimer = duration;
  }

  update(dt) {
    if (this.pickupMsgTimer > 0) {
      this.pickupMsgTimer -= dt;
      if (this.pickupMsgTimer <= 0) {
        this.pickupMsg = '';
        this.pickupMsgError = false;
      }
    }
  }
}
