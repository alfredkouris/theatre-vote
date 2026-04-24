const DISPLAY_POLL_MS = {
  waiting: 450,
  racing: 120,
  complete: 600
};

const refs = {
  roundNum: document.getElementById('round-num'),
  timer: document.getElementById('timer'),
  timerBadge: document.getElementById('timer-badge'),
  timerStatus: document.getElementById('timer-status'),
  trackContainer: document.getElementById('track-container'),
  waitingState: document.getElementById('waiting-state'),
  lobbyLayer: document.getElementById('lobby-layer'),
  raceLayer: document.getElementById('race-layer'),
  moreRacers: document.getElementById('more-racers'),
  winnerScreen: document.getElementById('winner-screen'),
  winnerCake: document.getElementById('winner-cake'),
  winnerName: document.getElementById('winner-name')
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
  const seed = hashString(player.id);
  const random = mulberry32(seed);
  const spriteEl = document.createElement('div');
  spriteEl.className = 'roaming-cake';
  spriteEl.dataset.playerId = player.id;
  spriteEl.innerHTML = generateCakeSVG(getCakeById(player.cakeId));
  refs.lobbyLayer.appendChild(spriteEl);

  const maxX = Math.max(40, refs.lobbyLayer.clientWidth - 110);
  const maxY = Math.max(40, refs.lobbyLayer.clientHeight - 110);

  return {
    playerId: player.id,
    el: spriteEl,
    random,
    x: random() * maxX,
    y: random() * maxY,
    vx: (random() > 0.5 ? 1 : -1) * (55 + random() * 45),
    vy: (random() > 0.5 ? 1 : -1) * (18 + random() * 26),
    bobPhase: random() * Math.PI * 2,
    wanderTimer: 0.9 + random() * 2.2
  };
}

