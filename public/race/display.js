const DISPLAY_POLL_MS = {
  waiting: 450,
  racing: 120,
  results: 350,
  complete: 600
};

const ROUND_DURATION_SECONDS = 30;
const DISPLAY_TRACK_LENGTH = 14000;

const refs = {
  roundNum: document.getElementById('round-num'),
  timer: document.getElementById('timer'),
  timerBadge: document.getElementById('timer-badge'),
  timerStatus: document.getElementById('timer-status'),
  hudQr: document.getElementById('hud-qr'),
  trackContainer: document.getElementById('track-container'),
  waitingState: document.getElementById('waiting-state'),
  lobbyHold: document.getElementById('lobby-hold'),
  lobbyLayer: document.getElementById('lobby-layer'),
  raceLayer: document.getElementById('race-layer'),
  resultsScreen: document.getElementById('results-screen'),
  resultsKicker: document.getElementById('results-kicker'),
  resultsTitle: document.getElementById('results-title'),
  resultsSubtitle: document.getElementById('results-subtitle'),
  resultsBoardHeading: document.getElementById('results-board-heading'),
  resultsGrid: document.getElementById('results-grid'),
  roundResults: document.getElementById('round-results'),
  podiumScreen: document.getElementById('podium-screen'),
  podium: document.getElementById('podium'),
  remainingGrid: document.getElementById('remaining-grid'),
  finishLine: document.querySelector('.finish-line-area')
};

const runtime = {
  state: null,
  polling: false,
  pollTimer: null,
  lastFrame: performance.now(),
  lobbySprites: new Map(),
  raceSprites: new Map(),
  raceOrder: [],
  decorativeSprites: new Map()
};

function formatTimer(totalSeconds) {
  const seconds = Math.max(0, totalSeconds);
  const minutesPart = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secondsPart = (seconds % 60).toString().padStart(2, '0');
  return `${minutesPart}:${secondsPart}`;
}

function formatLaneNumber(player) {
  return String((player?.laneIndex ?? 0) + 1).padStart(2, '0');
}

function getLobbyPlayers(state) {
  const roundNumber = state.currentRound || 1;

  return Object.values(state.players)
    .filter((player) => player.visible && !player.eliminated && player.currentRound === roundNumber)
    .sort((a, b) => (a.laneIndex ?? 0) - (b.laneIndex ?? 0));
}

function getRaceParticipants(state) {
  const round = state.rounds[state.currentRound];
  if (!round || !Array.isArray(round.participants)) {
    return [];
  }

  return round.participants
    .map((playerId) => ({
      playerId,
      player: state.players[playerId],
      distance: round.positions[playerId] || 0,
      velocity: round.velocities?.[playerId] || 0
    }))
    .filter((entry) => entry.player && !entry.player.eliminated && entry.player.visible)
    .sort((a, b) => (a.player.laneIndex ?? 0) - (b.player.laneIndex ?? 0));
}

function buildRankingMap(rankings = []) {
  const rankingMap = new Map();

  rankings.forEach((entry, index) => {
    rankingMap.set(entry.playerId, index + 1);
  });

  return rankingMap;
}

function setPlaceholder(text) {
  refs.waitingState.textContent = text;
  refs.waitingState.hidden = false;
}

function hidePlaceholder() {
  refs.waitingState.hidden = true;
}

function hideResults() {
  refs.resultsScreen.hidden = true;
  refs.roundResults.hidden = false;
  refs.podiumScreen.hidden = true;
  refs.resultsGrid.innerHTML = '';
  refs.podium.innerHTML = '';
  refs.remainingGrid.innerHTML = '';
  runtime.decorativeSprites.clear();
}

function clearLobbySprites() {
  runtime.lobbySprites.forEach((sprite) => {
    sprite.el.remove();
  });
  runtime.lobbySprites.clear();
}

function clearRaceSprites() {
  runtime.raceSprites.forEach((sprite) => {
    sprite.lane.remove();
  });
  runtime.raceSprites.clear();
  runtime.raceOrder = [];
}

