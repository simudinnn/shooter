export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = 150;
    this.canvas.width = this.size;
    this.canvas.height = this.size;
  }

  worldToMap(x, z, world) {
    const halfW = world.halfW;
    const halfH = world.halfH;
    return {
      x: ((x + halfW) / (halfW * 2)) * this.size,
      y: ((z + halfH) / (halfH * 2)) * this.size,
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

  render(player, robots, world) {
    const ctx = this.ctx;
    const s = this.size;
    const halfW = world.halfW;
    const halfH = world.halfH;
    const scale = s / (halfW * 2);

    ctx.fillStyle = 'rgba(10, 14, 18, 0.85)';
    ctx.fillRect(0, 0, s, s);

    if (world.usesImageMap()) {
      world.imageMap.drawMinimap(ctx, s);
    } else {
      const cx = s / 2;
      const cy = s / 2;
      const roadW = (8 / (halfW * 2)) * s;
      ctx.fillStyle = 'rgba(42, 42, 48, 0.8)';
      ctx.fillRect(cx - roadW / 2, 0, roadW, s);
      ctx.fillRect(0, cy - roadW / 2, s, roadW);
    }

    ctx.strokeStyle = 'rgba(240, 160, 48, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, s - 1, s - 1);

    if (!world.usesImageMap()) {
      for (const obs of world.obstacles) {
        const p = this.worldToMap(obs.x, obs.z, world);
        if (obs.kind === 'box') {
          const rw = Math.max(2, obs.halfW * 2 * scale);
          const rh = Math.max(2, obs.halfD * 2 * scale);
          ctx.fillStyle = obs.halfW > 2 ? 'rgba(74, 64, 56, 0.85)' : 'rgba(74, 48, 32, 0.8)';
          ctx.fillRect(p.x - rw / 2, p.y - rh / 2, rw, rh);
        } else {
          const r = Math.max(2, (obs.radius || 1) * scale);
          ctx.fillStyle = 'rgba(74, 48, 32, 0.8)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      for (const obs of world.obstacles) {
        if (obs.kind !== 'circle') continue;
        const p = this.worldToMap(obs.x, obs.z, world);
        const r = Math.max(2, (obs.radius || 1) * scale);
        ctx.fillStyle = 'rgba(138, 80, 48, 0.9)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const robot of robots) {
      if (!robot.alive) continue;
      const p = this.worldToMap(robot.x, robot.z, world);
      const hit = robot.knockVX * robot.knockVX + robot.knockVZ * robot.knockVZ > 4;
      const critical = robot.healthRatio <= 0.25;
      const damaged = robot.healthRatio <= 0.5;
      ctx.fillStyle = critical ? '#ff6020' : (damaged ? '#c87830' : (hit ? '#68a8d8' : '#8090a0'));
      ctx.beginPath();
      ctx.arc(p.x, p.y, hit ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }

    const pp = this.worldToMap(player.x, player.z, world);
    this._drawPlayerMarker(ctx, pp, player.angle);

    ctx.fillStyle = 'rgb(255, 230, 0)';
    ctx.font = '9px Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('MAP', 6, 12);
  }
}
