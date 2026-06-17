import { TILE, BASE_RADIUS, getTerrainMapColorFromTile } from './worldGen.js';

/** Square viewport radius — fills minimap corners when zoomed in. */
export const MINIMAP_RADIUS = 40;

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = 150;
    this.canvas.width = this.size;
    this.canvas.height = this.size;
  }

  worldToMap(x, z, player) {
    const scale = this.size / (MINIMAP_RADIUS * 2);
    const refX = Math.round(player.x * scale) / scale;
    const refZ = Math.round(player.z * scale) / scale;
    return {
      x: Math.round((x - refX) * scale + this.size / 2),
      y: Math.round((z - refZ) * scale + this.size / 2),
    };
  }

  _drawPlayerMarker(ctx, pp, angle) {
    const len = 7;
    const tipX = pp.x + Math.sin(angle) * len;
    const tipY = pp.y + Math.cos(angle) * len;
    const backAngle = angle + Math.PI;
    const wing = 4.5;

    const lx = pp.x + Math.sin(backAngle + 0.55) * wing;
    const ly = pp.y + Math.cos(backAngle + 0.55) * wing;
    const rx = pp.x + Math.sin(backAngle - 0.55) * wing;
    const ry = pp.y + Math.cos(backAngle - 0.55) * wing;

    ctx.fillStyle = '#40d080';
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(lx, ly);
    ctx.lineTo(rx, ry);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  render(player, robots, world, chests) {
    const ctx = this.ctx;
    const s = this.size;
    const scale = s / (MINIMAP_RADIUS * 2);
    const tilePx = Math.max(1, TILE * scale);

    ctx.fillStyle = 'rgba(10, 14, 18, 0.85)';
    ctx.fillRect(0, 0, s, s);

    const minTX = Math.floor((player.x - MINIMAP_RADIUS) / TILE);
    const maxTX = Math.ceil((player.x + MINIMAP_RADIUS) / TILE);
    const minTZ = Math.floor((player.z - MINIMAP_RADIUS) / TILE);
    const maxTZ = Math.ceil((player.z + MINIMAP_RADIUS) / TILE);

    for (let tz = minTZ; tz <= maxTZ; tz++) {
      for (let tx = minTX; tx <= maxTX; tx++) {
        const wx = tx * TILE + TILE * 0.5;
        const wz = tz * TILE + TILE * 0.5;
        if (Math.abs(wx - player.x) > MINIMAP_RADIUS || Math.abs(wz - player.z) > MINIMAP_RADIUS) continue;
        const tile = world.getTile(tx, tz);
        if (!tile) continue;
        const p = this.worldToMap(tx * TILE, tz * TILE, player);
        ctx.fillStyle = getTerrainMapColorFromTile(tile, wx, wz);
        ctx.fillRect(p.x, p.y, Math.ceil(tilePx), Math.ceil(tilePx));
      }
    }

    const baseP = this.worldToMap(0, 0, player);
    const baseR = BASE_RADIUS * scale;
    if (baseR > 2 && baseP.x + baseR > 0 && baseP.x - baseR < s && baseP.y + baseR > 0 && baseP.y - baseR < s) {
      ctx.strokeStyle = 'rgba(100, 180, 255, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(baseP.x, baseP.y, baseR, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const chest of chests?.chests ?? []) {
      const p = this.worldToMap(chest.x, chest.z, player);
      if (p.x < 0 || p.x > s || p.y < 0 || p.y > s) continue;
      ctx.fillStyle = '#c87830';
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }

    for (const robot of robots) {
      if (!robot.alive) continue;
      const p = this.worldToMap(robot.x, robot.z, player);
      if (p.x < 0 || p.x > s || p.y < 0 || p.y > s) continue;
      const hit = robot.knockVX * robot.knockVX + robot.knockVZ * robot.knockVZ > 4;
      const critical = robot.healthRatio <= 0.25;
      const damaged = robot.healthRatio <= 0.5;
      ctx.fillStyle = critical ? '#ff6020' : (damaged ? '#c87830' : (hit ? '#68a8d8' : '#8090a0'));
      ctx.beginPath();
      ctx.arc(p.x, p.y, hit ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }

    const pp = this.worldToMap(player.x, player.z, player);
    this._drawPlayerMarker(ctx, pp, player.angle);

    ctx.strokeStyle = 'rgba(240, 160, 48, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, s - 1, s - 1);

    ctx.fillStyle = 'rgb(255, 230, 0)';
    ctx.font = '9px Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('MAP', 6, 12);
  }
}
