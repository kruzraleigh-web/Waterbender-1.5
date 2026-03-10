/*
  Waterbender Side-Scroller
  ------------------------------------------------
  This is a beginner-friendly game built with only:
  - HTML5 canvas
  - CSS
  - plain JavaScript

  The code is heavily commented to explain how a basic 2D action game works.
*/

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// HUD elements
const playerHealthFill = document.getElementById('playerHealthFill');
const waterFill = document.getElementById('waterFill');
const waveLabel = document.getElementById('waveLabel');
const levelLabel = document.getElementById('levelLabel');
const scoreLabel = document.getElementById('scoreLabel');
const restartBtn = document.getElementById('restartBtn');
const levelUpPanel = document.getElementById('levelUpPanel');
const upgradeButtons = document.getElementById('upgradeButtons');
const gameOverPanel = document.getElementById('gameOverPanel');
const gameOverSummary = document.getElementById('gameOverSummary');
const playAgainBtn = document.getElementById('playAgainBtn');

const WORLD = {
  width: 3800,
  height: canvas.height,
  gravity: 0.6,
  floorY: canvas.height - 70,
};

const keys = {};
const camera = { x: 0 };
let mouse = { x: 0, y: 0, down: false, worldX: 0, worldY: 0 };

const state = {
  running: true,
  pausedForLevelUp: false,
  wave: 1,
  level: 1,
  score: 0,
  dragStart: null,
  lastTime: 0,
};

// Basic player object
const player = {
  x: 130,
  y: WORLD.floorY - 80,
  w: 38,
  h: 80,
  vx: 0,
  vy: 0,
  speed: 4,
  jumpStrength: 13,
  facing: 1,
  health: 100,
  maxHealth: 100,
  attackCooldown: 0,
  iFrames: 0,
  onGround: false,
  comboStep: 0,
  comboTimer: 0,
  abilities: {
    waterWhip: true,
    waterWave: true,
    iceShard: true,
    projectileShield: false,
    strongerWave: false,
    fasterRegen: false,
  },
};

const orb = {
  x: player.x + 42,
  y: player.y + 25,
  vx: 0,
  vy: 0,
  radius: 18,
  maxRadius: 22,
  minRadius: 8,
  dragging: false,
  isIce: false,
  launchTimer: 0,
  damageScale: 1,
  regenCooldown: 0,
};

const arrays = {
  enemies: [],
  structures: [],
  particles: [],
  projectiles: [],
  waves: [],
  hearts: [],
  waterSources: [],
};

