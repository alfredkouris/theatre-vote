const DEVICE_STORAGE_KEY = 'cake-race-device-id';
const HOLD_INTERVAL_MS = 90;
const PLAYER_POLL_MS = {
  waiting: 500,
  racing: 220,
  complete: 600
};

const refs = {
  previewScreen: document.getElementById('preview-screen'),
  previewName: document.getElementById('preview-name'),
  previewCake: document.getElementById('preview-cake'),
  previewMessage: document.getElementById('preview-message'),
  joinButton: document.getElementById('join-button'),
  tapScreen: document.getElementById('tap-screen'),
  tapCake: document.getElementById('tap-cake'),
  tapPrompt: document.getElementById('tap-prompt'),
  tapInstructions: document.getElementById('tap-instructions'),
  boostMeterFill: document.getElementById('boost-meter-fill'),
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
  holdInterval: null,
  holdPoint: null,
  tapResetTimer: null,
  pollTimer: null,
  polling: false,
  fxLastFrame: performance.now(),
  momentum: 0,
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

function setScreen(screen) {
  refs.previewScreen.style.display = screen === 'preview' ? 'flex' : 'none';
  refs.tapScreen.style.display = screen === 'tap' ? 'flex' : 'none';
  refs.loadingScreen.style.display = screen === 'loading' ? 'flex' : 'none';
  refs.eliminatedScreen.style.display = screen === 'eliminated' ? 'flex' : 'none';
  refs.winnerScreen.style.display = screen === 'winner' ? 'flex' : 'none';
  playerState.currentScreen = screen;
}

function applyCakeTheme() {
  if (!playerState.cakeData) {
    return;
  }

  const { bodyColor, frostingColor } = playerState.cakeData;
  const gradient = `linear-gradient(135deg, ${bodyColor}, ${frostingColor})`;

  refs.previewScreen.style.background = gradient;
  refs.tapScreen.style.background = gradient;
  refs.winnerScreen.style.background = gradient;
  refs.eliminatedScreen.style.background = `linear-gradient(135deg, ${bodyColor}80, ${frostingColor}80)`;

  const svg = generateCakeSVG(playerState.cakeData);
  refs.previewCake.innerHTML = svg;
  refs.tapCake.innerHTML = svg;
  refs.eliminatedCake.innerHTML = svg;
  refs.winnerCake.innerHTML = svg;
}

function showLoading(message = 'Joining race...') {
  playerState.canTap = false;
  refs.loadingText.textContent = message;
  setScreen('loading');
}

function showPreview(message, allowJoin = true) {
  playerState.canTap = false;
  stopBoosting();

  if (message) {
    refs.previewMessage.textContent = message;
  }

  refs.joinButton.disabled = !allowJoin;
  refs.joinButton.textContent = allowJoin ? 'JOIN RACE' : 'ROUND IN PLAY';
  setScreen('preview');
}

function showTapScreen() {
  setScreen('tap');
}

function showEliminated() {
  stopBoosting();
  playerState.canTap = false;
  setScreen('eliminated');
}

function showWinner() {
  stopBoosting();
  playerState.canTap = false;
  setScreen('winner');
}

function updateTapCopy() {
  if (playerState.isWinner) {
    refs.tapPrompt.textContent = 'WINNER';
    refs.tapInstructions.textContent = 'You took the cake.';
    return;
  }

  if (playerState.isEliminated) {
    refs.tapPrompt.textContent = 'OUT';
    refs.tapInstructions.textContent = 'Thanks for playing.';
    return;
  }

  if (playerState.canTap) {
    refs.tapPrompt.textContent = 'BOOST';
    refs.tapInstructions.textContent = 'Hold or tap to build speed';
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
  refs.tapInstructions.textContent = 'Wait for the next round to start';
}

function setPreviewCopy(data) {
  refs.previewName.textContent = data.cakeName || 'Cake ready';
  refs.previewMessage.textContent = data.canActivate
    ? 'Hold or tap to build speed once the round starts.'
    : 'This round already started. Reuse the original device or wait for the next reset.';
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
    showLoading('Joining race...');
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
    updateTapCopy();

    if (!playerState.pollTimer) {
      pollStatus();
    }
  } catch (error) {
    console.error('Error loading player:', error);
    refs.previewName.textContent = 'Race unavailable';
    refs.previewMessage.textContent = error.message || 'Connection error. Please refresh.';
    refs.joinButton.disabled = true;
    refs.joinButton.textContent = 'WAITING';
    setScreen('preview');
  }
}

async function activatePlayer() {
  if (!playerState.playerId) {
    return;
  }

  showLoading('Jumping into the race...');

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
    showPreview(error.message || 'Could not join this round.', false);
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
  if (now - playerState.lastRippleAt < 160) {
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

function sendTap(clientX, clientY, showVisuals = true) {
  if (!playerState.playerId || !playerState.canTap || playerState.isEliminated || playerState.isWinner) {
    return;
  }

  if (showVisuals) {
    createRipple(clientX, clientY);
  }

  pulseCake();
  playerState.momentum = Math.min(1, playerState.momentum + 0.16);

  fetch('/api/race/tap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId: playerState.playerId })
  }).catch((error) => {
    console.error('Tap error:', error);
  });
}

function stopBoosting() {
  refs.tapCake.classList.remove('boosting');
  playerState.holdPoint = null;

  if (playerState.holdInterval) {
    window.clearInterval(playerState.holdInterval);
    playerState.holdInterval = null;
  }
}

function startBoosting(event) {
  if (!playerState.canTap) {
    return;
  }

  event.preventDefault();

  playerState.holdPoint = { x: event.clientX, y: event.clientY };
  refs.tapCake.classList.add('boosting');
  sendTap(event.clientX, event.clientY, true);

  if (playerState.holdInterval) {
    window.clearInterval(playerState.holdInterval);
  }

  playerState.holdInterval = window.setInterval(() => {
    if (!playerState.holdPoint) {
      return;
    }

    sendTap(playerState.holdPoint.x, playerState.holdPoint.y, false);
  }, HOLD_INTERVAL_MS);
}

function updateHoldPoint(event) {
  if (!playerState.holdPoint) {
    return;
  }

  playerState.holdPoint = { x: event.clientX, y: event.clientY };
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

    if (!playerState.canTap) {
      stopBoosting();
    }

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

function animateFx(now) {
  const dt = Math.min(0.05, (now - playerState.fxLastFrame) / 1000);
  playerState.fxLastFrame = now;

  const decayRate = playerState.canTap ? 0.95 : 1.8;
  playerState.momentum = Math.max(0, playerState.momentum - decayRate * dt);
  refs.boostMeterFill.style.transform = `scaleX(${playerState.momentum.toFixed(3)})`;

  window.requestAnimationFrame(animateFx);
}

window.addEventListener('load', () => {
  playerState.deviceId = getOrCreateDeviceId();

  refs.joinButton.addEventListener('click', activatePlayer);
  refs.tapScreen.addEventListener('pointerdown', startBoosting);
  refs.tapScreen.addEventListener('pointermove', updateHoldPoint);
  window.addEventListener('pointerup', stopBoosting);
  window.addEventListener('pointercancel', stopBoosting);

  showLoading('Joining race...');
  window.requestAnimationFrame(animateFx);
  loadPlayer();
});
