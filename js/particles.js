/** Screen-space gravity — pixels per second² (pulls particles toward bottom of screen). */

const FALL_GRAVITY = 240;

const CHAR_NATIVE = 24;

const DEFAULT_FOOT_DROP = CHAR_NATIVE * 1.4 * 0.5;



/** Size is a fraction of half the on-screen player sprite height (applied in main draw). */

export const PARTICLE_SIZE_UNIT = 0.5;

/** Uniform random in [min, max] — per-particle size, speed, and lifetime variance. */
function rng(min, max) {
  return min + Math.random() * (max - min);
}

/** lifeMax + animOffset so flipbook FX advance with particle age. */
function withFxAnim(props) {
  const life = props.life;
  return {
    ...props,
    life,
    lifeMax: life,
    animOffset: rng(0, 0.15),
  };
}



function arcParticle(props) {

  return {

    fall: 0,

    fallVel: 0,

    grounded: false,

    groundDrop: 0,

    drag: 0.97,

    groundFriction: 0.82,

    useScreenFall: true,

    fallGravity: FALL_GRAVITY,

    ...props,

  };

}



/** Step dust at the player's feet — low pop, settles on ground. */

export function createStepDust(feetX, feetZ) {

  const particles = [];

  const count = 2 + Math.floor(Math.random() * 2);

  for (let i = 0; i < count; i++) {

    const a = (Math.random() - 0.5) * Math.PI * 1.6;

    const speed = rng(1.1, 3.2);

    particles.push(arcParticle({

      x: feetX + (Math.random() - 0.5) * 0.35,

      z: feetZ + (Math.random() - 0.5) * 0.35,

      vx: Math.sin(a) * speed,

      vz: Math.cos(a) * speed * rng(0.3, 0.55),

      groundDrop: 0,

      fall: -rng(0.5, 3),

      fallVel: rng(14, 38),

      fallGravity: rng(170, 230),

      life: rng(0.4, 0.95),

      color: i % 2 ? '#6a5a48' : '#8a7860',

      size: rng(0.14, 0.28),

      drag: rng(0.86, 0.94),

      groundFriction: 0.74,

      kind: 'dust',

    }));

  }

  return particles;

}



/** Ejects from the gun sideways, then falls to foot level on screen. */

export function createBulletCasing(gunX, gunZ, aimAngle, flipX, color = 'yellow', count = 1, groundDropPx = 0) {

  const particles = [];

  const eject = aimAngle + (flipX ? -Math.PI / 2 : Math.PI / 2);

  const fill = color === 'red' ? '#c83828' : '#d4b030';

  const rim = color === 'red' ? '#8a2018' : '#a08018';



  for (let i = 0; i < count; i++) {
    const spread = (Math.random() - 0.5) * 0.45;
    const a = eject + spread;
    const speed = rng(1.2, 2.8);
    particles.push(arcParticle({
      x: gunX + (Math.random() - 0.5) * 0.06,
      z: gunZ + (Math.random() - 0.5) * 0.06,
      vx: Math.sin(a) * speed + Math.sin(aimAngle) * rng(0.1, 0.35),
      vz: Math.cos(a) * speed + Math.cos(aimAngle) * rng(0.1, 0.35),
      fall: -rng(2, 6),
      fallVel: 0,
      fallGravity: rng(280, 360),
      groundDrop: groundDropPx,
      bouncesLeft: 1,
      bounceDamp: rng(0.18, 0.32),
      bounceMinVel: rng(38, 52),
      life: rng(1.6, 3.2),
      color: Math.random() > 0.45 ? fill : rim,
      size: rng(0.1, 0.22),
      drag: rng(0.88, 0.94),
      groundFriction: 0.72,
      kind: 'casing',
      casingSprite: color === 'red' ? 'casing_red' : 'casing',
      spin: Math.random() * Math.PI * 2,
      spinVel: rng(-8, 8),
    }));
  }

  return particles;

}



/** Blood pops outward and splats flat at foot level (player hits). */