const upgrades = [
  { id: 'speed', label: 'Flow Step (+move speed)', apply: () => (player.speed += 0.55) },
  { id: 'jump', label: 'Tidal Leap (+jump)', apply: () => (player.jumpStrength += 0.9) },
  { id: 'health', label: 'Water Healing (+max health)', apply: () => { player.maxHealth += 16; player.health = Math.min(player.maxHealth, player.health + 16); } },
  { id: 'orb', label: 'Orb Mastery (+orb size)', apply: () => (orb.maxRadius += 2) },
  { id: 'shield', label: 'Unlock Water Shield', apply: () => (player.abilities.projectileShield = true) },
  { id: 'wave', label: 'Stronger Water Wave', apply: () => (player.abilities.strongerWave = true) },
  { id: 'regen', label: 'Faster Water Regen', apply: () => (player.abilities.fasterRegen = true) },
];

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function spawnWave() {
  arrays.enemies.length = 0;
  arrays.structures.length = 0;
  arrays.hearts.length = 0;
  arrays.waterSources.length = 0;

  // Less frequent, low-height structures (jump-over friendly)
  const structureCount = Math.min(2 + Math.floor(state.wave / 2), 7);
  for (let i = 0; i < structureCount; i++) {
    arrays.structures.push({
      x: random(520, WORLD.width - 180),
      y: WORLD.floorY - random(45, 95),
      w: random(60, 150),
      h: random(35, 85),
      type: Math.random() < 0.5 ? 'box' : 'iceWall',
    });
  }

  // Water sources that refill orb
  const sources = 4;
  for (let i = 0; i < sources; i++) {
    arrays.waterSources.push({
      x: random(200, WORLD.width - 130),
      y: WORLD.floorY - 10,
      r: 20,
      pulse: random(0, Math.PI * 2),
    });
  }

  const enemyCount = Math.min(2 + state.wave, 10);
  for (let i = 0; i < enemyCount; i++) {
    let x;
    let safe = false;
    // Enemies should not spawn close to player or obstacles
    for (let tries = 0; tries < 40 && !safe; tries++) {
      x = random(650, WORLD.width - 70);
      safe = Math.abs(x - player.x) > 260;
      for (const s of arrays.structures) {
        if (x > s.x - 80 && x < s.x + s.w + 80) safe = false;
      }
    }

    const size = random(34, 52);
    arrays.enemies.push({
      x,
      y: WORLD.floorY - size,
      w: size * 0.7,
      h: size,
      vx: 0,
      vy: 0,
      speed: random(1.3, 2.7) + state.wave * 0.05,
      hp: 26 + state.wave * 5,
      maxHp: 26 + state.wave * 5,
      behavior: ['patrol', 'jumper', 'evasive'][Math.floor(Math.random() * 3)],
      patrolDir: Math.random() < 0.5 ? -1 : 1,
      jumpCooldown: random(50, 150),
      attackCooldown: 0,
      frozen: 0,
    });
  }

  // Boss dragon every 10 waves
  if (state.wave % 10 === 0) {
    arrays.enemies.push({
      boss: true,
      x: WORLD.width - 480,
      y: 170,
      w: 230,
      h: 130,
      vx: -1.1,
      vy: 0,
      hp: 340 + state.wave * 22,
      maxHp: 340 + state.wave * 22,
      fireCooldown: 90,
      weakPoints: [
        { ox: 60, oy: 40, r: 16, hp: 55 },
        { ox: 130, oy: 70, r: 18, hp: 55 },
        { ox: 190, oy: 52, r: 14, hp: 55 },
      ],
    });
  }
}

function levelUp() {
  state.pausedForLevelUp = true;
  levelUpPanel.classList.remove('hidden');
  upgradeButtons.innerHTML = '';

  const picks = [...upgrades].sort(() => Math.random() - 0.5).slice(0, 3);
  for (const pick of picks) {
    const button = document.createElement('button');
    button.textContent = pick.label;
    button.onclick = () => {
      pick.apply();
      state.level += 1;
      state.pausedForLevelUp = false;
      levelUpPanel.classList.add('hidden');
      spawnWave();
    };
    upgradeButtons.appendChild(button);
  }
}

function resetGame() {
  state.running = true;
  state.pausedForLevelUp = false;
  state.wave = 1;
  state.level = 1;
  state.score = 0;
  player.x = 130;
  player.y = WORLD.floorY - player.h;
  player.vx = player.vy = 0;
  player.health = player.maxHealth = 100;
  player.speed = 4;
  player.jumpStrength = 13;
  Object.assign(player.abilities, {
    waterWhip: true,
    waterWave: true,
    iceShard: true,
    projectileShield: false,
    strongerWave: false,
    fasterRegen: false,
  });
  orb.radius = 18;
  orb.x = player.x + 42;
  orb.y = player.y + 25;
  orb.vx = orb.vy = 0;
  orb.dragging = false;
  gameOverPanel.classList.add('hidden');
  levelUpPanel.classList.add('hidden');
  spawnWave();
}

function emitParticles(x, y, count, color, spread = 2.7) {
  for (let i = 0; i < count; i++) {
    arrays.particles.push({
      x,
      y,
      vx: random(-spread, spread),
      vy: random(-spread, spread),
      life: random(14, 28),
      color,
      size: random(2, 5),
    });
  }
}

