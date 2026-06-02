const DEVICE_STORAGE_KEY = 'cake-race-device-id';
const PLAYER_POLL_MS = {
  waiting: 500,
  racing: 220,
  results: 420,
  complete: 600
};

const refs = {
  playerBanner: document.getElementById('player-banner'),
  playerBannerName: document.getElementById('player-banner-name'),
  previewScreen: document.getElementById('preview-screen'),
  previewName: document.getElementById('preview-name'),
  previewCake: document.getElementById('preview-cake'),
  previewMessage: document.getElementById('preview-message'),
  joinButton: document.getElementById('join-button'),
  tapScreen: document.getElementById('tap-screen'),
  tapCake: document.getElementById('tap-cake'),
  tapPrompt: document.getElementById('tap-prompt'),
  tapInstructions: document.getElementById('tap-instructions'),
  racePositionContainer: document.getElementById('race-position-container'),
  racePositionBadge: document.getElementById('race-position-badge'),
  raceLaneBadge: document.getElementById('race-lane-badge'),
  loadingScreen: document.getElementById('loading-screen'),
  loadingText: document.querySelector('#loading-screen p'),
  eliminatedScreen: document.getElementById('eliminated-screen'),
  eliminatedCake: document.getElementById('eliminated-cake'),
  winnerScreen: document.getElementById('winner-screen-player'),
  winnerCake: document.getElementById('winner-cake-player')
};

const playerState = {
  deviceId: null,
  playerId: null,
  cakeData: null,
  raceState: null,
  canTap: false,
  visible: false,
  isEliminated: false,
  isWinner: false,
  currentScreen: 'loading',
  tapResetTimer: null,
  pollTimer: null,
  polling: false,
  activating: false,
  lastRippleAt: 0
};