export function createBloodSplatter(x, z, fromX, fromZ, damage, groundDropPx = DEFAULT_FOOT_DROP) {

  const particles = [];

  const count = Math.min(8, 2 + Math.floor(damage / 10));

  const dx = x - fromX;

  const dz = z - fromZ;

  const hitLen = Math.hypot(dx, dz) || 1;

  const fwdX = dx / hitLen;

  const fwdZ = dz / hitLen;

  const base = Math.atan2(fwdX, fwdZ);

  const forwardBoost = 1.4 + damage * 0.06;



  for (let i = 0; i < count; i++) {

    const spread = (Math.random() - 0.5) * 2.8;

    const a = base + spread;

    const speed = rng(2, 4.2 + damage * 0.12) * rng(0.75, 1.25);

    const dark = i % 5 === 0;

    particles.push(arcParticle({

      x: x + fwdX * 0.2 + (Math.random() - 0.5) * 0.35,

      z: z + fwdZ * 0.2 + (Math.random() - 0.5) * 0.35,

      vx: Math.sin(a) * speed + fwdX * forwardBoost * rng(0.8, 1.15),

      vz: Math.cos(a) * speed + fwdZ * forwardBoost * rng(0.8, 1.15),

      fall: -rng(6, 18),

      fallVel: 0,

      fallGravity: rng(240, 320),

      groundDrop: groundDropPx,

      life: rng(0.85, 1.8),

      color: dark ? '#6a1018' : (i % 3 === 1 ? '#a82020' : '#c82828'),

      size: rng(0.05, 0.14),

      drag: rng(0.9, 0.97),

      groundFriction: 0.68,

      kind: 'blood',

    }));

  }



  for (let i = 0; i < Math.floor(count * 0.25); i++) {

    const spread = (Math.random() - 0.5) * 2.2;

    const a = base + spread;

    const speed = rng(1.4, 3.6) * rng(0.7, 1.3);

    particles.push(arcParticle({

      x: x + fwdX * 0.28 + (Math.random() - 0.5) * 0.5,

      z: z + fwdZ * 0.28 + (Math.random() - 0.5) * 0.5,

      vx: Math.sin(a) * speed + fwdX * (forwardBoost * rng(0.6, 0.9)),

      vz: Math.cos(a) * speed + fwdZ * (forwardBoost * rng(0.6, 0.9)),

      fall: -rng(5, 14),

      fallVel: 0,

      fallGravity: rng(240, 320),

      groundDrop: groundDropPx,

      life: rng(1, 1.9),

      color: i % 2 ? '#7a1818' : '#9a2020',

      size: rng(0.04, 0.11),

      drag: rng(0.91, 0.98),

      groundFriction: 0.64,

      kind: 'blood',

    }));

  }



  return particles;

}



/** Metal scrape + electric sparks when a robot takes damage. */