function performWaterWave() {
  if (!player.abilities.waterWave || player.attackCooldown > 0) return;
  player.attackCooldown = 40;

  // Spawn a visible wave sprite that travels in the direction the player faces.
  arrays.waves.push({
    x: player.x + player.w / 2 + player.facing * 24,
    y: player.y + player.h * 0.65,
    w: player.abilities.strongerWave ? 96 : 82,
    h: player.abilities.strongerWave ? 48 : 40,
    vx: player.facing * (player.abilities.strongerWave ? 11 : 9),
    life: 34,
    damage: player.abilities.strongerWave ? 16 : 10,
    push: player.abilities.strongerWave ? 8 : 6,
    hitSet: new Set(),
  });

  emitParticles(player.x + player.w / 2 + player.facing * 16, player.y + player.h * 0.65, 16, '#5bd9ff');
}

function updateWaves() {
  for (const wave of arrays.waves) {
    wave.x += wave.vx;
    wave.life--;

    // Hit enemies once per wave object to avoid stunlocking.
    for (const e of arrays.enemies) {
      if (wave.hitSet.has(e)) continue;

      if (e.boss) {
        const bossHitbox = { x: e.x, y: e.y, w: e.w, h: e.h };
        const waveHitbox = { x: wave.x - wave.w / 2, y: wave.y - wave.h / 2, w: wave.w, h: wave.h };
        if (rectsOverlap(waveHitbox, bossHitbox)) {
          e.hp -= wave.damage * 0.5;
          e.vx += Math.sign(wave.vx) * 0.5;
          wave.hitSet.add(e);
          emitParticles(wave.x, wave.y, 8, '#8ad8ff');
        }
        continue;
      }

      const waveHitbox = { x: wave.x - wave.w / 2, y: wave.y - wave.h / 2, w: wave.w, h: wave.h };
      if (rectsOverlap(waveHitbox, e)) {
        e.hp -= wave.damage;
        e.vx += Math.sign(wave.vx) * wave.push;
        e.vy -= 3;
        wave.hitSet.add(e);
        emitParticles(e.x + e.w / 2, e.y + e.h / 2, 12, '#67ceff');
      }
    }

    // Waves lose energy when colliding with structures.
    for (const s of arrays.structures) {
      const waveHitbox = { x: wave.x - wave.w / 2, y: wave.y - wave.h / 2, w: wave.w, h: wave.h };
      if (rectsOverlap(waveHitbox, s)) {
        wave.vx *= -0.35;
        wave.life -= 6;
      }
    }
  }

  arrays.waves = arrays.waves.filter((wave) => wave.life > 0 && wave.x > -120 && wave.x < WORLD.width + 120);
}

function punchKickAttack() {
  if (player.attackCooldown > 0 || mouse.down) return;
  player.attackCooldown = 22;
  player.comboStep = (player.comboStep + 1) % 3;
  player.comboTimer = 15;
  const reach = 46;
  const hitbox = {
    x: player.facing > 0 ? player.x + player.w : player.x - reach,
    y: player.y + 14,
    w: reach,
    h: player.h - 20,
  };
  for (const e of arrays.enemies) {
    if (!e.boss && rectsOverlap(hitbox, e)) {
      e.hp -= 8 + player.comboStep * 2;
      e.vx += player.facing * 4;
      emitParticles(e.x + e.w / 2, e.y + e.h / 2, 8, '#cdefff');
    }
  }
}

