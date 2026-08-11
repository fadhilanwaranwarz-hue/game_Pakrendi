(function(){
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const scoreEl = document.getElementById('scoreVal');
  const highScoreEl = document.getElementById('highScoreVal');
  const waveEl = document.getElementById('waveVal');
  const livesEl = document.getElementById('lives');
  const healthBarEl = document.getElementById('healthBar');
  const healthTextEl = document.getElementById('healthText');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlaySub = document.getElementById('overlaySub');
  const startBtn = document.getElementById('startBtn');
  const levelBanner = document.getElementById('levelBanner');
  const bombStatusEl = document.getElementById('bombStatus');

  let keys = {};
  let running = false;
  let score = 0, wave = 1, lives = 3;
  let playerHealth = 100, maxHealth = 100;
  let highScore = 0;
  let frame = 0;
  let bannerTimeout = null;
  let boss = null;

  function showLevelBanner(text){
    levelBanner.textContent = text;
    levelBanner.classList.add('show');
    clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(()=> levelBanner.classList.remove('show'), 1100);
  }

  // ---------- Entities ----------
  const player = {
    x: W/2, y: H-90, w: 34, h: 40,
    speed: 5, cooldown: 0, invuln: 0, bombCooldown: 0
  };
  let bullets = [];
  let enemyBullets = [];
  let enemies = [];
  let particles = [];
  let stars = [];
  let bombs = [];
  let shockwaves = [];

  for(let i=0;i<90;i++){
    stars.push({
      x: Math.random()*W,
      y: Math.random()*H,
      r: Math.random()*1.6+0.3,
      speed: Math.random()*2+0.5,
      hue: Math.random()>0.85 ? '#ff3fa4' : '#4bf0ff'
    });
  }

  function spawnWave(n){
    enemies = [];
    const rows = Math.min(2 + Math.floor(n/2), 5);
    const cols = Math.min(4 + Math.floor(n/3), 8);
    const marginX = 50;
    const gapX = (W - marginX*2) / (cols-1 || 1);
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        enemies.push({
          x: marginX + c*gapX,
          y: 60 + r*54,
          baseX: marginX + c*gapX,
          w: 26, h: 22,
          alive: true,
          fireChance: 0.0022 + n*0.0004,
          phase: Math.random()*Math.PI*2,
          hp: 1 + (n > 5 ? 1 : 0)
        });
      }
    }
  }

  function spawnBoss(n){
    boss = {
      x: W/2, y: 110,
      vx: (2 + n*0.15) * (Math.random()<0.5 ? -1 : 1),
      w: 90, h: 80,
      hp: 6 + n*3, maxHp: 6 + n*3,
      phase: Math.random()*Math.PI*2,
      fireCooldown: 90
    };
    showLevelBanner('BOS MUNCUL!');
  }

  function resetGame(){
    score = 0; wave = 1; lives = 3; frame = 0;
    playerHealth = 100;
    player.x = W/2; player.y = H-90; player.invuln = 120; player.bombCooldown = 0;
    bullets = []; enemyBullets = []; particles = []; bombs = []; shockwaves = []; boss = null;
    spawnWave(wave);
    updateHUD();
    showLevelBanner('LEVEL 1');
  }

  function updateHUD(){
    scoreEl.textContent = score;
    if(score > highScore){ highScore = score; }
    highScoreEl.textContent = highScore;
    waveEl.textContent = wave;
    livesEl.textContent = '▲'.repeat(Math.max(lives,0)) || '—';

    // Health bar update
    const hpPct = Math.max(0, playerHealth / maxHealth * 100);
    healthBarEl.style.width = hpPct + '%';
    healthTextEl.textContent = Math.ceil(hpPct) + '%';

    // Bomb cooldown
    if(player.bombCooldown > 0){
      bombStatusEl.textContent = Math.ceil(player.bombCooldown/60) + 's';
      bombStatusEl.className = 'cooling';
    } else {
      bombStatusEl.textContent = 'SIAP';
      bombStatusEl.className = 'ready';
    }
  }

  // ---------- Input ----------
  window.addEventListener('keydown', e=>{
    keys[e.key.toLowerCase()] = true;
    if(e.key === ' ') e.preventDefault();
  });
  window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()] = false; });

  // touch controls
  let touchDir = {x:0,y:0};
  let touchFire = false;
  const movePad = document.getElementById('movePad');
  const fireBtn = document.getElementById('fireBtn');
  let padActive = false, padStart = {x:0,y:0};

  movePad.addEventListener('touchstart', e=>{
    padActive = true;
    const t = e.touches[0];
    const rect = movePad.getBoundingClientRect();
    padStart = {x: rect.left+rect.width/2, y: rect.top+rect.height/2};
    e.preventDefault();
  });
  movePad.addEventListener('touchmove', e=>{
    if(!padActive) return;
    const t = e.touches[0];
    let dx = t.clientX - padStart.x;
    let dy = t.clientY - padStart.y;
    const max = 50;
    dx = Math.max(-max, Math.min(max, dx));
    dy = Math.max(-max, Math.min(max, dy));
    touchDir.x = dx/max;
    touchDir.y = dy/max;
    e.preventDefault();
  });
  movePad.addEventListener('touchend', e=>{
    padActive = false; touchDir = {x:0,y:0};
    e.preventDefault();
  });
  fireBtn.addEventListener('touchstart', e=>{ touchFire = true; e.preventDefault(); });
  fireBtn.addEventListener('touchend', e=>{ touchFire = false; e.preventDefault(); });

  let touchBomb = false;
  const bombBtn = document.getElementById('bombBtn');
  bombBtn.addEventListener('touchstart', e=>{ touchBomb = true; e.preventDefault(); });
  bombBtn.addEventListener('touchend', e=>{ touchBomb = false; e.preventDefault(); });

  // ---------- Game loop pieces ----------
  function firePlayerBullet(){
    bullets.push({x: player.x, y: player.y-20, w:3, h:12, speed:9});
    bullets.push({x: player.x-12, y: player.y-10, w:3, h:12, speed:9});
    bullets.push({x: player.x+12, y: player.y-10, w:3, h:12, speed:9});
  }

  function spawnExplosion(x,y,color){
    for(let i=0;i<14;i++){
      const ang = Math.random()*Math.PI*2;
      const spd = Math.random()*3+1;
      particles.push({
        x,y, vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd,
        life: 30+Math.random()*15, color
      });
    }
  }

  function explodeBomb(x,y){
    shockwaves.push({x,y,r:6,life:22});
    spawnExplosion(x,y,'#ffb545');
    spawnExplosion(x,y,'#ff3fa4');
    enemies.forEach(en=>{
      if(!en.alive) return;
      const dist = Math.hypot(x-en.x, y-en.y);
      if(dist < 75){
        en.hp -= 5;
        if(en.hp<=0){
          en.alive = false;
          score += 10;
          spawnExplosion(en.x, en.y, '#ff3fa4');
        }
      }
    });
    if(boss){
      const dist = Math.hypot(x-boss.x, y-boss.y);
      if(dist < 100){
        boss.hp -= 4;
        spawnExplosion(boss.x, boss.y, '#ffb545');
        if(boss.hp<=0) defeatBoss();
      }
    }
  }

  function defeatBoss(){
    score += 200;
    spawnExplosion(boss.x, boss.y, '#ff3fa4');
    spawnExplosion(boss.x, boss.y, '#ffb545');
    boss = null;
    wave++;
    spawnWave(wave);
    showLevelBanner('LEVEL ' + wave);
  }

  function update(){
    frame++;

    // player movement
    let dx = 0, dy = 0;
    if(keys['arrowleft']||keys['a']) dx -= 1;
    if(keys['arrowright']||keys['d']) dx += 1;
    if(keys['arrowup']||keys['w']) dy -= 1;
    if(keys['arrowdown']||keys['s']) dy += 1;
    dx += touchDir.x; dy += touchDir.y;

    player.x += dx * player.speed;
    player.y += dy * player.speed;
    player.x = Math.max(20, Math.min(W-20, player.x));
    player.y = Math.max(40, Math.min(H-30, player.y));

    if(player.cooldown>0) player.cooldown--;
    if((keys[' ']||touchFire) && player.cooldown<=0){
      firePlayerBullet();
      player.cooldown = 9;
    }
    if(player.bombCooldown>0) player.bombCooldown--;
    if((keys['b']||touchBomb) && player.bombCooldown<=0){
      bombs.push({x: player.x, y: player.y-24, speed:5.5, r:7, exploded:false});
      player.bombCooldown = 240;
    }
    if(player.invuln>0) player.invuln--;

    // bullets
    bullets.forEach(b=> b.y -= b.speed);
    bullets = bullets.filter(b=> b.y > -20);

    enemyBullets.forEach(b=> b.y += b.speed);
    enemyBullets = enemyBullets.filter(b=> b.y < H+20);

    // bombs
    bombs.forEach(bm=>{
      if(bm.exploded) return;
      bm.y -= bm.speed;
      bm.r += 0.15;
      let hit = bm.y < 50;
      enemies.forEach(en=>{
        if(!en.alive) return;
        if(Math.hypot(bm.x-en.x, bm.y-en.y) < 20) hit = true;
      });
      if(boss && Math.hypot(bm.x-boss.x, bm.y-boss.y) < 45) hit = true;
      if(hit){
        bm.exploded = true;
        explodeBomb(bm.x, bm.y);
      }
    });
    bombs = bombs.filter(bm=> !bm.exploded);

    shockwaves.forEach(s=>{ s.r += 6; s.life--; });
    shockwaves = shockwaves.filter(s=> s.life>0);

    // boss behavior
    if(boss){
      boss.phase += 0.02;
      boss.x += boss.vx;
      if(boss.x < 70 || boss.x > W-70) boss.vx *= -1;
      boss.y = 110 + Math.sin(boss.phase*2)*10;
      boss.fireCooldown--;
      if(boss.fireCooldown<=0){
        for(let a=-1;a<=1;a++){
          enemyBullets.push({x: boss.x + a*20, y: boss.y+36, w:4, h:13, speed:4.5+wave*0.12});
        }
        boss.fireCooldown = Math.max(70 - wave*3, 26);
      }
    }

    // enemies movement (side-to-side sway + slow descent)
    let anyAlive = false;
    enemies.forEach(en=>{
      if(!en.alive) return;
      anyAlive = true;
      en.phase += 0.03;
      en.x = en.baseX + Math.sin(en.phase)*22;
      en.y += 0.15 + wave*0.02;
      if(Math.random() < en.fireChance){
        enemyBullets.push({x: en.x, y: en.y+14, w:3, h:10, speed:4.5+wave*0.15});
      }
    });

    // wave clear -> spawn boss once, then boss defeat advances the level
    if(enemies.length>0 && !anyAlive && !boss){
      enemies = [];
      spawnBoss(wave);
    }

    // collisions: player bullets vs enemies
    bullets.forEach(b=>{
      enemies.forEach(en=>{
        if(!en.alive) return;
        if(Math.abs(b.x-en.x) < en.w/2+2 && Math.abs(b.y-en.y) < en.h/2+2){
          en.hp--;
          b.y = -999;
          if(en.hp<=0){
            en.alive = false;
            score += 10;
            spawnExplosion(en.x, en.y, '#ff3fa4');
          }
        }
      });
      if(boss && Math.abs(b.x-boss.x) < boss.w/2 && Math.abs(b.y-boss.y) < boss.h/2){
        boss.hp--;
        b.y = -999;
        spawnExplosion(b.x, b.y, '#ffb545');
        if(boss.hp<=0) defeatBoss();
      }
    });
    bullets = bullets.filter(b=> b.y > -50);

    // enemy descent reaching player level = game over trigger
    enemies.forEach(en=>{
      if(en.alive && en.y > H-70) triggerHit();
    });

    // collisions: enemy bullets vs player
    if(player.invuln<=0){
      enemyBullets.forEach(b=>{
        if(Math.abs(b.x-player.x) < 14 && Math.abs(b.y-player.y) < 16){
          b.y = 9999;
          triggerHit();
        }
      });
    }

    // particles
    particles.forEach(p=>{
      p.x += p.vx; p.y += p.vy; p.life--;
    });
    particles = particles.filter(p=> p.life>0);

    // stars
    stars.forEach(s=>{
      s.y += s.speed;
      if(s.y > H){ s.y = 0; s.x = Math.random()*W; }
    });

    updateHUD();
  }

  function triggerHit(){
    if(player.invuln>0) return;

    // Kurangi darah dulu, baru nyawa kalau darah habis
    playerHealth -= 34;
    if(playerHealth <= 0){
      // Darah habis → kurangi nyawa 1, reset darah
      lives--;
      playerHealth = maxHealth;
      spawnExplosion(player.x, player.y, '#4bf0ff');
      player.invuln = 90;
      updateHUD();
      if(lives<=0){
        endGame();
      }
    } else {
      // Darah masih ada → invuln sebentar
      player.invuln = 30;
      spawnExplosion(player.x, player.y, '#4bf0ff');
      updateHUD();
    }
  }

  function endGame(){
    running = false;
    gameStarted = false;
    overlayTitle.textContent = 'SINYAL PUTUS';
    overlaySub.innerHTML = `Kurir gugur di gelombang <b>${wave}</b>.<br>Skor akhir: <span style="color:var(--magenta);font-size:20px">${score}</span><br><br>Sinyal SOS-mu belum sampai. Coba lagi?`;
    startBtn.textContent = 'Ulangi Misi';
    overlay.style.display = 'flex';
  }

  // ---------- Draw ----------
  function drawShip(x,y,flicker){
    if(flicker && frame%8<4) return;
    ctx.save();
    ctx.translate(x,y);

    // rotor blur disc (main rotor, top-down view)
    ctx.save();
    ctx.rotate((frame*0.9) % (Math.PI*2));
    ctx.fillStyle = 'rgba(75,240,255,0.12)';
    ctx.beginPath();
    ctx.ellipse(0,-4, 26, 26*0.32, 0, 0, Math.PI*2);
    ctx.fill();
    // two spinning blades
    ctx.strokeStyle = 'rgba(200,240,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-26,-4); ctx.lineTo(26,-4);
    ctx.moveTo(0,-4-26*0.32); ctx.lineTo(0,-4+26*0.32);
    ctx.stroke();
    ctx.restore();

    // rotor mast
    ctx.strokeStyle = '#7a8bab';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0,-4); ctx.lineTo(0,2);
    ctx.stroke();

    // tail boom
    ctx.fillStyle = '#2c3a52';
    ctx.fillRect(-2.5, 6, 5, 22);

    // tail rotor (small, spinning faster)
    ctx.save();
    ctx.translate(0, 27);
    ctx.rotate((frame*1.6) % (Math.PI*2));
    ctx.strokeStyle = 'rgba(255,181,69,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-7,0); ctx.lineTo(7,0);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#1c2740';
    ctx.beginPath();
    ctx.arc(0,27,2,0,Math.PI*2);
    ctx.fill();

    // stub wings with weapon pods
    ctx.fillStyle = '#3a4a68';
    ctx.fillRect(-17, 2, 10, 5);
    ctx.fillRect(7, 2, 10, 5);
    ctx.fillStyle = '#ff3fa4';
    ctx.shadowColor = '#ff3fa4';
    ctx.shadowBlur = 6;
    ctx.fillRect(-16, 6, 4, 8);
    ctx.fillRect(12, 6, 4, 8);

    // fuselage (cockpit-forward body)
    ctx.shadowColor = '#4bf0ff';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#4bf0ff';
    ctx.beginPath();
    ctx.moveTo(0,-16);
    ctx.quadraticCurveTo(8,-8, 6,4);
    ctx.lineTo(4,8);
    ctx.lineTo(-4,8);
    ctx.lineTo(-6,4);
    ctx.quadraticCurveTo(-8,-8, 0,-16);
    ctx.closePath();
    ctx.fill();

    // cockpit glass
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0a2030';
    ctx.beginPath();
    ctx.ellipse(0,-9, 3.2, 5, 0, 0, Math.PI*2);
    ctx.fill();

    // engine glow / exhaust
    ctx.fillStyle = '#ffb545';
    ctx.beginPath();
    ctx.moveTo(-3,8);
    ctx.lineTo(3,8);
    ctx.lineTo(0,14+Math.random()*5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(en){
    ctx.save();
    ctx.translate(en.x, en.y);
    const tough = en.hp > 1;
    const bodyColor = tough ? '#ffb545' : '#ff3fa4';
    const wave = en.phase;

    // tentacles (wavy, trailing below body)
    ctx.strokeStyle = bodyColor;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const tentacleXs = [-9, -3, 3, 9];
    tentacleXs.forEach((tx, i)=>{
      const sway = Math.sin(wave*2 + i*1.3) * 5;
      ctx.beginPath();
      ctx.moveTo(tx, 6);
      ctx.quadraticCurveTo(tx+sway, 13, tx+sway*1.4, 19+Math.abs(sway)*0.3);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // body (organic blob, pulsing slightly)
    const pulse = 1 + Math.sin(wave*3)*0.06;
    ctx.shadowColor = bodyColor;
    ctx.shadowBlur = 10;
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13*pulse, 11*pulse, 0, 0, Math.PI*2);
    ctx.fill();

    // small horns/spikes on top
    ctx.beginPath();
    ctx.moveTo(-7,-8); ctx.lineTo(-9,-15); ctx.lineTo(-4,-9);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(7,-8); ctx.lineTo(9,-15); ctx.lineTo(4,-9);
    ctx.closePath();
    ctx.fill();

    // big single eye
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0a0e18';
    ctx.beginPath();
    ctx.ellipse(0, -1, 6, 6, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = tough ? '#fff4e0' : '#ffe0f2';
    ctx.beginPath();
    ctx.arc(0,-1, 4, 0, Math.PI*2);
    ctx.fill();
    const lookX = Math.sin(wave*1.5)*1.8;
    ctx.fillStyle = '#1a0a12';
    ctx.beginPath();
    ctx.arc(lookX,-1, 2.1, 0, Math.PI*2);
    ctx.fill();

    // tiny fangs
    ctx.fillStyle = '#fefefe';
    ctx.beginPath();
    ctx.moveTo(-3,7); ctx.lineTo(-1,11); ctx.lineTo(1,7);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawBoss(b){
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(2.6, 2.6);
    const wavePh = b.phase;

    // tentacles
    ctx.strokeStyle = '#ff3fa4';
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    [-10,-4,4,10].forEach((tx,i)=>{
      const sway = Math.sin(wavePh*2 + i*1.3) * 6;
      ctx.beginPath();
      ctx.moveTo(tx, 8);
      ctx.quadraticCurveTo(tx+sway, 16, tx+sway*1.3, 24+Math.abs(sway)*0.3);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // body
    ctx.shadowColor = '#ff3fa4';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#ff3fa4';
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 13, 0, 0, Math.PI*2);
    ctx.fill();

    // horns
    ctx.beginPath();
    ctx.moveTo(-9,-9); ctx.lineTo(-14,-20); ctx.lineTo(-5,-11);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(9,-9); ctx.lineTo(14,-20); ctx.lineTo(5,-11);
    ctx.closePath(); ctx.fill();

    // twin eyes
    ctx.shadowBlur = 0;
    [-6,6].forEach(ex=>{
      ctx.fillStyle = '#0a0e18';
      ctx.beginPath(); ctx.ellipse(ex,-2,5,5,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff4e0';
      ctx.beginPath(); ctx.arc(ex,-2,3.2,0,Math.PI*2); ctx.fill();
      const lookX = ex + Math.sin(wavePh*1.5)*1.4;
      ctx.fillStyle = '#1a0a12';
      ctx.beginPath(); ctx.arc(lookX,-2,1.7,0,Math.PI*2); ctx.fill();
    });

    // fang
    ctx.fillStyle = '#fefefe';
    ctx.beginPath();
    ctx.moveTo(-4,8); ctx.lineTo(0,15); ctx.lineTo(4,8);
    ctx.closePath(); ctx.fill();

    ctx.restore();

    // health bar (unscaled, screen space)
    const barW = 100, barH = 8;
    const hpRatio = Math.max(b.hp,0)/b.maxHp;
    ctx.save();
    ctx.translate(b.x - barW/2, b.y - 62);
    ctx.fillStyle = 'rgba(20,20,30,0.75)';
    ctx.fillRect(0,0,barW,barH);
    ctx.fillStyle = hpRatio>0.4 ? '#ffb545' : '#ff3fa4';
    ctx.fillRect(0,0,barW*hpRatio,barH);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0,0,barW,barH);
    ctx.restore();
  }

  function draw(){
    ctx.clearRect(0,0,W,H);

    // stars
    stars.forEach(s=>{
      ctx.fillStyle = s.hue;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(s.x, s.y, s.r, s.r*3);
    });
    ctx.globalAlpha = 1;

    // enemies
    enemies.forEach(en=>{ if(en.alive) drawEnemy(en); });
    if(boss) drawBoss(boss);

    // bombs
    bombs.forEach(bm=>{
      ctx.fillStyle = '#ffb545';
      ctx.shadowColor = '#ffb545';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(bm.x, bm.y, bm.r, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // shockwaves
    shockwaves.forEach(s=>{
      ctx.strokeStyle = 'rgba(255,181,69,' + Math.max(s.life/22,0) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      ctx.stroke();
    });

    // bullets
    ctx.fillStyle = '#4bf0ff';
    ctx.shadowColor = '#4bf0ff';
    ctx.shadowBlur = 6;
    bullets.forEach(b=> ctx.fillRect(b.x-b.w/2, b.y-b.h/2, b.w, b.h));

    ctx.fillStyle = '#ff3fa4';
    ctx.shadowColor = '#ff3fa4';
    enemyBullets.forEach(b=> ctx.fillRect(b.x-b.w/2, b.y-b.h/2, b.w, b.h));
    ctx.shadowBlur = 0;

    // particles
    particles.forEach(p=>{
      ctx.globalAlpha = Math.max(p.life/40, 0);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x-2, p.y-2, 4, 4);
    });
    ctx.globalAlpha = 1;

    // player
    drawShip(player.x, player.y, player.invuln>0);
  }

  function loop(){
    if(running){
      update();
      draw();
      requestAnimationFrame(loop);
    }
  }

  let gameStarted = false;
  function startGame(){
    if(gameStarted) return;
    gameStarted = true;
    overlay.style.display = 'none';
    resetGame();
    running = true;
    loop();
  }
  startBtn.addEventListener('click', startGame);
  startBtn.addEventListener('touchend', (e)=>{
    e.preventDefault();
    startGame();
  });

})();