export function createRobotHitSparks(x, z, fromX, fromZ, damage) {

  const particles = [];

  const count = Math.min(7, 1 + Math.floor(damage / 7));

  const dx = x - fromX;

  const dz = z - fromZ;

  const hitLen = Math.hypot(dx, dz) || 1;

  const fwdX = dx / hitLen;

  const fwdZ = dz / hitLen;

  const base = Math.atan2(fwdX, fwdZ);

  const sparkColors = ['#ffe880', '#ffffff', '#68d8ff', '#fff4a0', '#b8c8d8'];



  for (let i = 0; i < count; i++) {

    const spread = (Math.random() - 0.5) * 4.4;

    const a = base + spread;

    const speed = rng(3.5, 6.5 + damage * 0.14) * rng(0.65, 1.35);

    const side = (Math.random() - 0.5) * rng(2.2, 4.2);

    particles.push(withFxAnim({

      x: x + fwdX * 0.12 + (Math.random() - 0.5) * 0.55,

      z: z + fwdZ * 0.12 + (Math.random() - 0.5) * 0.55,

      vx: Math.sin(a) * speed + fwdX * rng(0.7, 1.4) + Math.cos(base) * side,

      vz: Math.cos(a) * speed + fwdZ * rng(0.7, 1.4) - Math.sin(base) * side,

      life: rng(0.18, 0.55),

      color: sparkColors[i % sparkColors.length],

      size: rng(0.06, 0.15),

      drag: rng(0.82, 0.92),

      screenRise: 0,

      screenRiseVel: -rng(28, 72),

      screenRiseDrag: rng(0.88, 0.95),

      sprite: 'particle_spark',

      kind: 'spark',

    }));

  }



  const scrapeCount = Math.max(1, Math.floor(count * rng(0.2, 0.35)));

  for (let i = 0; i < scrapeCount; i++) {

    const spread = (Math.random() - 0.5) * 2.2;

    const a = base + spread;

    const speed = rng(2, 4.5) * rng(0.7, 1.35);

    particles.push(arcParticle({

      x: x + fwdX * 0.1 + (Math.random() - 0.5) * 0.35,

      z: z + fwdZ * 0.1 + (Math.random() - 0.5) * 0.35,

      vx: Math.sin(a) * speed + fwdX * rng(0.8, 1.5),

      vz: Math.cos(a) * speed + fwdZ * rng(0.8, 1.5),

      fall: -rng(5, 14),

      fallVel: -rng(12, 38),

      fallGravity: rng(150, 210),

      groundDrop: 0,

      life: rng(0.28, 0.62),

      color: i % 2 ? '#9098a8' : '#606870',

      size: rng(0.08, 0.18),

      drag: rng(0.86, 0.94),

      groundFriction: rng(0.68, 0.8),

      screenRise: 0,

      screenRiseVel: -rng(16, 42),

      screenRiseDrag: rng(0.9, 0.97),

      kind: 'scrape',

    }));

  }



  return particles;

}



/** Damaged robot — gray smoke puffs (health 50% or less). */

export function createRobotSmoke(x, z, spread = 1.05) {

  const particles = [];

  const count = 1;

  const colors = ['#606870', '#787880', '#505860', '#8a9098'];



  for (let i = 0; i < count; i++) {

    const a = Math.random() * Math.PI * 2;

    const r = Math.sqrt(Math.random()) * spread;

    particles.push(withFxAnim({

      x: x + Math.sin(a) * r,

      z: z + Math.cos(a) * r,

      vx: rng(-0.55, 0.55),

      vz: rng(-0.55, 0.55),

      life: rng(1.1, 2.9),

      color: colors[i % colors.length],

      size: rng(0.12, 0.28),

      drag: rng(0.93, 0.98),

      screenRise: rng(-8, 8),

      screenRiseVel: -rng(6, 18),

      sprite: 'particle_smoke',

      kind: 'smoke',

    }));

  }

  return particles;

}



/** Critical robot — fire + embers (health 25% or less). */

export function createRobotFire(x, z, spread = 0.95) {

  const particles = [];

  const fireColors = ['#ff6020', '#ff9040', '#ffc030', '#ff3018', '#ff7840'];

  const count = 1;



  for (let i = 0; i < count; i++) {

    const a = Math.random() * Math.PI * 2;

    const r = Math.sqrt(Math.random()) * spread;

    particles.push(withFxAnim({

      x: x + Math.sin(a) * r,

      z: z + Math.cos(a) * r,

      vx: rng(-0.75, 0.75),

      vz: rng(-0.75, 0.75),

      life: rng(0.3, 0.85),

      color: fireColors[i % fireColors.length],

      size: rng(0.1, 0.22),

      drag: rng(0.9, 0.97),

      screenRise: rng(-7, 7),

      screenRiseVel: -rng(10, 24),

      sprite: 'particle_fire',

      kind: 'fire',

    }));

  }



  return particles;

}