function updatePlayer() {
  player.vx *= 0.82;
  if (keys.KeyA) { player.vx -= 0.85; player.facing = -1; }
  if (keys.KeyD) { player.vx += 0.85; player.facing = 1; }
  player.vx = clamp(player.vx, -player.speed, player.speed);

  player.vy += WORLD.gravity;

  // Jump works even while dragging
  if (keys.Space && player.onGround) {
    player.vy = -player.jumpStrength;
    player.onGround = false;
  }

  player.x += player.vx;
  player.y += player.vy;

  // World bounds
  player.x = clamp(player.x, 0, WORLD.width - player.w);
  if (player.y + player.h >= WORLD.floorY) {
    player.y = WORLD.floorY - player.h;
    player.vy = 0;
    player.onGround = true;
  }

  // Stand on structures
  for (const s of arrays.structures) {
    if (player.x + player.w > s.x && player.x < s.x + s.w) {
      const feetNow = player.y + player.h;
      const feetPrev = feetNow - player.vy;
      if (feetPrev <= s.y && feetNow >= s.y) {
        player.y = s.y - player.h;
        player.vy = 0;
        player.onGround = true;
      }
    }
  }

  if (player.attackCooldown > 0) player.attackCooldown--;
  if (player.comboTimer > 0) player.comboTimer--;
  if (player.iFrames > 0) player.iFrames--;

  // Auto health regen from level-up perk, and hearts in map
  if (player.abilities.fasterRegen && Math.random() < 0.01) {
    player.health = Math.min(player.maxHealth, player.health + 0.2);
  }
}

function updateOrb() {
  const anchorX = player.x + player.w / 2 + player.facing * 42;
  const anchorY = player.y + 26;

  if (mouse.down) {
    orb.dragging = true;
    const dx = mouse.worldX - anchorX;
    const dy = mouse.worldY - anchorY;

    // Orb cannot move super far from player
    const maxDist = 170;
    const len = Math.hypot(dx, dy) || 1;
    const factor = Math.min(1, maxDist / len);

    const targetX = anchorX + dx * factor;
    const targetY = anchorY + dy * factor;

    const prevX = orb.x;
    const prevY = orb.y;

    // Smooth follow so water feels fluid
    orb.x += (targetX - orb.x) * 0.35;
    orb.y += (targetY - orb.y) * 0.35;

    orb.vx = orb.x - prevX;
    orb.vy = orb.y - prevY;

    // Shift makes ice mode while dragging
    orb.isIce = !!keys.ShiftLeft || !!keys.ShiftRight;

    // Water whip damage depends on speed, not hold time
    const speed = Math.hypot(orb.vx, orb.vy);
    if (speed > 3.8) {
      for (const e of arrays.enemies) {
        if (e.boss) continue;
        const cx = e.x + e.w / 2;
        const cy = e.y + e.h / 2;
        if (Math.hypot(cx - orb.x, cy - orb.y) < orb.radius + e.w * 0.65) {
          const dmg = speed * (orb.isIce ? 1.6 : 1.1);
          e.hp -= dmg;
          if (orb.isIce && speed > 7.5) e.frozen = 60;
          orb.radius = Math.max(orb.minRadius, orb.radius - 0.03);
          emitParticles(orb.x, orb.y, 4, orb.isIce ? '#dff5ff' : '#67ceff', 1.4);
        }
      }
    }
  } else {
    // On release: orb launches in last drag direction
    if (orb.dragging) {
      orb.dragging = false;
      orb.launchTimer = 36;
      if (state.dragStart) {
        const lx = mouse.worldX - state.dragStart.x;
        const ly = mouse.worldY - state.dragStart.y;
        const l = Math.hypot(lx, ly) || 1;
        const launchStrength = clamp(l / 20, 4, 13);
        orb.vx = (lx / l) * launchStrength;
        orb.vy = (ly / l) * launchStrength;
      }
      if (orb.isIce && Math.hypot(orb.vx, orb.vy) > 8.5) {
        // High speed ice becomes ice shard (triangle feel in rendering)
        orb.damageScale = 1.8;
      } else {
        orb.damageScale = 1;
      }
    }

    if (orb.launchTimer > 0) {
      orb.launchTimer--;
      orb.x += orb.vx;
      orb.y += orb.vy;
      orb.vy += 0.25; // orb interacts with floor (falls)

      // Bounce off floor lightly
      if (orb.y + orb.radius > WORLD.floorY) {
        orb.y = WORLD.floorY - orb.radius;
        orb.vy *= -0.45;
        orb.vx *= 0.82;
      }

      // Hit enemies while launched
      for (const e of arrays.enemies) {
        if (e.boss) {
          for (const wp of e.weakPoints || []) {
            const p = { x: e.x + wp.ox, y: e.y + wp.oy };
            if (wp.hp > 0 && Math.hypot(orb.x - p.x, orb.y - p.y) < wp.r + orb.radius) {
              wp.hp -= 12 * orb.damageScale;
              emitParticles(p.x, p.y, 10, '#a5e8ff');
            }
          }
          continue;
        }
        const cx = e.x + e.w / 2;
        const cy = e.y + e.h / 2;
        if (Math.hypot(cx - orb.x, cy - orb.y) < orb.radius + e.w * 0.5) {
          const speed = Math.hypot(orb.vx, orb.vy);
          e.hp -= speed * 1.6 * orb.damageScale;
          e.vx += orb.vx * 0.35;
          e.vy -= 2;
          if (orb.isIce) e.frozen = 90;
          orb.radius = Math.max(orb.minRadius, orb.radius - 0.08);
          emitParticles(cx, cy, 12, orb.isIce ? '#f2faff' : '#6ed8ff');
        }
      }
    } else {
      // Default state: levitate near player (no visible line)
      orb.isIce = false;
      orb.damageScale = 1;
      orb.vx *= 0.7;
      orb.vy *= 0.7;
      orb.x += (anchorX - orb.x) * 0.2;
      orb.y += (anchorY - orb.y) * 0.2;
    }
  }

  // Orb blocked by structures
  for (const s of arrays.structures) {
    if (orb.x > s.x && orb.x < s.x + s.w && orb.y + orb.radius > s.y && orb.y - orb.radius < s.y + s.h) {
      if (orb.y < s.y + 12) {
        orb.y = s.y - orb.radius;
        orb.vy *= -0.4;
      } else {
        orb.vx *= -0.4;
      }
    }
  }

  // Refill orb at water sources
  for (const source of arrays.waterSources) {
    if (Math.hypot(orb.x - source.x, orb.y - source.y) < source.r + orb.radius) {
      orb.radius = Math.min(orb.maxRadius, orb.radius + 0.13);
      emitParticles(source.x, source.y, 1, '#6ecbff', 0.6);
    }
  }
}