function createLobbySprite(player) {
  const random = CupcakeMotion.mulberry32(CupcakeMotion.hashString(player.id));
  const spriteEl = document.createElement('div');
  spriteEl.className = 'roaming-cake';
  spriteEl.dataset.playerId = player.id;
  spriteEl.innerHTML = generateCakeSVG(getCakeById(player.cakeId));
  refs.lobbyLayer.appendChild(spriteEl);

  return {
    playerId: player.id,
    el: spriteEl,
    angle: random() * Math.PI * 2,
    angularVelocity: (random() > 0.5 ? 1 : -1) * (0.28 + random() * 0.22),
    baseRadius: 240 + random() * 120,
    radiusWave: 18 + random() * 28,
    radiusSpeed: 0.65 + random() * 0.45,
    verticalScale: 0.62 + random() * 0.12,
    bobPhase: random() * Math.PI * 2,
    motion: CupcakeMotion.createProfile(player.id, 'idle')
  };
}

function getLobbyGeometry() {
  const layerRect = refs.lobbyLayer.getBoundingClientRect();
  const holdRect = refs.lobbyHold.getBoundingClientRect();

  return {
    width: refs.lobbyLayer.clientWidth,
    height: refs.lobbyLayer.clientHeight,
    centerX: holdRect.left - layerRect.left + holdRect.width / 2,
    centerY: holdRect.top - layerRect.top + holdRect.height / 2,
    keepOutRadius: Math.max(190, holdRect.width * 0.55)
  };
}

function syncLobby(state) {
  const players = getLobbyPlayers(state);
  const desiredIds = new Set(players.map((player) => player.id));

  refs.trackContainer.classList.add('free-roam');
  refs.hudQr.hidden = true;
  refs.lobbyHold.hidden = false;
  refs.finishLine.hidden = true;
  refs.lobbyLayer.hidden = players.length === 0;
  refs.raceLayer.hidden = true;
  refs.resultsScreen.hidden = true;
  hidePlaceholder();

  runtime.lobbySprites.forEach((sprite, playerId) => {
    if (!desiredIds.has(playerId)) {
      sprite.el.remove();
      runtime.lobbySprites.delete(playerId);
    }
  });

  players.forEach((player) => {
    if (!runtime.lobbySprites.has(player.id)) {
      runtime.lobbySprites.set(player.id, createLobbySprite(player));
    }
  });
}

function createRaceSprite(entry) {
  const lane = document.createElement('article');
  lane.className = 'race-lane';
  lane.dataset.playerId = entry.playerId;
  lane.innerHTML = `
    <div class="lane-meta">
      <span class="lane-position">${formatLaneNumber(entry.player)}</span>
      <span class="lane-name">${entry.player.name}</span>
    </div>
    <div class="lane-runway">
      <div class="lane-bg"></div>
      <div class="lane-leader-chip">LEADING</div>
      <div class="racer">${generateCakeSVG(getCakeById(entry.player.cakeId))}</div>
    </div>
  `;

  refs.raceLayer.appendChild(lane);

  return {
    playerId: entry.playerId,
    lane,
    positionLabel: lane.querySelector('.lane-position'),
    nameLabel: lane.querySelector('.lane-name'),
    runway: lane.querySelector('.lane-runway'),
    racer: lane.querySelector('.racer'),
    localPosition: entry.distance,
    serverPosition: entry.distance,
    serverVelocity: entry.velocity,
    syncedAt: performance.now(),
    motion: CupcakeMotion.createProfile(entry.playerId, 'race')
  };
}

function syncDecorativeSprites(container, selector, mode) {
  runtime.decorativeSprites.clear();

  container.querySelectorAll(selector).forEach((element) => {
    const seed = element.dataset.motionSeed || element.dataset.playerId || element.textContent || selector;
    runtime.decorativeSprites.set(`${mode}:${seed}:${runtime.decorativeSprites.size}`, {
      el: element,
      subject: element.querySelector('.cupcake-motion-subject') || element.querySelector('svg'),
      mode,
      motion: CupcakeMotion.createProfile(seed, mode),
      detailMotion: CupcakeMotion.createProfile(`${seed}:detail`, mode === 'card' ? 'podium' : mode)
    });
  });
}

function getRaceColumnCount(count) {
  if (count <= 8) {
    return 2;
  }
  if (count <= 18) {
    return 3;
  }
  if (count <= 36) {
    return 4;
  }
  return 5;
}

