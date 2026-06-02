const DISPLAY_POLL_MS = {
  waiting: 450,
  racing: 120,
  results: 350,
  complete: 600
};

const ROUND_DURATION_SECONDS = 15;
const DISPLAY_TRACK_LENGTH = 14000;
const VERTICAL_RACING_THRESHOLD = 20;

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
  resultsTitle: document.getElementById('results-title'),
  resultsGrid: document.getElementById('results-grid'),
  roundResults: document.getElementById('round-results'),
  podiumScreen: document.getElementById('podium-screen'),
  podium: document.getElementById('podium'),
  remainingGrid: document.getElementById('remaining-grid'),
  remainingSection: document.getElementById('remaining-section'),
  finishLine: document.querySelector('.finish-line-area'),
  countdownOverlay: document.getElementById('countdown-overlay'),
  countdownNumber: document.getElementById('countdown-number')
};

const runtime = {
  state: null,
  previousStatus: null,
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
  refs.raceLayer.classList.remove('vertical-racing');
  refs.trackContainer.classList.remove('vertical-racing');
  refs.raceLayer.style.removeProperty('--race-columns');
  refs.raceLayer.style.removeProperty('--race-rows');
  refs.raceLayer.style.removeProperty('grid-template-columns');
  refs.raceLayer.style.removeProperty('grid-template-rows');
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
  return count <= VERTICAL_RACING_THRESHOLD ? 1 : count;
}

function getRaceRowCount(count, columnCount) {
  return Math.max(1, Math.ceil(count / Math.max(1, columnCount)));
}

function isVerticalRacing(count) {
  return count > VERTICAL_RACING_THRESHOLD;
}