function aiAvoidsStructure(e) {
  for (const s of arrays.structures) {
    const aheadX = e.x + e.vx * 8;
    if (aheadX + e.w > s.x && aheadX < s.x + s.w && e.y + e.h > s.y) {
      e.vx *= -1; // turn around before box
      if (e.behavior === 'jumper' && e.y + e.h >= WORLD.floorY - 2) e.vy = -10;
    }
  }
}

function updateEnemies() {
  for (const e of arrays.enemies) {
    if (e.boss) {
      // Flying dragon boss that shoots fire projectiles
      e.x += e.vx;
      if (e.x < WORLD.width - 800 || e.x > WORLD.width - 160) e.vx *= -1;
      e.fireCooldown--;
      if (e.fireCooldown <= 0) {
        e.fireCooldown = 65;
        const px = player.x + player.w / 2;
        const py = player.y + player.h / 2;
        const dir = Math.atan2(py - (e.y + e.h / 2), px - e.x);
        arrays.projectiles.push({
          x: e.x,
          y: e.y + e.h / 2,
          vx: Math.cos(dir) * 6,
          vy: Math.sin(dir) * 6,
          r: 8,
          fire: true,
        });
      }

      // boss takes direct damage only when weak points broken
      if (e.weakPoints.every((w) => w.hp <= 0)) {
        const d = Math.hypot(orb.x - (e.x + e.w / 2), orb.y - (e.y + e.h / 2));
        if (d < 120 && Math.hypot(orb.vx, orb.vy) > 2) e.hp -= 1.3;
      }
      continue;
    }

    if (e.frozen > 0) {
      e.frozen--;
      e.vx *= 0.8;
      continue;
    }

    const dx = player.x - e.x;
    if (e.behavior === 'patrol') {
      e.vx = e.patrolDir * e.speed;
      if (Math.abs(dx) < 180) e.patrolDir = Math.sign(dx) || 1;
    }

    if (e.behavior === 'jumper') {
      e.vx = Math.sign(dx) * e.speed * 0.9;
      e.jumpCooldown--;
      if (e.jumpCooldown <= 0 && e.y + e.h >= WORLD.floorY - 2) {
        e.vy = -random(7, 11);
        e.jumpCooldown = random(45, 120);
      }
    }

    if (e.behavior === 'evasive') {
      const orbDist = Math.hypot(orb.x - e.x, orb.y - e.y);
      if (orbDist < 120) e.vx = -Math.sign(orb.x - e.x) * e.speed * 1.5;
      else e.vx = Math.sign(dx) * e.speed * 0.75;
    }

    e.vy += WORLD.gravity;
    e.x += e.vx;
    e.y += e.vy;
    e.x = clamp(e.x, 0, WORLD.width - e.w); // ai stays in map

    if (e.y + e.h > WORLD.floorY) {
      e.y = WORLD.floorY - e.h;
      e.vy = 0;
    }

    aiAvoidsStructure(e);

    e.attackCooldown--;
    if (Math.abs(dx) < 45 && Math.abs(player.y - e.y) < 55 && e.attackCooldown <= 0) {
      if (player.iFrames <= 0) {
        player.health -= 7;
        player.iFrames = 24;
      }
      e.attackCooldown = 55;
    }
  }

  arrays.enemies = arrays.enemies.filter((e) => {
    if (e.hp <= 0) {
      state.score += e.boss ? 1000 : 70;
      if (Math.random() < 0.2) {
        arrays.hearts.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, r: 10 });
      }
      emitParticles(e.x + (e.w || 40) / 2, e.y + (e.h || 40) / 2, 22, '#8fe4ff');
      return false;
    }
    return true;
  });
}