function createDeviceId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  return `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateDeviceId() {
  let deviceId = null;

  try {
    deviceId = window.localStorage.getItem(DEVICE_STORAGE_KEY);

    if (!deviceId) {
      deviceId = createDeviceId();
      window.localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
    }
  } catch (error) {
    deviceId = createDeviceId();
  }

  return deviceId;
}

function installTouchGuards() {
  let lastTouchEnd = 0;

  document.addEventListener('touchend', (event) => {
    const now = Date.now();

    if (now - lastTouchEnd < 320) {
      event.preventDefault();
    }

    lastTouchEnd = now;
  }, { passive: false });

  document.addEventListener('gesturestart', (event) => {
    event.preventDefault();
  }, { passive: false });

  document.addEventListener('dblclick', (event) => {
    event.preventDefault();
  }, { passive: false });
}

function setScreen(screen) {
  refs.previewScreen.style.display = screen === 'preview' ? 'flex' : 'none';
  refs.tapScreen.style.display = screen === 'tap' ? 'flex' : 'none';
  refs.loadingScreen.style.display = screen === 'loading' ? 'flex' : 'none';
  refs.eliminatedScreen.style.display = screen === 'eliminated' ? 'flex' : 'none';
  refs.winnerScreen.style.display = screen === 'winner' ? 'flex' : 'none';
  refs.racePositionContainer.hidden = screen !== 'tap' || refs.racePositionContainer.hidden;
  playerState.currentScreen = screen;
}

function applyCakeTheme() {
  if (!playerState.cakeData) {
    return;
  }

  const { bodyColor, frostingColor } = playerState.cakeData;
  const svg = generateCakeSVG(playerState.cakeData);
  document.documentElement.style.setProperty('--player-cake-body', bodyColor);
  document.documentElement.style.setProperty('--player-cake-frosting', frostingColor);

  refs.previewCake.innerHTML = svg;
  refs.tapCake.innerHTML = svg;
  refs.eliminatedCake.innerHTML = svg;
  refs.winnerCake.innerHTML = svg;
}

function setPlayerName(name) {
  const safeName = name || 'Cupcake ready';
  refs.previewName.textContent = safeName;
  refs.playerBannerName.textContent = safeName;
}

function showLoading(message = 'Joining race...') {
  playerState.canTap = false;
  refs.loadingText.textContent = message;
  setScreen('loading');
}

function showPreview(message, allowJoin = true) {
  playerState.canTap = false;

  if (message) {
    refs.previewMessage.textContent = message;
  }

  refs.joinButton.hidden = !allowJoin;
  refs.joinButton.disabled = !allowJoin;
  refs.joinButton.textContent = allowJoin ? 'RETRY ENTRY' : 'ROUND IN PLAY';
  setScreen('preview');
}

function showTapScreen() {
  setScreen('tap');
}

function showEliminated() {
  playerState.canTap = false;
  setScreen('eliminated');
}

function showWinner() {
  playerState.canTap = false;
  setScreen('winner');
}

function updateTapCopy() {
  if (playerState.isWinner) {
    refs.tapPrompt.textContent = 'WIN';
    refs.tapInstructions.textContent = 'You took the cake.';
    return;
  }

  if (playerState.isEliminated) {
    refs.tapPrompt.textContent = 'OUT';
    refs.tapInstructions.textContent = 'Thanks for playing.';
    return;
  }

  if (playerState.canTap) {
    refs.tapPrompt.textContent = 'TAP';
    refs.tapInstructions.textContent = 'Tap fast to race';
    return;
  }

  if (playerState.raceState?.status === 'results') {
    refs.tapPrompt.textContent = 'READY';
    refs.tapInstructions.textContent = 'Round complete. Next round soon.';
    return;
  }

  if (!playerState.visible) {
    refs.tapPrompt.textContent = 'READY';
    refs.tapInstructions.textContent = 'Join the race to appear on the big screen';
    return;
  }

  if (playerState.raceState?.status === 'complete') {
    refs.tapPrompt.textContent = 'FINISH';
    refs.tapInstructions.textContent = 'Waiting for the result';
    return;
  }

  refs.tapPrompt.textContent = 'READY';
  refs.tapInstructions.textContent = 'Wait for the round to start';
}

function getCurrentRoundRank(state, playerId) {
  const round = state.rounds?.[state.currentRound];

  if (!round || !Array.isArray(round.participants) || !round.participants.includes(playerId)) {
    return null;
  }

  const rankings = round.participants
    .map((participantId) => ({
      playerId: participantId,
      distance: round.positions?.[participantId] || 0,
      taps: round.taps?.[participantId] || 0,
      joinedAt: state.players?.[participantId]?.joinedAt || 0
    }))
    .sort((a, b) => {
      if (b.distance !== a.distance) {
        return b.distance - a.distance;
      }

      if (b.taps !== a.taps) {
        return b.taps - a.taps;
      }

      return a.joinedAt - b.joinedAt;
    });

  const rank = rankings.findIndex((entry) => entry.playerId === playerId) + 1;

  return rank > 0
    ? { rank, total: rankings.length }
    : null;
}

function updateRacePositionBadge(state, player) {
  const isActiveRacer = Boolean(
    state.status === 'racing' &&
    player?.visible &&
    !player?.eliminated &&
    player.currentRound === state.currentRound
  );

  if (!isActiveRacer) {
    refs.racePositionContainer.hidden = true;
    return;
  }

  const ranking = getCurrentRoundRank(state, playerState.playerId);

  if (!ranking) {
    refs.racePositionContainer.hidden = true;
    return;
  }

  const laneNumber = (player?.laneIndex ?? 0) + 1;

  refs.racePositionBadge.textContent = `#${ranking.rank} of #${ranking.total}`;
  refs.raceLaneBadge.textContent = `LANE ${laneNumber}`;
  refs.racePositionContainer.hidden = false;
}

function setPreviewCopy(data) {
  setPlayerName(data.cakeName || 'Cupcake ready');
  refs.previewMessage.textContent = data.canActivate
    ? 'You are in. Wait for the round to start.'
    : 'This round already started on another device.';
}

function hydratePlayer(data) {
  playerState.playerId = data.playerId;
  playerState.visible = Boolean(data.visible);
  playerState.isEliminated = Boolean(data.eliminated);
  playerState.isWinner = false;
  playerState.cakeData = getCakeById(data.cakeId);

  applyCakeTheme();
  setPreviewCopy(data);

  if (playerState.isEliminated) {
    showEliminated();
    return;
  }

  if (playerState.visible) {
    showTapScreen();
  } else {
    showPreview(refs.previewMessage.textContent, data.canActivate);
  }
}

async function loadPlayer(isRefresh = false) {
  if (!isRefresh) {
    showLoading('Assigning your cupcake...');
  }

  try {
    const response = await fetch('/api/race/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: playerState.deviceId })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Unable to join the race');
    }

    hydratePlayer(data);

    if (!playerState.pollTimer) {
      pollStatus();
    }

    if (!playerState.visible && data.canActivate) {
      await activatePlayer(true);
      return;
    }

    updateTapCopy();
  } catch (error) {
    console.error('Error loading player:', error);
    setPlayerName('Race unavailable');
    refs.previewMessage.textContent = error.message || 'Connection error. Please refresh.';
    refs.joinButton.hidden = true;
    refs.joinButton.disabled = true;
    refs.joinButton.textContent = 'WAITING';
    setScreen('preview');
  }
}