function syncRace(state) {
  const participants = getRaceParticipants(state);

  refs.trackContainer.classList.remove('free-roam');
  refs.hudQr.hidden = false;
  refs.lobbyHold.hidden = true;
  refs.finishLine.hidden = false;
  refs.lobbyLayer.hidden = true;
  refs.raceLayer.hidden = false;
  refs.resultsScreen.hidden = true;

  if (participants.length === 0) {
    clearRaceSprites();
    setPlaceholder('WAITING FOR PLAYERS...');
    return;
  }

  hidePlaceholder();

  const desiredIds = new Set(participants.map((entry) => entry.playerId));

  runtime.raceSprites.forEach((sprite, playerId) => {
    if (!desiredIds.has(playerId)) {
      sprite.lane.remove();
      runtime.raceSprites.delete(playerId);
    }
  });

  refs.raceLayer.style.gridTemplateColumns = `repeat(${getRaceColumnCount(participants.length)}, minmax(0, 1fr))`;

  const rankingMap = buildRankingMap(
    [...participants]
      .sort((a, b) => b.distance - a.distance)
      .map((entry) => ({ playerId: entry.playerId }))
  );
  const leaderId = participants.reduce((best, current) => {
    if (!best || current.distance > best.distance) {
      return current;
    }
    return best;
  }, null)?.playerId;

  participants.forEach((entry) => {
    let sprite = runtime.raceSprites.get(entry.playerId);

    if (!sprite) {
      sprite = createRaceSprite(entry);
      runtime.raceSprites.set(entry.playerId, sprite);
    }

    sprite.serverPosition = entry.distance;
    sprite.serverVelocity = entry.velocity;
    sprite.syncedAt = performance.now();

    if (!Number.isFinite(sprite.localPosition) || Math.abs(sprite.localPosition - entry.distance) > 320) {
      sprite.localPosition = entry.distance;
    }

    sprite.positionLabel.textContent = formatLaneNumber(entry.player);
    sprite.nameLabel.textContent = entry.player.name;
    sprite.lane.classList.toggle('leading', leaderId === entry.playerId && entry.distance > 0);
    sprite.lane.dataset.rank = String(rankingMap.get(entry.playerId) || '');
  });

  runtime.raceOrder = participants.map((entry) => entry.playerId);
}

function createResultCard(player) {
  return `
    <article class="result-card" data-player-id="${player.id}">
      <div class="result-card-cake cupcake-motion-shell" data-motion-seed="${player.id}">
        <div class="cupcake-motion-subject">${generateCakeSVG(getCakeById(player.cakeId))}</div>
      </div>
      <span class="result-card-name">${player.name}</span>
    </article>
  `;
}

function getTournamentStandings(state) {
  const rounds = Object.entries(state.rounds || {})
    .map(([roundNumber, round]) => ({ roundNumber: Number(roundNumber), round }))
    .sort((a, b) => b.roundNumber - a.roundNumber);
  const players = Object.values(state.players || {});
  const playerProgress = new Map();

  players.forEach((player) => {
    playerProgress.set(player.id, {
      player,
      furthestRound: player.currentRound || 1,
      roundRank: Number.MAX_SAFE_INTEGER
    });
  });

  rounds.forEach(({ roundNumber, round }) => {
    (round.rankings || []).forEach((entry, index) => {
      const progress = playerProgress.get(entry.playerId);
      if (!progress) {
        return;
      }

      if (roundNumber >= progress.furthestRound) {
        progress.furthestRound = roundNumber;
        progress.roundRank = index;
      }
    });
  });

  return [...playerProgress.values()]
    .sort((a, b) => {
      if (b.furthestRound !== a.furthestRound) {
        return b.furthestRound - a.furthestRound;
      }

      if (a.roundRank !== b.roundRank) {
        return a.roundRank - b.roundRank;
      }

      return (a.player.laneIndex ?? 0) - (b.player.laneIndex ?? 0);
    })
    .map((entry) => entry.player);
}