function updateProjectiles() {
  for (const p of arrays.projectiles) {
    p.x += p.vx;
    p.y += p.vy;

    // Water can block fire projectiles
    const d = Math.hypot(p.x - orb.x, p.y - orb.y);
    if (d < orb.radius + p.r + (player.abilities.projectileShield ? 8 : 0)) {
      p.dead = true;
      emitParticles(p.x, p.y, 10, '#9fdcff');
      continue;
    }

    if (Math.hypot(p.x - (player.x + player.w / 2), p.y - (player.y + player.h / 2)) < 25 && player.iFrames <= 0) {
      player.health -= 10;
      player.iFrames = 28;
      p.dead = true;
    }

    if (p.x < -50 || p.x > WORLD.width + 50 || p.y > WORLD.height + 50 || p.y < -50) p.dead = true;
  }
  arrays.projectiles = arrays.projectiles.filter((p) => !p.dead);
}

function updateParticles() {
  for (const p of arrays.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05;
    p.life--;
  }
  arrays.particles = arrays.particles.filter((p) => p.life > 0);
}

function drawWaveSprite(wave) {
  const dir = Math.sign(wave.vx) || 1;
  const x = wave.x;
  const y = wave.y;
  const w = wave.w;
  const h = wave.h;

  // Main wave body
  const grad = ctx.createLinearGradient(x - (w / 2) * dir, y, x + (w / 2) * dir, y);
  grad.addColorStop(0, 'rgba(167, 235, 255, 0.85)');
  grad.addColorStop(1, 'rgba(33, 163, 255, 0.75)');
  ctx.fillStyle = grad;

  ctx.beginPath();
  ctx.moveTo(x - (w / 2) * dir, y + h * 0.45);
  ctx.quadraticCurveTo(x - (w * 0.1) * dir, y - h * 0.7, x + (w / 2) * dir, y + h * 0.45);
  ctx.quadraticCurveTo(x + (w * 0.15) * dir, y + h * 0.1, x - (w / 2) * dir, y + h * 0.45);
  ctx.closePath();
  ctx.fill();

  // Foam highlights so the wave is clearly visible.
  ctx.strokeStyle = 'rgba(229, 250, 255, 0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - (w * 0.35) * dir, y + h * 0.15);
  ctx.quadraticCurveTo(x, y - h * 0.35, x + (w * 0.28) * dir, y + h * 0.1);
  ctx.stroke();
}