function syncLobby(state) {
  const players = getLobbyPlayers(state);
  const desiredIds = new Set(players.map((player) => player.id));

  refs.trackContainer.classList.add('free-roam');
  refs.lobbyLayer.hidden = players.length === 0;
  refs.raceLayer.hidden = true;
  refs.moreRacers.hidden = true;

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

  if (players.length === 0) {
    setPlaceholder('WAITING FOR PLAYERS...');
  } else {
    hidePlaceholder();
  }
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
    <div class="lane-nameplate">
      <span class="racer-name"></span>
    </div>
  `;

  refs.raceLayer.appendChild(lane);

  return {
    playerId: entry.playerId,
    lane,
    positionLabel: lane.querySelector('.lane-position'),
    runway: lane.querySelector('.lane-runway'),
    racer: lane.querySelector('.racer'),
    nameEl: lane.querySelector('.racer-name'),
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
  refs.lobbyLayer.hidden = true;
  refs.raceLayer.hidden = false;

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
      velocity: round.velocities?.[playerId] || 0,
      taps: round.taps?.[playerId] || 0
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
    sprite.nameEl.textContent = entry.player.name;
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

function applyState(state) {
  runtime.state = state;
  refs.roundNum.textContent = state.currentRound || 1;

  if (state.status !== 'complete') {
    hideWinner();
  }

  if (state.status === 'waiting') {
    clearRaceSprites();
    syncLobby(state);
    return;
  }

  clearLobbySprites();

  if (state.status === 'racing') {
    syncRace(state);
    return;
  }

  if (state.status === 'complete') {
    refs.trackContainer.classList.remove('free-roam');
    refs.lobbyLayer.hidden = true;
    refs.raceLayer.hidden = true;
    refs.moreRacers.hidden = true;
    hidePlaceholder();
    showWinner(state);
    return;
  }

  refs.trackContainer.classList.remove('free-roam');
  refs.lobbyLayer.hidden = true;
  refs.raceLayer.hidden = true;
  setPlaceholder('WAITING FOR PLAYERS...');
}

function updateHud() {
  const state = runtime.state;
  if (!state) {
    return;
  }

  const timerValue = refs.timer;
  const timerStatus = refs.timerStatus;
  const timerBadge = refs.timerBadge;

  if (state.status === 'racing' && state.rounds[state.currentRound]?.startTime) {
    const round = state.rounds[state.currentRound];
    const elapsed = Date.now() - round.startTime;
    const remaining = Math.max(0, 30 - Math.floor(elapsed / 1000));
    timerValue.textContent = remaining;
    timerStatus.style.display = 'none';

    if (remaining <= 5) {
      timerBadge.classList.add('warning');
    } else {
      timerBadge.classList.remove('warning');
    }

    return;
  }

  timerBadge.classList.remove('warning');

  if (state.status === 'complete') {
    timerValue.textContent = '0';
    timerStatus.style.display = 'block';
    timerStatus.textContent = 'RACE COMPLETE';
    return;
  }

  const visiblePlayers = getLobbyPlayers(state).length;
  timerValue.textContent = '30';
  timerStatus.style.display = 'block';
  timerStatus.textContent = visiblePlayers > 0 ? 'READY TO RACE' : 'WAITING FOR PLAYERS';
}

function animateLobby(now, dt) {
  const maxX = Math.max(40, refs.lobbyLayer.clientWidth - 110);
  const maxY = Math.max(40, refs.lobbyLayer.clientHeight - 110);

  runtime.lobbySprites.forEach((sprite) => {
    sprite.wanderTimer -= dt;

    if (sprite.wanderTimer <= 0) {
      sprite.wanderTimer = 0.9 + sprite.random() * 2.2;
      sprite.vx += (sprite.random() - 0.5) * 26;
      sprite.vy += (sprite.random() - 0.5) * 22;
      sprite.vx = Math.max(-110, Math.min(110, sprite.vx));
      sprite.vy = Math.max(-48, Math.min(48, sprite.vy));
    }

    sprite.x += sprite.vx * dt;
    sprite.y += sprite.vy * dt;

    if (sprite.x <= 0 || sprite.x >= maxX) {
      sprite.x = Math.max(0, Math.min(maxX, sprite.x));
      sprite.vx *= -1;
    }

    if (sprite.y <= 0 || sprite.y >= maxY) {
      sprite.y = Math.max(0, Math.min(maxY, sprite.y));
      sprite.vy *= -1;
    }

    const bob = Math.sin(now / 140 + sprite.bobPhase) * 5;
    const tilt = Math.max(-10, Math.min(10, sprite.vx / 12));

    sprite.el.style.transform = `translate3d(${sprite.x}px, ${sprite.y + bob}px, 0) scaleX(${sprite.vx < 0 ? -1 : 1}) rotate(${tilt}deg)`;
    sprite.el.style.zIndex = String(10 + Math.round(sprite.y));
  });
}

function animateRace(now, dt) {
  if (runtime.raceOrder.length === 0) {
    return;
  }

  let leaderDistance = 0;

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

    leaderDistance = Math.max(leaderDistance, sprite.localPosition);
  });

  const trackDistance = Math.max(1400, leaderDistance * 1.08);

  runtime.raceOrder.forEach((playerId, index) => {
    const sprite = runtime.raceSprites.get(playerId);
    if (!sprite) {
      return;
    }

    const runwayWidth = Math.max(0, sprite.runway.clientWidth - sprite.racer.clientWidth);
    const progress = trackDistance > 0 ? Math.min(0.985, sprite.localPosition / trackDistance) : 0;
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
  refs.winnerName.textContent = winner.name;
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

function initQRCode() {
  const playUrl = `${window.location.origin}/race/play.html`;
  new QRCode(document.getElementById('qrcode'), {
    text: playUrl,
    width: 100,
    height: 100,
    colorDark: '#000',
    colorLight: '#fff'
  });
}

window.addEventListener('load', () => {
  initQRCode();
  window.requestAnimationFrame(frame);
  pollState();
});