function renderRoundResults(state, result) {
  const winnerIds = new Set(result?.winners || []);
  const advancingPlayers = (result?.rankings || [])
    .filter((entry) => winnerIds.has(entry.playerId))
    .map((entry) => state.players[entry.playerId])
    .filter(Boolean);
  const cards = (result?.rankings || [])
    .filter((entry) => winnerIds.has(entry.playerId))
    .map((entry) => state.players[entry.playerId])
    .filter(Boolean)
    .map((player) => createResultCard(player))
    .join('');

  refs.roundResults.hidden = false;
  refs.podiumScreen.hidden = true;
  refs.resultsBoardHeading.textContent = 'ADVANCING CUPCAKES';
  refs.resultsGrid.style.gridTemplateColumns = `repeat(${Math.min(8, Math.max(1, advancingPlayers.length))}, minmax(0, 1fr))`;
  refs.resultsGrid.innerHTML = cards || '<p class="results-empty">Waiting for the next lineup.</p>';
  syncDecorativeSprites(refs.resultsGrid, '.result-card-cake', 'card');
}

function renderCompleteResults(state) {
  const standings = getTournamentStandings(state);
  const podiumEntries = [];

  if (standings[1]) {
    podiumEntries.push({ player: standings[1], step: 'second', label: '2' });
  }

  if (standings[0]) {
    podiumEntries.push({ player: standings[0], step: 'first', label: '1' });
  }

  if (standings[2]) {
    podiumEntries.push({ player: standings[2], step: 'third', label: '3' });
  }

  if (standings.length === 1) {
    podiumEntries.length = 0;
    podiumEntries.push({ player: standings[0], step: 'first', label: '1' });
  }

  refs.roundResults.hidden = true;
  refs.podiumScreen.hidden = false;

  refs.podium.innerHTML = podiumEntries.map((entry) => `
    <article class="podium-slot podium-slot-${entry.step}">
      <div class="podium-cake cupcake-motion-shell" data-motion-seed="${entry.player.id}">
        <div class="cupcake-motion-subject">${generateCakeSVG(getCakeById(entry.player.cakeId))}</div>
      </div>
      <div class="podium-step">${entry.label}</div>
      <div class="podium-name">${entry.player.name}</div>
    </article>
  `).join('');

  refs.remainingGrid.innerHTML = standings.slice(3).map((player) => `
    <article class="remaining-card">
      <div class="remaining-cake cupcake-motion-shell" data-motion-seed="${player.id}">
        <div class="cupcake-motion-subject">${generateCakeSVG(getCakeById(player.cakeId))}</div>
      </div>
      <span class="remaining-name">${player.name}</span>
    </article>
  `).join('');

  syncDecorativeSprites(refs.podiumScreen, '.podium-cake, .remaining-cake', 'podium');
}

function syncResults(state) {
  const result = state.lastResult || null;

  refs.trackContainer.classList.remove('free-roam');
  refs.hudQr.hidden = true;
  refs.lobbyHold.hidden = true;
  refs.finishLine.hidden = true;
  refs.lobbyLayer.hidden = true;
  refs.raceLayer.hidden = true;
  refs.resultsScreen.hidden = false;
  hidePlaceholder();

  if (state.status === 'complete') {
    refs.resultsScreen.dataset.mode = 'complete';
    refs.resultsKicker.textContent = 'RACE COMPLETE';
    refs.resultsTitle.textContent = 'Cupcake Podium';
    refs.resultsSubtitle.textContent = 'Top three up front. Everybody else below.';
    renderCompleteResults(state);
    return;
  }

  refs.resultsScreen.dataset.mode = 'round';
  refs.resultsKicker.textContent = result ? `ROUND ${result.roundNumber} COMPLETE` : 'ROUND COMPLETE';
  refs.resultsTitle.textContent = result ? `${result.winners.length} Cupcakes Advance` : 'Round Locked';
  refs.resultsSubtitle.textContent = result && result.nextRound
    ? `The next round is ready: ${result.winners.length} cupcakes move on to Round ${result.nextRound}.`
    : 'Waiting for the next start.';
  renderRoundResults(state, result);
}

function applyState(state) {
  runtime.state = state;
  refs.roundNum.textContent = state.status === 'results'
    ? state.lastResult?.nextRound || state.currentRound || 1
    : state.currentRound || 1;

  if (state.status === 'waiting') {
    clearRaceSprites();
    hideResults();
    syncLobby(state);
    return;
  }

  clearLobbySprites();
  refs.hudQr.hidden = false;
  refs.lobbyHold.hidden = true;

  if (state.status === 'racing') {
    hideResults();
    syncRace(state);
    return;
  }

  if (state.status === 'results' || state.status === 'complete') {
    clearRaceSprites();
    syncResults(state);
    return;
  }

  refs.trackContainer.classList.remove('free-roam');
  refs.hudQr.hidden = true;
  refs.finishLine.hidden = true;
  refs.lobbyLayer.hidden = true;
  refs.raceLayer.hidden = true;
  refs.resultsScreen.hidden = true;
  setPlaceholder('WAITING FOR PLAYERS...');
}