function collectPickups() {
  arrays.hearts = arrays.hearts.filter((h) => {
    if (Math.hypot((player.x + player.w / 2) - h.x, (player.y + player.h / 2) - h.y) < 32) {
      player.health = Math.min(player.maxHealth, player.health + 20);
      return false;
    }
    return true;
  });
}

function drawHumanoid(x, y, w, h, color, animPhase = 0, facing = 1) {
  ctx.save();
  ctx.translate(x + w / 2, y);
  ctx.scale(facing, 1);
  ctx.translate(-w / 2, 0);

  // Head
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(w / 2, 14, 12, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillRect(w / 2 - 8, 24, 16, 28);

  // Arms sway for simple animation
  const swing = Math.sin(animPhase) * 6;
  ctx.fillRect(w / 2 - 18, 28 + swing * 0.2, 10, 24);
  ctx.fillRect(w / 2 + 8, 28 - swing * 0.2, 10, 24);

  // Legs swing opposite for walk cycle
  ctx.fillRect(w / 2 - 12, 52, 8, 24 + swing * 0.2);
  ctx.fillRect(w / 2 + 4, 52, 8, 24 - swing * 0.2);
  ctx.restore();
}

function drawOrb() {
  const pulse = 1 + Math.sin(Date.now() * 0.008) * 0.08;
  if (orb.isIce && (orb.dragging || orb.launchTimer > 0) && Math.hypot(orb.vx, orb.vy) > 8.5) {
    // Ice shard shape (triangle)
    ctx.fillStyle = '#d8f3ff';
    ctx.beginPath();
    ctx.moveTo(orb.x + orb.radius * 1.2, orb.y);
    ctx.lineTo(orb.x - orb.radius * 0.8, orb.y - orb.radius * 0.9);
    ctx.lineTo(orb.x - orb.radius * 0.8, orb.y + orb.radius * 0.9);
    ctx.closePath();
    ctx.fill();
  } else {
    const grd = ctx.createRadialGradient(orb.x - 4, orb.y - 6, 2, orb.x, orb.y, orb.radius * 1.4);
    grd.addColorStop(0, orb.isIce ? '#f6feff' : '#d9f7ff');
    grd.addColorStop(1, orb.isIce ? '#91dbff' : '#2bb7ff');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.radius * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWorld() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Camera follows player in side-scrolling direction
  camera.x = clamp(player.x - canvas.width * 0.35, 0, WORLD.width - canvas.width);
  ctx.save();
  ctx.translate(-camera.x, 0);

  // Ground strip
  ctx.fillStyle = 'rgba(39,96,54,0.35)';
  ctx.fillRect(0, WORLD.floorY, WORLD.width, WORLD.height - WORLD.floorY);

  for (const s of arrays.structures) {
    ctx.fillStyle = s.type === 'iceWall' ? '#7cb5d9' : '#6f5b49';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeStyle = '#1f2935';
    ctx.strokeRect(s.x, s.y, s.w, s.h);
  }

  for (const ws of arrays.waterSources) {
    ws.pulse += 0.06;
    ctx.fillStyle = 'rgba(30,130,255,0.25)';
    ctx.beginPath();
    ctx.arc(ws.x, ws.y, ws.r + Math.sin(ws.pulse) * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#84d9ff';
    ctx.beginPath();
    ctx.arc(ws.x, ws.y, ws.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const h of arrays.hearts) {
    ctx.fillStyle = '#ff6f8b';
    ctx.beginPath();
    ctx.arc(h.x - 5, h.y, 6, 0, Math.PI * 2);
    ctx.arc(h.x + 5, h.y, 6, 0, Math.PI * 2);
    ctx.lineTo(h.x, h.y + 12);
    ctx.closePath();
    ctx.fill();
  }

  // Draw player & enemies
  drawHumanoid(player.x, player.y, player.w, player.h, '#3a7dff', Date.now() * 0.015 + player.x * 0.1, player.facing);

  for (const e of arrays.enemies) {
    if (e.boss) {
      ctx.fillStyle = '#a02d2d';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = '#d74d38';
      ctx.fillRect(e.x + e.w - 30, e.y + 35, 35, 20);
      for (const wp of e.weakPoints) {
        ctx.fillStyle = wp.hp > 0 ? '#ffe88a' : '#555';
        ctx.beginPath();
        ctx.arc(e.x + wp.ox, e.y + wp.oy, wp.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Boss health bar
      const hpRatio = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = '#1b1b1b';
      ctx.fillRect(e.x, e.y - 16, e.w, 8);
      ctx.fillStyle = '#ff7a7a';
      ctx.fillRect(e.x, e.y - 16, e.w * hpRatio, 8);
    } else {
      drawHumanoid(e.x, e.y, e.w, e.h, e.frozen > 0 ? '#adddff' : '#ff5252', Date.now() * 0.012 + e.x, Math.sign(e.vx) || -1);
      const ratio = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(e.x - 4, e.y - 10, e.w + 8, 5);
      ctx.fillStyle = '#ff7070';
      ctx.fillRect(e.x - 4, e.y - 10, (e.w + 8) * ratio, 5);
    }
  }

  for (const p of arrays.projectiles) {
    ctx.fillStyle = p.fire ? '#ff8b47' : '#fff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const wave of arrays.waves) {
    drawWaveSprite(wave);
  }

  drawOrb();

  for (const p of arrays.particles) {
    ctx.globalAlpha = p.life / 28;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
    ctx.globalAlpha = 1;
  }

  // Combo text pop
  if (player.comboTimer > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Arial';
    ctx.fillText(['Punch!', 'Kick!', 'Roundhouse!'][player.comboStep], player.x - 8, player.y - 20);
  }

  ctx.restore();
}

function updateHUD() {
  playerHealthFill.style.width = `${(player.health / player.maxHealth) * 100}%`;
  waterFill.style.width = `${(orb.radius / orb.maxRadius) * 100}%`;
  waveLabel.textContent = `Wave: ${state.wave}`;
  levelLabel.textContent = `Level: ${state.level}`;
  scoreLabel.textContent = `Score: ${Math.floor(state.score)}`;
}

function maybeAdvanceWave() {
  if (arrays.enemies.length === 0 && !state.pausedForLevelUp) {
    state.wave += 1;
    levelUp();
  }
}

function checkGameOver() {
  if (player.health <= 0 && state.running) {
    state.running = false;
    gameOverSummary.textContent = `You reached Wave ${state.wave} with score ${Math.floor(state.score)}.`;
    gameOverPanel.classList.remove('hidden');
  }
}

function step() {
  if (state.running && !state.pausedForLevelUp) {
    updatePlayer();
    updateOrb();
    updateWaves();
    updateEnemies();
    updateProjectiles();
    updateParticles();
    collectPickups();
    maybeAdvanceWave();
    checkGameOver();
    state.score += 0.02;
  }

  drawWorld();
  updateHUD();
  requestAnimationFrame(step);
}

// INPUT: keyboard
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyQ') performWaterWave();
  if (e.code === 'KeyF') punchKickAttack();
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

// INPUT: mouse dragging for water orb
canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
  mouse.worldX = mouse.x + camera.x;
  mouse.worldY = mouse.y;
  // Click near orb starts drag
  if (Math.hypot(mouse.worldX - orb.x, mouse.worldY - orb.y) <= orb.radius + 18) {
    mouse.down = true;
    state.dragStart = { x: mouse.worldX, y: mouse.worldY };
  }
});

window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
  mouse.worldX = mouse.x + camera.x;
  mouse.worldY = mouse.y;
});

window.addEventListener('mouseup', () => {
  mouse.down = false;
});

restartBtn.addEventListener('click', resetGame);
playAgainBtn.addEventListener('click', resetGame);

// Start game
spawnWave();
requestAnimationFrame(step);