async function activatePlayer(isAutomatic = false) {
  if (!playerState.playerId || playerState.activating || playerState.visible) {
    return;
  }

  playerState.activating = true;
  showLoading(isAutomatic ? 'Entering the race...' : 'Retrying entry...');

  try {
    const response = await fetch('/api/race/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: playerState.playerId })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Unable to activate player');
    }

    playerState.visible = true;
    showTapScreen();
    updateTapCopy();
  } catch (error) {
    console.error('Error activating player:', error);
    showPreview(error.message || 'Could not join this round.', true);
    updateTapCopy();
  } finally {
    playerState.activating = false;
  }
}

function pulseCake() {
  refs.tapCake.classList.add('tapped');

  if (playerState.tapResetTimer) {
    window.clearTimeout(playerState.tapResetTimer);
  }

  playerState.tapResetTimer = window.setTimeout(() => {
    refs.tapCake.classList.remove('tapped');
  }, 120);
}

function createRipple(clientX, clientY) {
  const now = performance.now();
  if (now - playerState.lastRippleAt < 120) {
    return;
  }

  playerState.lastRippleAt = now;

  const bounds = refs.tapScreen.getBoundingClientRect();
  const ripple = document.createElement('div');
  ripple.className = 'ripple-effect';
  ripple.style.left = `${clientX - bounds.left}px`;
  ripple.style.top = `${clientY - bounds.top}px`;
  refs.tapScreen.appendChild(ripple);

  window.setTimeout(() => ripple.remove(), 900);
}

function sendTap(clientX, clientY) {
  if (!playerState.playerId || !playerState.canTap || playerState.isEliminated || playerState.isWinner) {
    return;
  }

  createRipple(clientX, clientY);
  pulseCake();

  fetch('/api/race/tap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId: playerState.playerId })
  }).catch((error) => {
    console.error('Tap error:', error);
  });
}

function getEventPoint(event) {
  if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
    return { x: event.clientX, y: event.clientY };
  }

  const bounds = refs.tapScreen.getBoundingClientRect();
  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2
  };
}

function handleTap(event) {
  if (!playerState.canTap) {
    return;
  }

  event.preventDefault();
  const point = getEventPoint(event);
  sendTap(point.x, point.y);
}

async function pollStatus() {
  if (!playerState.playerId || playerState.polling) {
    return;
  }

  playerState.polling = true;

  try {
    const response = await fetch('/api/race/status');
    const state = await response.json();
    playerState.raceState = state;

    const player = state.players[playerState.playerId];

    if (!player) {
      playerState.playerId = null;
      playerState.visible = false;
      playerState.isEliminated = false;
      playerState.isWinner = false;
      await loadPlayer(true);
      return;
    }

    playerState.visible = Boolean(player.visible);
    playerState.isEliminated = Boolean(player.eliminated);
    setPlayerName(player.name || playerState.cakeData?.name || 'Cupcake ready');
    updateRacePositionBadge(state, player);

    if (playerState.isEliminated) {
      showEliminated();
      return;
    }

    const finalRound = state.rounds[4] || state.rounds[state.currentRound];
    const winnerId = finalRound?.winners?.[0] || null;
    playerState.isWinner = state.status === 'complete' && winnerId === playerState.playerId;

    if (playerState.isWinner) {
      showWinner();
      return;
    }

    if (playerState.visible && playerState.currentScreen === 'preview') {
      showTapScreen();
    }

    playerState.canTap = Boolean(
      state.status === 'racing' &&
      player.visible &&
      !player.eliminated &&
      player.currentRound === state.currentRound
    );

    updateTapCopy();
  } catch (error) {
    console.error('Poll error:', error);
  } finally {
    playerState.polling = false;

    if (playerState.playerId) {
      const delay = PLAYER_POLL_MS[playerState.raceState?.status] || PLAYER_POLL_MS.waiting;
      playerState.pollTimer = window.setTimeout(pollStatus, delay);
    } else {
      playerState.pollTimer = null;
    }
  }
}

window.addEventListener('load', () => {
  installTouchGuards();
  playerState.deviceId = getOrCreateDeviceId();

  refs.joinButton.addEventListener('click', () => activatePlayer(false));
  refs.tapScreen.addEventListener('pointerdown', handleTap);

  showLoading('Assigning your cupcake...');
  loadPlayer();
});