function updateHud() {
  const state = runtime.state;
  if (!state) {
    return;
  }

  if (state.status === 'racing' && state.rounds[state.currentRound]?.startTime) {
    const round = state.rounds[state.currentRound];
    const elapsed = Date.now() - round.startTime;
    const remaining = Math.max(0, ROUND_DURATION_SECONDS - Math.floor(elapsed / 1000));
    refs.timer.textContent = formatTimer(remaining);
    refs.timerStatus.style.display = 'block';
    refs.timerStatus.textContent = 'TAP TO RACE';

    if (remaining <= 5) {
      refs.timerBadge.classList.add('warning');
    } else {
      refs.timerBadge.classList.remove('warning');
    }

    return;
  }

  refs.timerBadge.classList.remove('warning');

  if (state.status === 'results' && state.lastResult) {
    refs.timer.textContent = formatTimer(0);
    refs.timerStatus.style.display = 'block';
    refs.timerStatus.textContent = `ROUND ${state.lastResult.roundNumber} DONE`;
    return;
  }

  if (state.status === 'complete') {
    refs.timer.textContent = formatTimer(0);
    refs.timerStatus.style.display = 'block';
    refs.timerStatus.textContent = 'FINAL PODIUM';
    return;
  }

  const visiblePlayers = getLobbyPlayers(state).length;
  refs.timer.textContent = formatTimer(ROUND_DURATION_SECONDS);
  refs.timerStatus.style.display = 'block';
  refs.timerStatus.textContent = visiblePlayers > 0
    ? `${visiblePlayers} ${visiblePlayers === 1 ? 'CUPCAKE' : 'CUPCAKES'} READY`
    : 'SCAN TO JOIN';
}

function animateLobby(now, dt) {
  if (runtime.lobbySprites.size === 0) {
    return;
  }

  const geometry = getLobbyGeometry();
  const maxX = Math.max(120, geometry.width - 100);
  const maxY = Math.max(120, geometry.height - 100);

  runtime.lobbySprites.forEach((sprite) => {
    sprite.angle += sprite.angularVelocity * dt;

    const radiusWave = Math.sin(now / 1000 * sprite.radiusSpeed + sprite.bobPhase) * sprite.radiusWave;
    const desiredRadius = Math.max(geometry.keepOutRadius + 36, sprite.baseRadius + radiusWave);
    const safeRadiusX = Math.max(geometry.keepOutRadius + 36, Math.min(desiredRadius, Math.min(geometry.centerX - 70, maxX - geometry.centerX + 30)));
    const safeRadiusY = Math.max(geometry.keepOutRadius * 0.68, Math.min(safeRadiusX * sprite.verticalScale, Math.min(geometry.centerY - 60, maxY - geometry.centerY + 20)));
    const motion = CupcakeMotion.computeTransform(sprite.motion, now, { intensity: 1 });
    const centerX = geometry.centerX + Math.cos(sprite.angle) * safeRadiusX;
    const centerY = geometry.centerY + Math.sin(sprite.angle) * safeRadiusY + motion.y;
    const direction = Math.cos(sprite.angle) >= 0 ? 1 : -1;
    const tilt = Math.sin(sprite.angle) * 8 + motion.rotate * 0.6;
    const x = Math.max(0, Math.min(maxX, centerX - 50));
    const y = Math.max(0, Math.min(maxY, centerY - 50));

    sprite.el.style.transform = `translate3d(${x + motion.x}px, ${y}px, 0) scale(${motion.scaleX * direction}, ${motion.scaleY}) rotate(${tilt}deg)`;
    sprite.el.style.zIndex = String(10 + Math.round(y));
  });
}

