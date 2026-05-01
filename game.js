/* ============================================
   FRANZISKAS RODEO – GAME ENGINE
   Inverted-Pendulum Balance Game, 3 Min Survival
   ============================================ */

const Game = (() => {
  // === CONFIG ===
  const CFG = {
    DURATION: 180,          // 3 minutes in seconds
    FAIL_ANGLE: 85,         // degrees → game over
    CORRECTION_SPEED: 220,  // balance correction per second
    GRAVITY_BASE: 35,       // base gravity pull
    DISTURB_BASE: 70,       // base disturbance strength
    HORSE_BOB_SPEED: 3,     // horse bobbing frequency
    GRACE_PERIOD: 1,        // seconds of invincibility at start
    QTE_TIMES: [45, 90, 130, 165], // 4 QTEs
    QTE_DURATION_START: 10.0, // First QTE gives 10 seconds to read
    QTE_DURATION_END: 3.5,    // Final QTE gives 3.5 seconds
    PHASES: [
      { name: 'Orientierung', start: 0,   end: 30,  color: '#2ecc71' },
      { name: 'Aufwärmung',   start: 30,  end: 75,  color: '#3498db' },
      { name: 'Flow-Check',   start: 75,  end: 120, color: '#f39c12' },
      { name: 'Stresstest',   start: 120, end: 160, color: '#e67e22' },
      { name: 'RODEO-FINALE', start: 160, end: 180, color: '#e74c3c' },
    ],
  };

  const STROOP_COLORS = [
    { name: 'Grün', hex: '#2ecc71' },
    { name: 'Gelb', hex: '#f1c40f' },
    { name: 'Rot', hex: '#e74c3c' },
    { name: 'Schwarz', hex: '#000000' },
    { name: 'Blau', hex: '#3498db' },
    { name: 'Lila', hex: '#9b59b6' },
    { name: 'Weiß', hex: '#ffffff' },
    { name: 'Orange', hex: '#e67e22' },
    { name: 'Pink', hex: '#ff9ff3' }
  ];

  // === STATE ===
  let state = {
    running: false,
    balance: 0,           // -85 to +85
    elapsed: 0,
    lastTime: 0,
    inputLeft: false,
    inputRight: false,
    qteActive: false,
    qteTimer: 0,
    qteFired: [],         // which QTEs already triggered
    dustParticles: [],
    cameraShake: { x: 0, y: 0, intensity: 0 },
  };

  let canvas, ctx, W, H;
  let loopId = null; // To prevent multiple loops running

  // === ASSET PLACEHOLDERS ===
  const assets = {
    bgLoaded: false,
    bg: new Image(),
    horseFrames: {},
    horseFramesLoaded: 0,
    guys: {},       // guys.ahrens.front[0..29], guys.ahrens.back[0..29], etc.
    guysLoaded: 0,
  };

  // === AUDIO ===
  let bgMusic = null;

  // Horse frames 1-15
  const HORSE_TOTAL_FRAMES = 15;
  for (let i = 1; i <= HORSE_TOTAL_FRAMES; i++) {
    assets.horseFrames[i] = new Image();
  }

  // === GUY ANIMATION SYSTEM ===
  const GUY_NAMES = ['ahrens', 'julius', 'kevin'];
  const GUY_VIEWS = ['front', 'back'];
  const GUY_FRAME_COUNT = 30;
  const GUY_TOTAL_IMAGES = GUY_NAMES.length * GUY_VIEWS.length * GUY_FRAME_COUNT; // 180

  // Pre-initialize all guy frames
  GUY_NAMES.forEach(name => {
    assets.guys[name] = {};
    GUY_VIEWS.forEach(view => {
      assets.guys[name][view] = [];
      for (let i = 0; i < GUY_FRAME_COUNT; i++) {
        assets.guys[name][view].push(new Image());
      }
    });
  });

  // Each guy has independent animation state
  const guyAnims = GUY_NAMES.map((name, idx) => ({
    name: name,
    frame: 0,
    timer: 0,
    speed: 0.1,             // seconds per frame
    view: 'front',          // current view: 'front' or 'back'
    playing: false,         // is an animation currently playing?
    cooldown: 2 + Math.random() * 4, // seconds until next animation starts
    cooldownTimer: Math.random() * 3,  // stagger start times
    x: 0,                              // randomized on start()
    scale: 0.8,                         // big enough to see above fence
  }));

  // Randomize guy positions along the fence each run
  function randomizeGuyPositions() {
    const zones = [];
    for (let i = 0; i < 3; i++) {
      let x;
      do {
        // Left side (0.05-0.35) or right side (0.65-0.95) — avoid the horse in center
        if (Math.random() > 0.5) {
          x = 0.05 + Math.random() * 0.30;
        } else {
          x = 0.65 + Math.random() * 0.30;
        }
      } while (zones.some(z => Math.abs(z - x) < 0.08)); // no overlapping
      zones.push(x);
    }
    guyAnims.forEach((guy, i) => {
      guy.x = zones[i];
      guy.frame = 0;
      guy.playing = false;
      guy.cooldownTimer = Math.random() * 3;
      guy.cooldown = 2 + Math.random() * 4;
      guy.view = Math.random() > 0.5 ? 'front' : 'back';
    });
  }

  // Try loading images – if not found, we draw placeholders
  function loadAssets() {
    assets.bg.onload = () => { assets.bgLoaded = true; };
    assets.bg.onerror = () => { assets.bgLoaded = false; };
    assets.bg.src = 'assets/arena.jpeg';

    // Load Horse States (1 to 15)
    for (let i = 1; i <= HORSE_TOTAL_FRAMES; i++) {
      assets.horseFrames[i].onload = () => { assets.horseFramesLoaded++; };
      assets.horseFrames[i].src = `assets/${i}.png`;
    }

    // Load all guy frames from assets/sheets/{name}{view}/images/{name}{view}_XX.png
    GUY_NAMES.forEach(name => {
      GUY_VIEWS.forEach(view => {
        for (let i = 0; i < GUY_FRAME_COUNT; i++) {
          const imgNum = (i + 1).toString().padStart(2, '0');
          const key = name + view; // e.g. "ahrensfront"
          assets.guys[name][view][i].onload = () => { assets.guysLoaded++; };
          assets.guys[name][view][i].src = `assets/sheets/${key}/images/${key}_${imgNum}.png`;
        }
      });
    });
  }

  // === SCREEN MANAGEMENT ===
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  // === INIT ===
  function init() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    loadAssets();
    setupInput();

    // Init background music
    bgMusic = new Audio('assets/rodeo.mp3');
    bgMusic.loop = true;
    bgMusic.volume = 0.5;
  }

  function resize() {
    if (!canvas) return;
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  // === INPUT ===
  function setupInput() {
    // Keyboard
    window.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') state.inputLeft = true;
      if (e.key === 'ArrowRight') state.inputRight = true;
    });
    window.addEventListener('keyup', e => {
      if (e.key === 'ArrowLeft') state.inputLeft = false;
      if (e.key === 'ArrowRight') state.inputRight = false;
    });

    // Touch – visible buttons
    const tl = document.getElementById('btn-left');
    const tr = document.getElementById('btn-right');

    const handleLeftStart = (e) => { e.preventDefault(); state.inputLeft = true; };
    const handleLeftEnd = (e) => { e.preventDefault(); state.inputLeft = false; };
    const handleRightStart = (e) => { e.preventDefault(); state.inputRight = true; };
    const handleRightEnd = (e) => { e.preventDefault(); state.inputRight = false; };

    // Support both touch and mouse on buttons
    tl.addEventListener('touchstart', handleLeftStart);
    tl.addEventListener('touchend', handleLeftEnd);
    tl.addEventListener('mousedown', handleLeftStart);
    tl.addEventListener('mouseup', handleLeftEnd);
    tl.addEventListener('mouseleave', handleLeftEnd);

    tr.addEventListener('touchstart', handleRightStart);
    tr.addEventListener('touchend', handleRightEnd);
    tr.addEventListener('mousedown', handleRightStart);
    tr.addEventListener('mouseup', handleRightEnd);
    tr.addEventListener('mouseleave', handleRightEnd);
  }

  // === GYRO SETUP ===
  function setupGyro(onSuccess) {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
          if (permissionState === 'granted') {
            onSuccess(true);
          } else {
            alert('Gyro-Zugriff verweigert! Starte im Touch-Modus.');
            onSuccess(false);
          }
        })
        .catch(e => {
          console.error(e);
          onSuccess(false);
        });
    } else {
      // Non-iOS13+ or desktop
      onSuccess(true);
    }
  }

  function handleGyro(e) {
    if (!state.running || !state.gyroMode) return;
    // gamma is left/right tilt in portrait mode (-90 to 90)
    let tilt = e.gamma;
    if (tilt > 90) tilt = 90;
    if (tilt < -90) tilt = -90;
    state.gyroTilt = tilt;
  }

  window.addEventListener('deviceorientation', handleGyro, true);

  // === START / RESTART ===
  function start(mode = 'touch') {
    if (mode === 'gyro') {
      setupGyro((success) => {
        internalStart(success ? 'gyro' : 'touch');
      });
    } else {
      internalStart('touch');
    }
  }

  function internalStart(mode) {
    if (loopId) cancelAnimationFrame(loopId);

    state = {
      running: true, failed: false, won: false, balance: 0, elapsed: 0, lastTime: 0,
      inputLeft: false, inputRight: false,
      gyroMode: mode === 'gyro', gyroTilt: 0,
      qteActive: false, qteTimer: 0, qteMaxTimer: 10, qteCount: 0, qteFired: [],
      dustParticles: [],
      cameraShake: { x: 0, y: 0, intensity: 0 },
      failTime: 0,
      winTime: 0,
    };
    randomizeGuyPositions();
    showScreen('game-screen');
    document.getElementById('vignette').style.opacity = '0';
    // Start music without resetting it to 0
    if (bgMusic && bgMusic.paused) {
      bgMusic.play().catch(() => {}); // autoplay may fail without user gesture
    }
    loopId = requestAnimationFrame(loop);
  }

  function restart() { start(state.gyroMode ? 'gyro' : 'touch'); }

  function stopMusic() {
    if (bgMusic) {
      bgMusic.pause();
      bgMusic.currentTime = 0;
    }
  }

  // === MAIN LOOP ===
  function loop(now) {
    if (!state.lastTime) state.lastTime = now;
    let dt = (now - state.lastTime) / 1000;
    if (dt < 0) dt = 0;
    dt = Math.min(dt, 0.05); // cap delta
    state.lastTime = now;
    
    if (state.running) {
      state.elapsed += dt;

      if (state.elapsed >= CFG.DURATION) { win(); return; }

      // Grace period: can't fail
      const canFail = state.elapsed >= CFG.GRACE_PERIOD;

      updatePhysics(dt);
      updateQTE(dt);
      updateEffects(dt);
      updateHUD();
      
      if (canFail && Math.abs(state.balance) >= CFG.FAIL_ANGLE) { fail(); }
    } else if (state.failed) {
      state.failTime += dt;
      updateEffects(dt); // still update dust/camera shake
    }

    render();

    // continue loop even if not running to play fail animation
    if (state.running || state.failed) {
      loopId = requestAnimationFrame(loop);
    }
  }

  // === PHYSICS (Inverted Pendulum) ===
  function updatePhysics(dt) {
    if (state.qteActive) return; // freeze during QTE

    const t = state.elapsed;

    // Grace period: no fail in first few seconds
    if (t < CFG.GRACE_PERIOD) {
      state.balance *= 0.95; // auto-center during grace
    }

    // Early-game easing: ramp over first 5 seconds
    const earlyEase = Math.min(1, t / 5);

    // Difficulty: sqrt-based scaling (starts gentle, gets brutal)
    const diffFactor = (0.4 + Math.sqrt(t / CFG.DURATION) * 1.4) * earlyEase;

    // Gravity: always pulls toward current lean direction (self-reinforcing!)
    const gravityPull = Math.sign(state.balance) * CFG.GRAVITY_BASE * diffFactor * dt;

    // Random disturbances with sine wave overlay
    const sineWave = Math.sin(t * 0.42) * 0.6 + Math.sin(t * 1.1) * 0.4 + Math.sin(t * 2.7) * 0.2;
    const randomKick = (Math.random() - 0.5) * 2.0;
    const disturbance = (sineWave + randomKick) * CFG.DISTURB_BASE * diffFactor * dt;

    // Sudden jerks – more frequent and stronger
    let jerk = 0;
    if (t > 30 && Math.random() < 0.012 * diffFactor) {
      jerk = (Math.random() - 0.5) * 30;
      triggerShake(0.3);
    }
    if (t > 90 && Math.random() < 0.015 * diffFactor) {
      jerk += (Math.random() - 0.5) * 22;
      triggerShake(0.4);
    }
    if (t > 140 && Math.random() < 0.02) {
      jerk += (Math.random() - 0.5) * 25;
      triggerShake(0.5);
    }
    // Rodeo finale: constant chaos
    if (t > 160) {
      jerk += (Math.random() - 0.5) * 15;
    }

    // Player correction
    let correction = 0;
    if (state.gyroMode) {
      let tilt = state.gyroTilt || 0;
      if (Math.abs(tilt) < 3) tilt = 0; // slight deadzone to prevent drift
      // Clamp between -45 and 45 for max correction
      tilt = Math.max(-45, Math.min(45, tilt));
      // Map -45..45 directly to -CORRECTION_SPEED..CORRECTION_SPEED
      correction = (tilt / 45) * CFG.CORRECTION_SPEED * dt;
    } else {
      if (state.inputLeft) correction -= CFG.CORRECTION_SPEED * dt;
      if (state.inputRight) correction += CFG.CORRECTION_SPEED * dt;
    }

    state.balance += gravityPull + disturbance + jerk + correction;
    state.balance = Math.max(-90, Math.min(90, state.balance));

    // Spawn dust when horse bucks hard
    if (Math.abs(disturbance) > 1.2 || Math.abs(jerk) > 4) {
      spawnDust();
    }

    // Dynamic music volume – louder as it gets intense
    if (bgMusic) {
      const vol = 0.4 + Math.min(0.6, t / CFG.DURATION * 0.6);
      bgMusic.volume = vol;
    }
  }

  // === QTE SYSTEM ===
  function updateQTE(dt) {
    // Check if we should fire a QTE
    CFG.QTE_TIMES.forEach((time, i) => {
      if (state.elapsed >= time && !state.qteFired.includes(i)) {
        state.qteFired.push(i);
        startQTE();
      }
    });

    if (!state.qteActive) return;
    state.qteTimer -= dt;

    const pct = Math.max(0, state.qteTimer / state.qteMaxTimer);
    document.getElementById('qte-timer-fill').style.width = (pct * 100) + '%';

    if (state.qteTimer <= 0) { endQTE(false); }
  }

  function startQTE() {
    state.qteActive = true;
    
    // Scale duration from QTE_DURATION_START to QTE_DURATION_END
    const progress = Math.min(state.qteCount / 3, 1.0); // 0.0, 0.33, 0.66, 1.0
    const duration = CFG.QTE_DURATION_START - (CFG.QTE_DURATION_START - CFG.QTE_DURATION_END) * progress;
    
    state.qteMaxTimer = duration;
    state.qteTimer = duration;
    state.qteCount++;

    // 0 = Wähle das Wort, 1 = Wähle die Farbe
    state.qteMode = Math.random() < 0.5 ? 0 : 1;
    
    // Pick 3 unique colors for the buttons
    let choices = [...STROOP_COLORS].sort(() => 0.5 - Math.random()).slice(0, 3);
    
    // Pick one as the correct answer
    let correctIdx = Math.floor(Math.random() * 3);
    let correctItem = choices[correctIdx];
    
    const instrEl = document.getElementById('qte-instruction');
    if (state.qteMode === 0) {
      instrEl.innerHTML = `Wähle das Wort:<br><span style="color:white; font-size: 2rem;">${correctItem.name.toUpperCase()}</span>`;
    } else {
      instrEl.innerHTML = `Wähle die Farbe:<br><span style="color:white; font-size: 2rem;">${correctItem.name.toUpperCase()}</span>`;
    }
    
    document.getElementById('qte-target').style.display = 'none';
    
    // Setup the 3 buttons
    for (let i = 0; i < 3; i++) {
       let btn = document.getElementById(`qte-btn-${i}`);
       let btnWord, btnColorHex;
       
       if (state.qteMode === 0) {
           btnWord = choices[i].name.toUpperCase();
           let otherColors = STROOP_COLORS.filter(c => c.name !== choices[i].name);
           btnColorHex = otherColors[Math.floor(Math.random() * otherColors.length)].hex;
       } else {
           btnColorHex = choices[i].hex;
           let otherWords = STROOP_COLORS.filter(c => c.hex !== choices[i].hex);
           btnWord = otherWords[Math.floor(Math.random() * otherWords.length)].name.toUpperCase();
       }
       
       btn.textContent = btnWord;
       btn.style.color = btnColorHex;
       btn.style.textShadow = '1px 1px 3px #000, -1px -1px 3px #000, 1px -1px 3px #000, -1px 1px 3px #000';
       
       // remove old listeners
       const newBtn = btn.cloneNode(true);
       btn.parentNode.replaceChild(newBtn, btn);
       newBtn.onclick = () => {
           if (i === correctIdx) endQTE(true);
           else endQTE(false);
       };
    }

    document.getElementById('qte-overlay').classList.remove('hidden');
    triggerShake(0.6);
  }

  function endQTE(success) {
    state.qteActive = false;
    document.getElementById('qte-overlay').classList.add('hidden');
    if (success) {
      state.balance *= 0.1; // center balance
      triggerShake(0.4);
    } else {
      state.balance += (Math.random() > 0.5 ? 60 : -60);
      triggerShake(0.8);
    }
  }

  // === EFFECTS ===
  function updateEffects(dt) {
    const t = state.elapsed;

    // Camera shake decay
    if (state.cameraShake.intensity > 0) {
      state.cameraShake.intensity -= dt * 3;
      state.cameraShake.x = (Math.random() - 0.5) * state.cameraShake.intensity * 15;
      state.cameraShake.y = (Math.random() - 0.5) * state.cameraShake.intensity * 15;
    } else {
      state.cameraShake.x = 0;
      state.cameraShake.y = 0;
    }

    // Vignette in final phase
    const vignetteEl = document.getElementById('vignette');
    if (t > 120) {
      const vigIntensity = Math.min(1, (t - 120) / 60);
      vignetteEl.style.opacity = vigIntensity * 0.7;
    }

    // Update dust particles
    state.dustParticles = state.dustParticles.filter(p => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 80 * dt; // gravity on dust
      return p.life > 0;
    });

    // Update all guy animations independently
    guyAnims.forEach(guy => {
      if (guy.playing) {
        // Currently playing an animation sequence
        guy.timer += dt;
        if (guy.timer > guy.speed) {
          guy.timer = 0;
          guy.frame++;
          if (guy.frame >= GUY_FRAME_COUNT) {
            // Animation finished – go to cooldown
            guy.frame = 0;
            guy.playing = false;
            guy.cooldown = 2 + Math.random() * 6; // wait 2-8 seconds
            guy.cooldownTimer = 0;
          }
        }
      } else {
        // Waiting in cooldown
        guy.cooldownTimer += dt;
        if (guy.cooldownTimer >= guy.cooldown) {
          // Start a new animation!
          guy.playing = true;
          guy.frame = 0;
          guy.timer = 0;
          // Randomly pick front or back
          guy.view = Math.random() > 0.5 ? 'front' : 'back';
        }
      }
    });
  }

  function triggerShake(intensity) {
    state.cameraShake.intensity = Math.max(state.cameraShake.intensity, intensity);
  }

  function spawnDust() {
    for (let i = 0; i < 5; i++) {
      state.dustParticles.push({
        x: W / 2 + (Math.random() - 0.5) * 100,
        y: H * 0.60,
        vx: (Math.random() - 0.5) * 120,
        vy: -Math.random() * 60 - 20,
        life: 0.6 + Math.random() * 0.4,
        size: 3 + Math.random() * 6,
      });
    }
  }

  // === HUD ===
  function updateHUD() {
    const remaining = Math.max(0, CFG.DURATION - state.elapsed);
    const min = Math.floor(remaining / 60);
    const sec = Math.floor(remaining % 60);
    document.getElementById('timer-display').textContent =
      `${min}:${sec.toString().padStart(2, '0')}`;

    // Color timer red when low
    const timerEl = document.getElementById('timer-display');
    timerEl.style.color = remaining < 20 ? '#e74c3c' : '#fefefe';

    // Phase
    const phase = CFG.PHASES.find(p => state.elapsed >= p.start && state.elapsed < p.end)
      || CFG.PHASES[CFG.PHASES.length - 1];
    const phaseEl = document.getElementById('phase-display');
    phaseEl.textContent = phase.name;
    phaseEl.style.color = phase.color;

    // Balance indicator
    const indicator = document.getElementById('balance-indicator');
    const pct = 50 + (state.balance / CFG.FAIL_ANGLE) * 45;
    indicator.style.left = pct + '%';
    const absB = Math.abs(state.balance);
    if (absB < 25) {
      indicator.style.background = '#2ecc71';
      indicator.style.boxShadow = '0 0 12px rgba(46,204,113,0.5)';
    } else if (absB < 55) {
      indicator.style.background = '#f39c12';
      indicator.style.boxShadow = '0 0 12px rgba(243,156,18,0.5)';
    } else {
      indicator.style.background = '#e74c3c';
      indicator.style.boxShadow = '0 0 12px rgba(231,76,60,0.5)';
    }
  }

  // === RENDER (Canvas) ===
  function render() {
    ctx.save();
    ctx.translate(state.cameraShake.x, state.cameraShake.y);
    ctx.clearRect(-20, -20, W + 40, H + 40);

    drawBackground();
    drawGuys();
    drawHorse();
    drawRider();
    drawDust();

    ctx.restore();
  }

  function drawBackground() {
    if (assets.bgLoaded) {
      ctx.drawImage(assets.bg, 0, 0, W, H);
    } else {
      // Placeholder: sky + arena
      const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.5);
      skyGrad.addColorStop(0, '#87CEEB');
      skyGrad.addColorStop(1, '#c9e8f7');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, H * 0.5);

      // Mountains
      ctx.fillStyle = '#8899aa';
      ctx.beginPath();
      ctx.moveTo(0, H * 0.45);
      ctx.lineTo(W * 0.15, H * 0.28);
      ctx.lineTo(W * 0.3, H * 0.42);
      ctx.lineTo(W * 0.5, H * 0.25);
      ctx.lineTo(W * 0.7, H * 0.4);
      ctx.lineTo(W * 0.85, H * 0.3);
      ctx.lineTo(W, H * 0.45);
      ctx.lineTo(W, H * 0.5);
      ctx.lineTo(0, H * 0.5);
      ctx.fill();

      // Arena ground
      const groundGrad = ctx.createLinearGradient(0, H * 0.5, 0, H);
      groundGrad.addColorStop(0, '#c9a35f');
      groundGrad.addColorStop(1, '#8B5E3C');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, H * 0.5, W, H * 0.5);

      // Fence
      ctx.fillStyle = '#5a3a1a';
      for (let x = 0; x < W; x += 120) {
        ctx.fillRect(x + 55, H * 0.78, 10, H * 0.22);
      }
      ctx.fillStyle = '#6b4423';
      ctx.fillRect(0, H * 0.82, W, 8);
      ctx.fillRect(0, H * 0.90, W, 8);

      // Crowd silhouettes
      ctx.fillStyle = 'rgba(60,40,30,0.4)';
      for (let x = 0; x < W; x += 18) {
        const h = 12 + Math.sin(x * 0.1 + state.elapsed * 3) * 4;
        ctx.beginPath();
        ctx.arc(x + 9, H * 0.5 - 5, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x + 5, H * 0.5 - 3, 8, h);
      }
    }
  }

  function drawGuys() {
    // Only draw if enough frames are loaded (at least some)
    if (assets.guysLoaded < GUY_FRAME_COUNT) return; // wait for at least 1 full set

    guyAnims.forEach(guy => {
      const frameSet = assets.guys[guy.name][guy.view];
      // If not playing, show frame 0 (idle pose)
      const frameIdx = guy.playing ? guy.frame : 0;
      const img = frameSet[frameIdx];
      if (!img || img.naturalWidth === 0) return;

      const drawW = img.naturalWidth * guy.scale;
      const drawH = img.naturalHeight * guy.scale;

      const dx = W * guy.x - drawW / 2;
      const dy = H - drawH; // feet at bottom of screen

      ctx.drawImage(img, dx, dy, drawW, drawH);
    });
  }

  function drawHorse() {
    const cx = W / 2;
    const groundY = H * 0.60; // Moved much higher up on the screen

    ctx.save();
    ctx.translate(cx, groundY);

    if (assets.horseFramesLoaded === HORSE_TOTAL_FRAMES) {
      // ===== CORRECT VISUAL FRAME MAPPING (verified by viewing each image) =====
      // 1.png  = idle (standing still, side view)
      // 2.png  = run (trotting, one leg up)
      // 3.png  = front (rider+horse facing camera – used for QTE)
      // 4.png  = run_2 (galloping, alternate leg position)
      // 5.png  = VICTORY JUBEL (arms up, laughing – WIN STATE ONLY)
      // 6.png  = fall_start (rider flying off, horse bucking down)
      // 7.png  = idle_2 (standing, slightly different pose)
      // 8.png  = idle_3 (standing still, head turned right)
      // 9.png  = buck (wild bucking, rider leaning left, scared face)
      // 10.png = gallop (fast run to the right, hair flowing)
      // 11.png = buck_2 (horse rearing up on hind legs)
      // 12.png = fall_mid (rider flying off, arms up – mid-air)
      // 13.png = fall_end (rider on ground, horse standing – GAME OVER final)
      // 14.png = run_3 (walking/trotting, similar to 2 but mirrored feel)
      // 15.png = idle_start (standing completely still, calm)

      let frameId = 15; // default: standing still at start

      if (state.won) {
        // WIN: Show victory jubel!
        frameId = 5;
      } else if (state.failed) {
        // FALL SEQUENCE: 6 → 12 → 13 (stay on 13)
        const t = Math.min(1, state.failTime / 2.0);
        if (t < 0.3) frameId = 6;       // initial throw-off
        else if (t < 0.7) frameId = 12;  // mid-air
        else frameId = 13;               // on the ground
      } else if (state.elapsed < CFG.GRACE_PERIOD) {
        // GRACE PERIOD: calm idle
        frameId = 15;
      } else if (state.qteActive) {
        // QTE: front-facing view
        frameId = 3;
      } else if (state.elapsed > 160) {
        // RODEO FINALE: rapid wild bucking
        const buckPhase = Math.floor(state.elapsed * 8) % 4;
        if (buckPhase === 0) frameId = 9;       // buck
        else if (buckPhase === 1) frameId = 11;  // buck_2 (rearing)
        else if (buckPhase === 2) frameId = 10;  // fast gallop
        else frameId = 9;                        // buck again
      } else if (Math.abs(state.balance) > 50) {
        // HEAVY TILT: violently toggle between buck and rear to show loss of control
        const step = Math.floor(state.elapsed * 10);
        frameId = step % 2 === 0 ? 9 : 11;
      } else if (Math.abs(state.balance) > 30) {
        // MODERATE TILT: wild galloping and bucking
        const step = Math.floor(state.elapsed * 10);
        frameId = step % 2 === 0 ? 10 : (state.balance < 0 ? 9 : 11);
      } else {
        // NORMAL RODEO: Chaotic, unpredictable mix of movements instead of a smooth run
        const speed = 8; // 8 frames per second
        const step = Math.floor(state.elapsed * speed);
        // Pseudo-random seeded by step
        const rand = Math.abs(Math.sin(step * 43.21)) * 100;
        
        if (rand < 25) frameId = 9;       // wild bucking
        else if (rand < 50) frameId = 11; // rearing up
        else if (rand < 70) frameId = 10; // fast gallop
        else if (rand < 80) frameId = 4;  // run_2
        else if (rand < 90) frameId = 2;  // run
        else frameId = 14;                // run_3
      }

      const img = assets.horseFrames[frameId];
      if (img && img.naturalWidth) {
        // Significantly larger horse: take up more screen width, especially on mobile!
        // Take up 90% of screen width, or at least 380px, max 700px.
        const targetW = Math.min(Math.max(W * 0.9, 380), 700);
        const s = targetW / img.naturalWidth;
        const dw = img.naturalWidth * s;
        const dh = img.naturalHeight * s;
        ctx.drawImage(img, -dw / 2, -dh, dw, dh);
      }
    }

    ctx.restore();
  }

  function drawRider() {
    // Rider is now part of the horse_state_*.jpeg frames!
    // No need to draw a separate rider anymore.
  }

  function drawDust() {
    state.dustParticles.forEach(p => {
      ctx.fillStyle = `rgba(180,150,100,${p.life})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // === WIN / FAIL ===
  function win() {
    state.running = false;
    state.won = true;
    state.winTime = 0;
    // Keep rendering to show victory frame
    const victoryLoop = (now) => {
      const dt = (now - state.lastTime) / 1000;
      state.lastTime = now;
      state.winTime += dt;
      updateEffects(dt);
      render();
      if (state.winTime < 3) {
        requestAnimationFrame(victoryLoop);
      } else {
        state.won = false;
        stopMusic();
        showScreen('win-screen');
        spawnConfetti();
      }
    };
    requestAnimationFrame(victoryLoop);
  }

  function fail() {
    state.running = false;
    state.failed = true;
    state.failTime = 0;
    const sec = Math.floor(state.elapsed);
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    document.getElementById('fail-time').textContent =
      `${min}:${s.toString().padStart(2, '0')}`;
    // Shake the canvas
    const gc = document.getElementById('game-screen');
    gc.classList.add('shake-heavy');
    setTimeout(() => {
      gc.classList.remove('shake-heavy');
      setTimeout(() => {
        showScreen('fail-screen');
        state.failed = false;
      }, 2000); // longer delay to show full fall animation
    }, 600);
  }

  // === CONFETTI ===
  function spawnConfetti() {
    const container = document.getElementById('confetti-container');
    container.innerHTML = '';
    const colors = ['#f5c542','#e74c3c','#2ecc71','#3498db','#9b59b6','#e67e22','#fff'];
    for (let i = 0; i < 80; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + '%';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.width = (6 + Math.random() * 8) + 'px';
      piece.style.height = (6 + Math.random() * 8) + 'px';
      piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      piece.style.animationDuration = (2 + Math.random() * 3) + 's';
      piece.style.animationDelay = Math.random() * 2 + 's';
      container.appendChild(piece);
    }
  }

  // Init on load
  window.addEventListener('DOMContentLoaded', init);

  return { start, restart };
})();