function syncRace(state) {
  const participants = getRaceParticipants(state);

  refs.trackContainer.classList.remove('free-roam');
  refs.hudQr.hidden = true;
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

  const useVertical = isVerticalRacing(participants.length);
  refs.raceLayer.classList.toggle('vertical-racing', useVertical);
  refs.trackContainer.classList.toggle('vertical-racing', useVertical);

  const columnCount = useVertical ? participants.length : getRaceColumnCount(participants.length);
  const rowCount = useVertical ? 1 : getRaceRowCount(participants.length, columnCount);
  refs.raceLayer.style.setProperty('--race-columns', columnCount);
  refs.raceLayer.style.setProperty('--race-rows', rowCount);

  if (useVertical) {
    refs.raceLayer.style.gridTemplateColumns = `repeat(${columnCount}, minmax(0, 1fr))`;
    refs.raceLayer.style.gridTemplateRows = 'minmax(0, 1fr)';
  } else {
    refs.raceLayer.style.gridTemplateColumns = `repeat(${columnCount}, minmax(0, 1fr))`;
    refs.raceLayer.style.removeProperty('grid-template-rows');
  }

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
      <div class="result-card-cake">
        ${generateCakeSVG(getCakeById(player.cakeId))}
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
  refs.resultsGrid.style.gridTemplateColumns = `repeat(${Math.min(6, Math.max(1, advancingPlayers.length))}, minmax(0, 1fr))`;
  refs.resultsGrid.innerHTML = cards || '<p class="results-empty">Waiting for the next lineup.</p>';
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
      <div class="podium-cake">
        ${generateCakeSVG(getCakeById(entry.player.cakeId))}
      </div>
      <div class="podium-step">${entry.label}</div>
      <div class="podium-name">${entry.player.name}</div>
    </article>
  `).join('');

  refs.remainingSection.hidden = true;
  refs.remainingGrid.innerHTML = '';
}

function formatProgressTitle(result) {
  const progressCount = result?.winners?.length || 0;
  const cakeLabel = progressCount === 1 ? 'cake' : 'cakes';

  return `${progressCount} ${cakeLabel} continue`;
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
    refs.resultsTitle.textContent = 'Winners!';
    renderCompleteResults(state);
    return;
  }

  refs.resultsScreen.dataset.mode = 'round';
  refs.resultsTitle.textContent = result && result.nextRound
    ? formatProgressTitle(result)
    : 'Round Complete';
  renderRoundResults(state, result);
}

function showCountdown(callback) {
  refs.countdownOverlay.hidden = false;
  let count = 3;

  function updateCountdown() {
    refs.countdownNumber.textContent = count;
    refs.countdownNumber.style.animation = 'none';
    setTimeout(() => {
      refs.countdownNumber.style.animation = 'countdownPulse 1s ease-out';
    }, 10);

    if (count > 1) {
      count--;
      setTimeout(updateCountdown, 1000);
    } else {
      setTimeout(() => {
        refs.countdownOverlay.hidden = true;
        if (callback) callback();
      }, 1000);
    }
  }

  updateCountdown();
}

function applyState(state) {
  const wasRacing = runtime.previousStatus === 'racing';
  const isNowRacing = state.status === 'racing';
  const isNewRound = !wasRacing && isNowRacing;

  runtime.state = state;
  document.body.dataset.raceStatus = state.status;
  refs.roundNum.textContent = state.status === 'results'
    ? state.lastResult?.nextRound || state.currentRound || 1
    : state.currentRound || 1;

  if (state.status === 'waiting') {
    clearRaceSprites();
    hideResults();
    syncLobby(state);
    runtime.previousStatus = state.status;
    return;
  }

  clearLobbySprites();
  refs.hudQr.hidden = false;
  refs.lobbyHold.hidden = true;

  if (state.status === 'racing') {
    hideResults();

    if (isNewRound) {
      showCountdown(() => {
        syncRace(state);
      });
    } else {
      syncRace(state);
    }

    runtime.previousStatus = state.status;
    return;
  }

  if (state.status === 'results' || state.status === 'complete') {
    clearRaceSprites();
    syncResults(state);
    runtime.previousStatus = state.status;
    return;
  }

  refs.trackContainer.classList.remove('free-roam');
  refs.hudQr.hidden = true;
  refs.finishLine.hidden = true;
  refs.lobbyLayer.hidden = true;
  refs.raceLayer.hidden = true;
  refs.resultsScreen.hidden = true;
  setPlaceholder('WAITING FOR PLAYERS...');
  runtime.previousStatus = state.status;
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

  const isVertical = refs.raceLayer.classList.contains('vertical-racing');

  runtime.raceOrder.forEach((playerId, index) => {
    const sprite = runtime.raceSprites.get(playerId);
    if (!sprite) {
      return;
    }

    const progress = Math.min(0.985, sprite.localPosition / DISPLAY_TRACK_LENGTH);
    const motion = CupcakeMotion.computeTransform(sprite.motion, now, {
      velocity: sprite.serverVelocity,
      intensity: 0.8 + Math.min(0.45, sprite.serverVelocity / 380)
    });

    if (isVertical) {
      // Vertical racing: bottom to top
      const runwayHeight = Math.max(0, sprite.runway.clientHeight - sprite.racer.clientHeight - 10);
      const y = -runwayHeight * progress; // Negative because we go upward
      sprite.racer.style.transform = `translate3d(${motion.x}px, ${y + motion.y}px, 0) rotate(${motion.rotate}deg) scale(${motion.scaleX}, ${motion.scaleY})`;
    } else {
      // Horizontal racing: left to right
      const runwayWidth = Math.max(0, sprite.runway.clientWidth - sprite.racer.clientWidth - 10);
      const x = runwayWidth * progress;
      sprite.racer.style.transform = `translate3d(${x + motion.x}px, ${motion.y}px, 0) rotate(${motion.rotate}deg) scale(${motion.scaleX}, ${motion.scaleY})`;
    }
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
}

// Debug Menu
let debugClickCount = 0;
let debugClickTimer = null;

function showDebugMenu() {
  const existingMenu = document.getElementById('debug-menu');
  if (existingMenu) {
    existingMenu.remove();
    return;
  }

  const menu = document.createElement('div');
  menu.id = 'debug-menu';
  menu.innerHTML = `
    <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(20, 20, 30, 0.98); padding: 40px; border-radius: 20px; z-index: 10000; box-shadow: 0 20px 60px rgba(0,0,0,0.5); border: 2px solid rgba(255,255,255,0.2);">
      <h3 style="margin: 0 0 20px 0; font-family: 'Quizlo', 'Lato', sans-serif; font-size: 28px; color: white; text-align: center;">Debug Menu</h3>
      <div style="display: flex; flex-direction: column; gap: 15px;">
        <label style="color: white; font-size: 16px; display: flex; flex-direction: column; gap: 8px;">
          Number of Players:
          <input type="number" id="debug-player-count" min="1" max="50" value="10" style="padding: 12px; font-size: 18px; border-radius: 8px; border: 2px solid #4facfe; background: rgba(255,255,255,0.95); width: 200px;">
        </label>
        <button id="debug-simulate-btn" style="padding: 14px 24px; font-size: 16px; font-weight: 700; border-radius: 10px; border: none; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; cursor: pointer; text-transform: uppercase; letter-spacing: 1px;">
          Simulate Race
        </button>
        <button id="debug-close-btn" style="padding: 10px 20px; font-size: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.1); color: white; cursor: pointer;">
          Close
        </button>
        <div id="debug-status" style="color: #4facfe; font-size: 14px; text-align: center; min-height: 20px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(menu);

  document.getElementById('debug-close-btn').addEventListener('click', () => {
    menu.remove();
  });

  document.getElementById('debug-simulate-btn').addEventListener('click', async () => {
    const count = parseInt(document.getElementById('debug-player-count').value);
    const statusEl = document.getElementById('debug-status');
    const btn = document.getElementById('debug-simulate-btn');

    btn.disabled = true;
    btn.style.opacity = '0.5';
    statusEl.textContent = 'Creating players...';

    try {
      for (let i = 0; i < count; i++) {
        const deviceId = `debug-device-${Date.now()}-${i}`;

        // Join
        const joinRes = await fetch('/api/race/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId })
        });
        const joinData = await joinRes.json();

        if (!joinData.success) {
          statusEl.textContent = `Failed at player ${i + 1}: ${joinData.error}`;
          break;
        }

        // Activate
        await fetch('/api/race/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: joinData.playerId })
        });

        statusEl.textContent = `Created ${i + 1} / ${count} players...`;
      }

      statusEl.textContent = `Successfully created ${count} players!`;
      setTimeout(() => {
        menu.remove();
      }, 1500);
    } catch (error) {
      statusEl.textContent = `Error: ${error.message}`;
    } finally {
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  });
}

function initDebugMode() {
  refs.timer.addEventListener('click', () => {
    debugClickCount++;

    if (debugClickTimer) {
      clearTimeout(debugClickTimer);
    }

    if (debugClickCount === 3) {
      showDebugMenu();
      debugClickCount = 0;
    } else {
      debugClickTimer = setTimeout(() => {
        debugClickCount = 0;
      }, 500);
    }
  });
}

window.addEventListener('load', () => {
  initQRCode();
  initDebugMode();
  window.requestAnimationFrame(frame);
  pollState();
});