function animateRace(now, dt) {
  if (runtime.raceOrder.length === 0) {
    return;
  }

  runtime.raceOrder.forEach((playerId) => {
    const sprite = runtime.raceSprites.get(playerId);
    if (!sprite) {
      return;
    }

    const elapsed = (now - sprite.syncedAt) / 1000;
    const predicted = sprite.serverPosition + sprite.serverVelocity * elapsed;
    const blend = Math.min(1, dt * 10);
    sprite.localPosition += (predicted - sprite.localPosition) * blend;

    if (Math.abs(predicted - sprite.localPosition) < 0.5) {
      sprite.localPosition = predicted;
    }
  });

  runtime.raceOrder.forEach((playerId, index) => {
    const sprite = runtime.raceSprites.get(playerId);
    if (!sprite) {
      return;
    }

    const runwayWidth = Math.max(0, sprite.runway.clientWidth - sprite.racer.clientWidth - 10);
    const progress = Math.min(0.985, sprite.localPosition / DISPLAY_TRACK_LENGTH);
    const x = runwayWidth * progress;
    const motion = CupcakeMotion.computeTransform(sprite.motion, now, {
      velocity: sprite.serverVelocity,
      intensity: 0.8 + Math.min(0.45, sprite.serverVelocity / 380)
    });

    sprite.racer.style.transform = `translate3d(${x + motion.x}px, ${motion.y}px, 0) rotate(${motion.rotate}deg) scale(${motion.scaleX}, ${motion.scaleY})`;
  });
}

function animateDecorativeCupcakes(now) {
  if (runtime.decorativeSprites.size === 0) {
    return;
  }

  runtime.decorativeSprites.forEach((sprite) => {
    const context = sprite.mode === 'podium'
      ? { intensity: 0.4, baseScale: 1 }
      : sprite.mode === 'card'
        ? { intensity: 0.32, baseScale: 1 }
        : { intensity: 0.35, baseScale: 1 };
    const detailContext = sprite.mode === 'podium'
      ? { intensity: 1.45, baseScale: 1 }
      : sprite.mode === 'card'
        ? { intensity: 1.7, baseScale: 1.02 }
        : { intensity: 1.15, baseScale: 1 };
    const shellMotion = CupcakeMotion.computeTransform(sprite.motion, now, context);
    const detailMotion = CupcakeMotion.computeTransform(sprite.detailMotion, now, detailContext);

    sprite.el.style.transform = `translate3d(${shellMotion.x}px, ${shellMotion.y}px, 0) rotate(${shellMotion.rotate * 0.35}deg)`;

    if (sprite.subject) {
      sprite.subject.style.transform = `translate3d(${detailMotion.x}px, ${detailMotion.y}px, 0) rotate(${detailMotion.rotate}deg) scale(${detailMotion.scaleX}, ${detailMotion.scaleY})`;
    }
  });
}

function frame(now) {
  const dt = Math.min(0.05, (now - runtime.lastFrame) / 1000);
  runtime.lastFrame = now;

  updateHud();

  if (runtime.state?.status === 'waiting') {
    animateLobby(now, dt);
  } else if (runtime.state?.status === 'racing') {
    animateRace(now, dt);
  } else if (runtime.state?.status === 'results' || runtime.state?.status === 'complete') {
    animateDecorativeCupcakes(now);
  }

  window.requestAnimationFrame(frame);
}

async function pollState() {
  if (runtime.polling) {
    return;
  }

  runtime.polling = true;

  try {
    const response = await fetch('/api/race/status');
    const state = await response.json();
    applyState(state);
  } catch (error) {
    console.error('Error fetching race state:', error);
  } finally {
    runtime.polling = false;
    const delay = DISPLAY_POLL_MS[runtime.state?.status] || DISPLAY_POLL_MS.waiting;
    runtime.pollTimer = window.setTimeout(pollState, delay);
  }
}

function renderQRCode(elementId, size) {
  const playUrl = `${window.location.origin}/race/play`;
  const element = document.getElementById(elementId);

  if (!element) {
    return;
  }

  element.innerHTML = '';

  new QRCode(element, {
    text: playUrl,
    width: size,
    height: size,
    colorDark: '#111',
    colorLight: '#fff'
  });
}

function initQRCode() {
  renderQRCode('qrcode', 600);
  renderQRCode('hud-qrcode', 88);
  renderQRCode('results-qrcode', 600);
}

window.addEventListener('load', () => {
  initQRCode();
  window.requestAnimationFrame(frame);
  pollState();
});
