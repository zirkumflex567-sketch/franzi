/* ============================================
   FRANZISKAS RODEO – GAME ENGINE
   Inverted-Pendulum Balance Game, 3 Min Survival
   ============================================ */

const Game = (() => {
  // === CONFIG ===
  const CFG = {
    DURATION: 180,          // 3 minutes in seconds
    FAIL_ANGLE: 85,         // degrees → game over
    CORRECTION_SPEED: 260,  // increased to give a fighting chance against insane gravity
    GRAVITY_BASE: 55,       // much stronger base pull
    DISTURB_BASE: 110,      // extremely wild disturbance
    HORSE_BOB_SPEED: 3,     
    GRACE_PERIOD: 0.5,      // only 0.5s invincibility
    QTE_TIMES: [45, 90, 130, 179], // 4 QTEs (Last one exactly 1s before 180s ends)
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
    { name: 'Pink', hex: '#ff9ff3' },
    { name: 'Grau', hex: '#95a5a6' },
    { name: 'Braun', hex: '#8B4513' },
    { name: 'Cyan', hex: '#00ffff' },
    { name: 'Beige', hex: '#f5f5dc' },
    { name: 'Türkis', hex: '#1abc9c' }
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
    soundEnabled: true,   // global sound state
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
    scale: 1.4,                         // Balanced for landscape mode
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
    let totalAssets = 1 + HORSE_TOTAL_FRAMES + GUY_TOTAL_IMAGES + 1; // bg + horse + guys + audio
    let loadedCount = 0;

    function updateProgress() {
      loadedCount++;
      const pct = Math.floor((loadedCount / totalAssets) * 100);
      const bar = document.getElementById('loading-bar');
      const text = document.getElementById('loading-text');
      
      const fakeMax = 69;
      const fakeCount = Math.floor((loadedCount / totalAssets) * fakeMax);
      
      if (bar) bar.style.width = pct + '%';
      if (text) text.textContent = `Lade... ${fakeCount} / ${fakeMax}`;

      if (loadedCount >= totalAssets) {
        text.textContent = "ALLES BEREIT!";
        const startBtn = document.getElementById('btn-start-intro');
        if (startBtn) startBtn.classList.remove('hidden');
      }
    }

    assets.bg.onload = () => { assets.bgLoaded = true; updateProgress(); };
    assets.bg.onerror = () => { assets.bgLoaded = false; updateProgress(); };
    assets.bg.src = 'assets/arena.jpeg';

    // Init background music
    bgMusic = new Audio();
    bgMusic.addEventListener('canplaythrough', () => {
      if (!bgMusic.loadedFlag) {
        bgMusic.loadedFlag = true;
        updateProgress();
      }
    });
    bgMusic.onerror = () => { if(!bgMusic.loadedFlag) { bgMusic.loadedFlag=true; updateProgress(); } };
    bgMusic.loop = true;
    bgMusic.volume = 0.5;
    bgMusic.src = 'assets/rodeo.mp3';
    bgMusic.load();

    // Load Horse States (1 to 15)
    for (let i = 1; i <= HORSE_TOTAL_FRAMES; i++) {
      assets.horseFrames[i].onload = () => { assets.horseFramesLoaded++; updateProgress(); };
      assets.horseFrames[i].onerror = updateProgress;
      assets.horseFrames[i].src = `assets/${i}.png`;
    }

    // Load all guy frames
    GUY_NAMES.forEach(name => {
      GUY_VIEWS.forEach(view => {
        for (let i = 0; i < GUY_FRAME_COUNT; i++) {
          const imgNum = (i + 1).toString().padStart(2, '0');
          const key = name + view;
          assets.guys[name][view][i].onload = () => { assets.guysLoaded++; updateProgress(); };
          assets.guys[name][view][i].onerror = updateProgress;
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
    // Check URL for difficulty parameter
    const params = new URLSearchParams(window.location.search);
    const diffParam = params.get('diff');
    if (diffParam) {
      const diffMultiplier = parseFloat(diffParam);
      if (!isNaN(diffMultiplier) && diffMultiplier > 0) {
        CFG.GRAVITY_BASE *= diffMultiplier;
        CFG.DISTURB_BASE *= diffMultiplier;
        console.log(`Difficulty scaled by ${diffMultiplier}`);
      }
    }

    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    loadAssets();
    setupInput();

    // Init background music
    // (Audio is now loaded in loadAssets)
    
    // READ URL PARAMETERS (Difficulty & Debug)
    const urlParams = new URLSearchParams(window.location.search);
    const diffParam = urlParams.get('diff');
    if (diffParam) {
      const d = parseFloat(diffParam);
      if (!isNaN(d) && d > 0) {
        console.log("Applying difficulty multiplier:", d);
        CFG.GRAVITY_BASE *= d;
        CFG.DISTURB_BASE *= d;
        CFG.CORRECTION_SPEED *= (1 + (d - 1) * 0.5); // Adjust correction slightly to keep it playable
      }
    }
    const debugParam = urlParams.get('debug');
    if (debugParam === 'true') {
      const dbgBtn = document.getElementById('btn-debug-jump');
      if (dbgBtn) dbgBtn.classList.remove('hidden');
    }
  }

  // === DEBUG FUNCTIONS ===
  function jumpToLastEvent() {
    if (!state.running) return;
    // Jump to 1s before end (Last event is at 179s)
    state.elapsed = 178.5;
    console.log("Debug: Jumped to 178.5s");
  }

  // === INTRO PLAYER ===
  function playIntro() {
    // Request Fullscreen on user gesture to hide browser UI
    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen().catch(() => {});
      }
    } catch(e) {}

    showScreen('intro-screen');
    const vid = document.getElementById('intro-video');
    const skipBtn = document.getElementById('btn-skip-intro');
    
    vid.src = 'assets/intro_merged.mp4';
    vid.muted = !state.soundEnabled;
    vid.play().catch(() => {
      console.warn("Autoplay failed, waiting for user click...");
    });

    const finishIntro = () => {
      vid.pause();
      skipBtn.classList.add('hidden');
      document.getElementById('start-overlay').classList.remove('hidden');
    };

    vid.onended = finishIntro;
    skipBtn.onclick = finishIntro;
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

    // Touch / Mouse – Screen halves
    const handleStart = (e) => {
      if (state.qteActive) return; // QTE has its own buttons
      e.preventDefault();
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      if (x < window.innerWidth / 2) state.inputLeft = true;
      else state.inputRight = true;
    };
    const handleEnd = (e) => {
      e.preventDefault();
      state.inputLeft = false;
      state.inputRight = false;
    };

    canvas.addEventListener('touchstart', handleStart);
    canvas.addEventListener('touchend', handleEnd);
    canvas.addEventListener('mousedown', handleStart);
    canvas.addEventListener('mouseup', handleEnd);
    canvas.addEventListener('mouseleave', handleEnd);

    // Sound Toggle
    const soundBtn = document.getElementById('btn-sound-toggle');
    const toggleSound = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      state.soundEnabled = !state.soundEnabled;
      
      // Update Button Icon
      soundBtn.textContent = state.soundEnabled ? '🔊' : '🔈';

      // Update Music
      if (bgMusic) {
        if (state.soundEnabled) {
          if (state.running && bgMusic.paused) bgMusic.play().catch(() => {});
        } else {
          bgMusic.pause();
        }
      }

      // Update active videos
      const vids = document.querySelectorAll('video');
      vids.forEach(v => {
        v.muted = !state.soundEnabled;
      });
    };
    soundBtn.addEventListener('click', toggleSound);
    soundBtn.addEventListener('touchstart', toggleSound);
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
    
    let tilt = 0;
    const angle = (window.orientation !== undefined) ? window.orientation : (screen.orientation ? screen.orientation.angle : 0);
    const normAngle = ((angle % 360) + 360) % 360;

    if (normAngle === 90) {
      tilt = -e.beta;
    } else if (normAngle === 270) {
      tilt = e.beta;
    } else if (normAngle === 180) {
      tilt = -e.gamma;
    } else {
      tilt = e.gamma;
    }

    if (typeof tilt !== 'number' || isNaN(tilt)) tilt = 0;

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

    // Try to force fullscreen and lock portrait mode
    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } catch(e) {}

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
    // Start music only if enabled
    if (bgMusic && bgMusic.paused && state.soundEnabled) {
      bgMusic.play().catch(() => {});
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

    // Early-game easing: ramp over first 2 seconds (starts brutally fast)
    const earlyEase = Math.min(1, t / 2);

    // Difficulty: steeper scaling
    const diffFactor = (0.5 + Math.sqrt(t / CFG.DURATION) * 1.6) * earlyEase;

    // Gravity: always pulls toward current lean direction (self-reinforcing!)
    const gravityPull = Math.sign(state.balance) * CFG.GRAVITY_BASE * diffFactor * dt;

    // Random disturbances with sine wave overlay
    const sineWave = Math.sin(t * 0.42) * 0.6 + Math.sin(t * 1.1) * 0.4 + Math.sin(t * 2.7) * 0.2;
    const randomKick = (Math.random() - 0.5) * 2.0;
    const disturbance = (sineWave + randomKick) * CFG.DISTURB_BASE * diffFactor * dt;

    // Sudden jerks – much more frequent and brutal
    let jerk = 0;
    if (t > 15 && Math.random() < 0.02 * diffFactor) {
      jerk = (Math.random() - 0.5) * 45;
      triggerShake(0.4);
    }
    if (t > 60 && Math.random() < 0.025 * diffFactor) {
      jerk += (Math.random() - 0.5) * 40;
      triggerShake(0.6);
    }
    if (t > 120 && Math.random() < 0.035) {
      jerk += (Math.random() - 0.5) * 55;
      triggerShake(0.7);
    }
    // Rodeo finale: constant chaos
    if (t > 150) {
      jerk += (Math.random() - 0.5) * 35;
    }

    // Player correction (Keyboard always works, Gyro is additive/alternative)
    let correction = 0;
    if (state.inputLeft) correction -= CFG.CORRECTION_SPEED * dt;
    if (state.inputRight) correction += CFG.CORRECTION_SPEED * dt;

    if (state.gyroMode) {
      let tilt = state.gyroTilt || 0;
      if (Math.abs(tilt) < 3) tilt = 0; // slight deadzone to prevent drift
      tilt = Math.max(-45, Math.min(45, tilt));
      correction += (tilt / 45) * CFG.CORRECTION_SPEED * dt;
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
    
    // Pick 6 unique colors for the buttons
    let choices = [...STROOP_COLORS].sort(() => 0.5 - Math.random()).slice(0, 6);
    
    // Pick one as the correct answer
    let correctIdx = Math.floor(Math.random() * 6);
    let correctItem = choices[correctIdx];
    
    const instrEl = document.getElementById('qte-instruction');
    
    // Randomize the color of the target instruction text to cause maximum confusion
    let targetTextColor = STROOP_COLORS[Math.floor(Math.random() * STROOP_COLORS.length)].hex;
    
    if (state.qteMode === 0) {
      instrEl.innerHTML = `Wähle das Wort:<br><span style="color:${targetTextColor}; font-size: 2rem;">${correctItem.name.toUpperCase()}</span>`;
    } else {
      instrEl.innerHTML = `Wähle die Farbe:<br><span style="color:${targetTextColor}; font-size: 2rem;">${correctItem.name.toUpperCase()}</span>`;
    }
    
    document.getElementById('qte-target').style.display = 'none';
    
    // Setup the 6 buttons
    for (let i = 0; i < 6; i++) {
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
        y: H * 0.70,
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
    const groundY = H * 0.70; // Adjusted for landscape mode (slightly lower relative to H)

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
      } else if (state.elapsed > 150) {
        // RODEO FINALE: fast but sequenced bucking
        const finaleFrames = [9, 11, 9, 10, 11, 4];
        frameId = finaleFrames[Math.floor(state.elapsed * 7) % 6];
      } else if (Math.abs(state.balance) > 50) {
        // HEAVY TILT: desperate struggle
        const heavyFrames = [9, 11, 10, 9, 11, 4];
        frameId = heavyFrames[Math.floor(state.elapsed * 6) % 6];
      } else if (Math.abs(state.balance) > 30) {
        // MODERATE TILT: galloping and bucking mix
        const modFrames = [10, 9, 4, 11, 2, 14];
        frameId = modFrames[Math.floor(state.elapsed * 6) % 6];
      } else {
        // NORMAL RODEO: Smooth running with occasional organized bucking sequences
        const step = Math.floor(state.elapsed * 5); // 5 frames per second
        const sequenceIdx = Math.floor(step / 6);   // changes every 1.2 seconds
        
        // 40% chance to do a bucking sequence instead of a run sequence
        const isBucking = Math.abs(Math.sin(sequenceIdx * 123.45)) > 0.6; 
        
        if (isBucking) {
           const buckFrames = [10, 9, 11, 9, 4, 14];
           frameId = buckFrames[step % 6];
        } else {
           const runFrames = [2, 4, 10, 14, 2, 7];
           frameId = runFrames[step % 6];
        }
      }

      const img = assets.horseFrames[frameId];
      if (img && img.naturalWidth) {
        // Landscape optimization: scale relative to height H rather than width W
        const targetW = Math.min(Math.max(H * 1.2, 380), 800);
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
    stopMusic();
    showScreen('win-screen');
    const vid = document.getElementById('win-video');
    if (vid) {
      vid.currentTime = 0;
      vid.play().catch(e => console.error("Video play failed:", e));
    }
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
  return { start, restart, playIntro, jumpToLastEvent };
})();
