const DISPLAY_POLL_MS = {
  waiting: 450,
  racing: 120,
  results: 350,
  complete: 600
};

const ROUND_DURATION_SECONDS = 30;
const DISPLAY_TRACK_LENGTH = 14000;
const DEFAULT_BRACKET_COLUMNS = [16, 8, 4, 2, 1];

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
  qualifierGrid: document.getElementById('qualifier-grid'),
  bracketGrid: document.getElementById('bracket-grid'),
  resultsChampion: document.getElementById('results-champion'),
  resultsChampionCake: document.getElementById('results-champion-cake'),
  moreRacers: document.getElementById('more-racers'),
  finishLine: document.querySelector('.finish-line-area'),
  winnerScreen: document.getElementById('winner-screen'),
  winnerCake: document.getElementById('winner-cake')
};

const runtime = {
  state: null,
  polling: false,
  pollTimer: null,
  lastFrame: performance.now(),
  lobbySprites: new Map(),
  raceSprites: new Map(),
  raceOrder: [],
  winnerShownFor: null
};

function hashString(value) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return hash >>> 0;
}

function mulberry32(seed) {
  let value = seed >>> 0;

  return () => {
    value += 0x6D2B79F5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function formatTimer(totalSeconds) {
  const seconds = Math.max(0, totalSeconds);
  const minutesPart = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secondsPart = (seconds % 60).toString().padStart(2, '0');
  return `${minutesPart}:${secondsPart}`;
}

function getLobbyPlayers(state) {
  const roundNumber = state.currentRound || 1;

  return Object.values(state.players).filter(
    (player) => player.visible && !player.eliminated && player.currentRound === roundNumber
  );
}

function setPlaceholder(text) {
  refs.waitingState.textContent = text;
  refs.waitingState.hidden = false;
}

function hidePlaceholder() {
  refs.waitingState.hidden = true;
}

function hideWinner() {
  refs.winnerScreen.style.display = 'none';
  runtime.winnerShownFor = null;
}

function hideResults() {
  refs.resultsScreen.hidden = true;
  refs.resultsChampion.hidden = true;
  refs.qualifierGrid.innerHTML = '';
  refs.bracketGrid.innerHTML = '';
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
  refs.moreRacers.hidden = true;
  refs.moreRacers.textContent = '';
}

function createLobbySprite(player) {
  const random = mulberry32(hashString(player.id));
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
    bobPhase: random() * Math.PI * 2
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
  refs.moreRacers.hidden = true;
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
  const lane = document.createElement('div');
  lane.className = 'race-lane';
  lane.dataset.playerId = entry.playerId;
  lane.innerHTML = `
    <div class="lane-position"></div>
    <div class="lane-runway">
      <div class="lane-bg"></div>
      <div class="racer">${generateCakeSVG(getCakeById(entry.player.cakeId))}</div>
    </div>
  `;

  refs.raceLayer.appendChild(lane);

  return {
    playerId: entry.playerId,
    lane,
    positionLabel: lane.querySelector('.lane-position'),
    runway: lane.querySelector('.lane-runway'),
    racer: lane.querySelector('.racer'),
    localPosition: entry.distance,
    serverPosition: entry.distance,
    serverVelocity: entry.velocity,
    syncedAt: performance.now(),
    phase: (hashString(entry.playerId) % 628) / 100
  };
}

function syncRace(state) {
  const round = state.rounds[state.currentRound];

  refs.trackContainer.classList.remove('free-roam');
  refs.hudQr.hidden = false;
  refs.lobbyHold.hidden = true;
  refs.finishLine.hidden = false;
  refs.lobbyLayer.hidden = true;
  refs.raceLayer.hidden = false;
  refs.resultsScreen.hidden = true;

  if (!round || !round.participants || round.participants.length === 0) {
    clearRaceSprites();
    setPlaceholder('WAITING FOR PLAYERS...');
    return;
  }

  const participants = round.participants
    .map((playerId) => ({
      playerId,
      player: state.players[playerId],
      distance: round.positions[playerId] || 0,
      velocity: round.velocities?.[playerId] || 0
    }))
    .filter((entry) => entry.player && !entry.player.eliminated && entry.player.visible)
    .sort((a, b) => b.distance - a.distance);

  if (participants.length === 0) {
    clearRaceSprites();
    setPlaceholder('WAITING FOR PLAYERS...');
    return;
  }

  hidePlaceholder();

  const displayRacers = participants.slice(0, 10);
  const desiredIds = new Set(displayRacers.map((entry) => entry.playerId));

  runtime.raceSprites.forEach((sprite, playerId) => {
    if (!desiredIds.has(playerId)) {
      sprite.lane.remove();
      runtime.raceSprites.delete(playerId);
    }
  });

  displayRacers.forEach((entry, index) => {
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

    sprite.positionLabel.textContent = `#${index + 1}`;
    sprite.lane.style.order = String(index);
    sprite.lane.classList.toggle('leading', index === 0 && entry.distance > 0);
  });

  runtime.raceOrder = displayRacers.map((entry) => entry.playerId);

  if (participants.length > displayRacers.length) {
    refs.moreRacers.hidden = false;
    refs.moreRacers.textContent = `+${participants.length - displayRacers.length} more racers`;
  } else {
    refs.moreRacers.hidden = true;
    refs.moreRacers.textContent = '';
  }
}

function formatDistance(distance) {
  return `${Math.max(0, Math.round((distance || 0) / 10))}m`;
}

function getResultPayload(state) {
  return state.lastResult || null;
}

function getBracketColumns(state) {
  const targets = Array.isArray(state.roundTargets) && state.roundTargets.length > 0
    ? state.roundTargets
    : DEFAULT_BRACKET_COLUMNS;

  return targets.map((size, index) => ({
    round: index + 1,
    size,
    label: size === 1 ? 'WINNER' : `TOP ${size}`
  }));
}

function renderQualifierCards(state, result) {
  const winnerIds = new Set(result.winners || []);
  const entries = (result.complete ? result.rankings : result.rankings.filter((entry) => winnerIds.has(entry.playerId)))
    .map((entry, index) => {
      const player = state.players[entry.playerId];

      if (!player) {
        return '';
      }

      return `
        <article class="qualifier-card ${winnerIds.has(entry.playerId) ? 'qualified' : 'eliminated'}">
          <span class="qualifier-rank">#${index + 1}</span>
          <div class="qualifier-cake">${generateCakeSVG(getCakeById(player.cakeId))}</div>
          <div class="qualifier-meta">
            <span class="qualifier-state">${winnerIds.has(entry.playerId) ? 'ADVANCES' : 'FINISHED'}</span>
            <span class="qualifier-distance">${formatDistance(entry.distance)}</span>
          </div>
        </article>
      `;
    })
    .join('');

  refs.qualifierGrid.innerHTML = entries;
}

function getBracketIds(state, roundNumber) {
  const round = state.rounds[roundNumber];
  if (!round || !Array.isArray(round.winners)) {
    return [];
  }

  return round.winners;
}

function renderBracket(state) {
  const columns = getBracketColumns(state);
  refs.bracketGrid.style.gridTemplateColumns = `repeat(${columns.length}, minmax(0, 1fr))`;
  refs.bracketGrid.innerHTML = columns.map((column) => {
    const filledIds = getBracketIds(state, column.round);
    const slots = Array.from({ length: column.size }, (_, index) => {
      const playerId = filledIds[index];
      const player = playerId ? state.players[playerId] : null;

      if (!player) {
        return `
          <div class="bracket-slot empty">
            <span class="bracket-slot-label">TBD</span>
          </div>
        `;
      }

      return `
        <div class="bracket-slot filled">
          <div class="bracket-slot-cake">${generateCakeSVG(getCakeById(player.cakeId))}</div>
          <span class="bracket-slot-label">#${index + 1}</span>
        </div>
      `;
    }).join('');

    return `
      <section class="bracket-column ${filledIds.length > 0 ? 'resolved' : 'pending'}">
        <div class="bracket-column-label">${column.label}</div>
        <div class="bracket-column-slots">${slots}</div>
      </section>
    `;
  }).join('');
}

function syncResults(state) {
  const result = getResultPayload(state);

  refs.trackContainer.classList.remove('free-roam');
  refs.hudQr.hidden = true;
  refs.lobbyHold.hidden = true;
  refs.finishLine.hidden = true;
  refs.lobbyLayer.hidden = true;
  refs.raceLayer.hidden = true;
  refs.moreRacers.hidden = true;
  refs.resultsScreen.hidden = false;
  hidePlaceholder();

  if (!result) {
    refs.resultsKicker.textContent = 'ROUND COMPLETE';
    refs.resultsTitle.textContent = 'Leaderboard Locked';
    refs.resultsSubtitle.textContent = 'Waiting for the next round.';
    refs.resultsBoardHeading.textContent = 'QUALIFIERS';
    refs.resultsChampion.hidden = true;
    refs.qualifierGrid.innerHTML = '';
    refs.bracketGrid.innerHTML = '';
    return;
  }

  const championId = result.winner || state.rounds[4]?.winners?.[0] || null;
  const champion = championId ? state.players[championId] : null;

  refs.resultsKicker.textContent = result.complete
    ? 'TOURNAMENT COMPLETE'
    : `ROUND ${result.roundNumber} COMPLETE`;
  refs.resultsTitle.textContent = result.complete
    ? 'Champion Crowned'
    : `${result.winners.length} Cakes Advance`;
  refs.resultsSubtitle.textContent = result.complete
    ? 'The final leaderboard is locked in.'
    : `${result.winners.length} cakes move on to Round ${result.nextRound}.`;
  refs.resultsBoardHeading.textContent = result.complete ? 'FINAL STANDINGS' : 'QUALIFIERS';

  if (champion) {
    refs.resultsChampion.hidden = false;
    refs.resultsChampionCake.innerHTML = generateCakeSVG(getCakeById(champion.cakeId));
  } else {
    refs.resultsChampion.hidden = true;
    refs.resultsChampionCake.innerHTML = '';
  }

  renderQualifierCards(state, result);
  renderBracket(state);
}

function applyState(state) {
  runtime.state = state;
  refs.roundNum.textContent = state.status === 'results'
    ? state.lastResult?.roundNumber || state.currentRound || 1
    : state.currentRound || 1;

  hideWinner();

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
    refs.timerStatus.style.display = 'none';

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
    refs.timerStatus.textContent = `ROUND ${state.lastResult.roundNumber} RESULTS`;
    return;
  }

  if (state.status === 'complete') {
    refs.timer.textContent = formatTimer(0);
    refs.timerStatus.style.display = 'block';
    refs.timerStatus.textContent = 'CHAMPION DECLARED';
    return;
  }

  const visiblePlayers = getLobbyPlayers(state).length;
  refs.timer.textContent = formatTimer(ROUND_DURATION_SECONDS);
  refs.timerStatus.style.display = 'block';
  refs.timerStatus.textContent = visiblePlayers > 0
    ? `${visiblePlayers} ${visiblePlayers === 1 ? 'CAKE' : 'CAKES'} READY`
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
    const bob = Math.sin(now / 140 + sprite.bobPhase) * 5;
    const centerX = geometry.centerX + Math.cos(sprite.angle) * safeRadiusX;
    const centerY = geometry.centerY + Math.sin(sprite.angle) * safeRadiusY + bob;
    const direction = Math.cos(sprite.angle) >= 0 ? 1 : -1;
    const tilt = Math.sin(sprite.angle) * 8;
    const x = Math.max(0, Math.min(maxX, centerX - 50));
    const y = Math.max(0, Math.min(maxY, centerY - 50));

    sprite.el.style.transform = `translate3d(${x}px, ${y}px, 0) scaleX(${direction}) rotate(${tilt}deg)`;
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

    const runwayWidth = Math.max(0, sprite.runway.clientWidth - sprite.racer.clientWidth);
    const progress = Math.min(0.985, sprite.localPosition / DISPLAY_TRACK_LENGTH);
    const x = runwayWidth * progress;
    const bob = Math.sin(now / 95 + sprite.phase + index) * (1.5 + Math.min(4, sprite.serverVelocity / 220));
    const lean = Math.max(-8, Math.min(10, sprite.serverVelocity / 75));

    sprite.lane.classList.toggle('leading', index === 0 && sprite.localPosition > 0);
    sprite.racer.style.transform = `translate3d(${x}px, ${bob}px, 0) rotate(${lean}deg)`;
  });
}

function showWinner(state) {
  const round = state.rounds[4] || state.rounds[state.currentRound];
  if (!round || !round.winners || round.winners.length === 0) {
    return;
  }

  const winnerId = round.winners[0];
  if (!winnerId || runtime.winnerShownFor === winnerId) {
    return;
  }

  const winner = state.players[winnerId];
  if (!winner) {
    return;
  }

  refs.winnerCake.innerHTML = generateCakeSVG(getCakeById(winner.cakeId));
  refs.winnerScreen.style.display = 'flex';
  runtime.winnerShownFor = winnerId;
}

function frame(now) {
  const dt = Math.min(0.05, (now - runtime.lastFrame) / 1000);
  runtime.lastFrame = now;

  updateHud();

  if (runtime.state?.status === 'waiting') {
    animateLobby(now, dt);
  } else if (runtime.state?.status === 'racing') {
    animateRace(now, dt);
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
  const playUrl = `${window.location.origin}/race/play.html`;
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
  renderQRCode('qrcode', 220);
  renderQRCode('hud-qrcode', 88);
}

window.addEventListener('load', () => {
  initQRCode();
  window.requestAnimationFrame(frame);
  pollState();
});