/** Burst of smoke + flame when a robot is destroyed. */
export function createRobotDeathFx(x, z, spread = 1.2) {
  const particles = [];
  const smokeColors = ['#404850', '#585860', '#383c44', '#6a7078', '#505860'];
  const smokeCount = 7 + Math.floor(Math.random() * 4);
  for (let i = 0; i < smokeCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spread * 1.15;
    particles.push(withFxAnim({
      x: x + Math.sin(a) * r,
      z: z + Math.cos(a) * r,
      vx: rng(-1.3, 1.3),
      vz: rng(-1.3, 1.3),
      life: rng(1.5, 3.4),
      color: smokeColors[i % smokeColors.length],
      size: rng(0.2, 0.42),
      drag: rng(0.9, 0.97),
      screenRise: rng(-12, 12),
      screenRiseVel: -rng(16, 36),
      sprite: 'particle_smoke',
      kind: 'smoke',
    }));
  }
  const fireColors = ['#ff5020', '#ff9038', '#ffc040', '#ff2818', '#ff6830'];
  const fireCount = 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < fireCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spread;
    particles.push(withFxAnim({
      x: x + Math.sin(a) * r,
      z: z + Math.cos(a) * r,
      vx: rng(-1.5, 1.5),
      vz: rng(-1.5, 1.5),
      life: rng(0.4, 1.15),
      color: fireColors[i % fireColors.length],
      size: rng(0.14, 0.3),
      drag: rng(0.88, 0.96),
      screenRise: rng(-10, 10),
      screenRiseVel: -rng(22, 48),
      sprite: 'particle_fire',
      kind: 'fire',
    }));
  }
  return particles;
}

export function updateParticles(particles, dt, world = null, callbacks = null) {

  for (let i = particles.length - 1; i >= 0; i--) {

    const p = particles[i];

    p.life -= dt;

    if (p.life <= 0) { particles.splice(i, 1); continue; }



    if (p.useScreenFall) {

      p.fall = p.fall ?? 0;

      if (!p.grounded) {

        p.fallVel = (p.fallVel ?? 0) + (p.fallGravity ?? FALL_GRAVITY) * dt;

        p.fall += p.fallVel * dt;

        const ground = p.groundDrop ?? 0;

        if (p.fall >= ground) {

          const minVel = p.bounceMinVel ?? 50;

          if ((p.bouncesLeft ?? 0) > 0 && p.fallVel >= minVel) {

            p.fall = ground;

            p.fallVel = -p.fallVel * (p.bounceDamp ?? 0.32);

            p.bouncesLeft -= 1;

          } else {

            p.fall = ground;

            p.fallVel = 0;

            p.grounded = true;

            if (p.kind === 'casing') {
              p.spinVel = 0;
              p.vx = 0;
              p.vz = 0;
              if (!p._landSnd) {
                p._landSnd = true;
                callbacks?.onCasingLand?.();
              }
            }

            if (p.kind === 'blood') {

              const s = p.size || 0.2;

              p.splatW = s * (0.55 + Math.random() * 0.35);

              p.splatH = s * (0.38 + Math.random() * 0.14);

            }

            if (p.kind === 'scrape') {

              const s = p.size || 0.08;

              p.splatW = s * (0.35 + Math.random() * 0.2);

              p.splatH = s * (0.22 + Math.random() * 0.1);

            }

          }

        }

      }

      if (!p.grounded && p.spinVel) p.spin = (p.spin || 0) + p.spinVel * dt;

    } else if (p.liftVel !== undefined) {

      p.lift = (p.lift || 0) + p.liftVel * dt;

      p.liftVel -= 18 * dt;

      if (p.liftVel < 0) p.liftVel = 0;

    } else if (p.lift) {

      p.lift = Math.max(0, p.lift - dt * 2.5);

    }



    if (p.screenRiseVel != null) {

      p.screenRise = (p.screenRise || 0) + p.screenRiseVel * dt;

      if (p.screenRiseDrag) p.screenRiseVel *= p.screenRiseDrag;

    }



    const nx = p.x + p.vx * dt;

    const nz = p.z + p.vz * dt;

    if (world?.checkCollision(nx, nz, 0.06)) {

      p.vx *= -0.2;

      p.vz *= -0.2;

    } else {

      p.x = nx;

      p.z = nz;

    }



    const drag = p.grounded ? (p.groundFriction ?? 0.8) : (p.drag ?? 0.92);

    p.vx *= drag;

    p.vz *= drag;

  }

}


