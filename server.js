const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory vote storage
let votes = {
  agree: 0,
  disagree: 0
};

// Get current votes
app.get('/api/votes', (req, res) => {
  res.json(votes);
});

// Submit a vote
app.post('/api/vote', (req, res) => {
  const { vote } = req.body;

  if (vote === 'agree' || vote === 'disagree') {
    votes[vote]++;
    res.json({ success: true, votes });
  } else {
    res.status(400).json({ success: false, error: 'Invalid vote' });
  }
});

// Reset votes (for testing)
app.post('/api/reset', (req, res) => {
  votes = { agree: 0, disagree: 0 };
  res.json({ success: true, votes });
});

// ===== CAKE RACE GAME =====

// Admin password (from environment or default)
const RACE_ADMIN_PASSWORD = process.env.RACE_ADMIN_PASSWORD || 'theatre123';

const CAKE_NAMES = [
  "Red Velvet Dream", "Strawberry Swirl", "Cherry Bomb", "Raspberry Delight", "Watermelon Wonder",
  "Pink Lemonade", "Rose Petal", "Bubblegum Blast", "Cranberry Crush", "Cotton Candy Cloud",
  "Blueberry Bliss", "Lavender Love", "Midnight Dream", "Purple Haze", "Grape Gum",
  "Periwinkle Pop", "Indigo Ink", "Sapphire Spark", "Violet Velvet", "Periwinkle Paradise",
  "Lemon Zest", "Orange Crush", "Banana Bonanza", "Mango Tango", "Pineapple Party",
  "Peach Perfection", "Apricot Affair", "Tangerine Twist", "Golden Honey", "Sunshine Shimmer",
  "Matcha Magic", "Mint Chip", "Pistachio Pow", "Lime Lime", "Kiwi Kiss",
  "Avocado Awesome", "Emerald Envy", "Chocolate Thunder", "Mocha Madness", "Caramel Cascade",
  "Coffee Cake Craze", "Hazelnut Heaven", "Walnut Whirl", "Cocoa Crunch", "Tiramisu Twist",
  "Rainbow Rocket", "Funfetti Frenzy", "Unicorn Dream", "Galaxy Glaze", "Confetti Celebration",
  "Ice Cream Sundae", "S'mores Surprise", "Birthday Blast", "Neapolitan", "Wedding White"
];

// Round configuration
const ROUND_CONFIG = {
  1: { winners: 16 },
  2: { winners: 8 },
  3: { winners: 4 },
  4: { winners: 1 }
};

// Physics constants
const PHYSICS = {
  TICK_MS: 1000 / 60,
  TAP_RATE_LIMIT: 12,
  BOOST_PER_TAP: 0.2,
  MAX_BOOST: 1,
  BOOST_DECAY_PER_SECOND: 1.05,
  MAX_SPEED: 900,
  RESPONSE_PER_SECOND: 4.5
};

function createRound(participants = []) {
  const uniqueParticipants = [...new Set(participants)];
  const round = {
    participants: uniqueParticipants,
    positions: {},
    velocities: {},
    boosts: {},
    taps: {},
    winners: [],
    startTime: null,
    endTime: null
  };

  uniqueParticipants.forEach((playerId) => {
    round.positions[playerId] = 0;
    round.velocities[playerId] = 0;
    round.boosts[playerId] = 0;
    round.taps[playerId] = 0;
  });

  return round;
}

function createInitialRaceState() {
  return {
    status: 'waiting',
    currentRound: 0,
    roundStartTime: null,
    players: {},
    rounds: {},
    tapHistory: {},
    devicePlayers: {},
    availableCakes: Array.from({ length: CAKE_NAMES.length }, (_, index) => index + 1)
  };
}

let raceState = createInitialRaceState();
let physicsInterval = null;

function generatePlayerId() {
  return 'player_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
}

function getNextAvailableCake() {
  if (raceState.availableCakes.length === 0) {
    const eliminatedPlayers = Object.values(raceState.players).filter((player) => player.eliminated);
    if (eliminatedPlayers.length > 0) {
      return eliminatedPlayers[0].cakeId;
    }

    return Math.floor(Math.random() * CAKE_NAMES.length) + 1;
  }

  return raceState.availableCakes.shift();
}

function ensureRound(roundNumber) {
  if (!raceState.rounds[roundNumber]) {
    raceState.rounds[roundNumber] = createRound();
  }

  return raceState.rounds[roundNumber];
}

function ensureRoundParticipant(roundNumber, playerId) {
  const round = ensureRound(roundNumber);

  if (!round.participants.includes(playerId)) {
    round.participants.push(playerId);
  }

  if (typeof round.positions[playerId] !== 'number') {
    round.positions[playerId] = 0;
  }

  if (typeof round.velocities[playerId] !== 'number') {
    round.velocities[playerId] = 0;
  }

  if (typeof round.boosts[playerId] !== 'number') {
    round.boosts[playerId] = 0;
  }

  if (typeof round.taps[playerId] !== 'number') {
    round.taps[playerId] = 0;
  }

  return round;
}

function hasRaceStarted() {
  return Object.values(raceState.rounds).some((round) => Boolean(round.startTime));
}

function canActivatePlayer(player) {
  if (!player || player.eliminated) {
    return false;
  }

  const roundNumber = player.currentRound || raceState.currentRound || 1;
  const round = raceState.rounds[roundNumber];

  if (!round || !round.startTime) {
    return true;
  }

  return round.participants.includes(player.id);
}

function buildPlayerPayload(player, reused = false) {
  return {
    success: true,
    reused,
    playerId: player.id,
    cakeId: player.cakeId,
    cakeName: player.name,
    currentRound: player.currentRound,
    visible: player.visible,
    eliminated: player.eliminated,
    canActivate: canActivatePlayer(player),
    raceStatus: raceState.status
  };
}

function updatePhysics() {
  if (raceState.status !== 'racing') {
    return;
  }

  const round = raceState.rounds[raceState.currentRound];
  if (!round) {
    return;
  }

  const dt = PHYSICS.TICK_MS / 1000;

  round.participants.forEach((playerId) => {
    const boost = round.boosts[playerId] || 0;
    const velocity = round.velocities[playerId] || 0;
    const nextBoost = Math.max(0, boost - PHYSICS.BOOST_DECAY_PER_SECOND * dt);
    const targetVelocity = Math.pow(nextBoost, 0.78) * PHYSICS.MAX_SPEED;
    let nextVelocity = velocity + (targetVelocity - velocity) * Math.min(1, PHYSICS.RESPONSE_PER_SECOND * dt);

    if (nextBoost === 0 && nextVelocity < 1) {
      nextVelocity = 0;
    }

    round.boosts[playerId] = nextBoost;
    round.velocities[playerId] = nextVelocity;
    round.positions[playerId] = (round.positions[playerId] || 0) + nextVelocity * dt;
  });
}

function startPhysicsLoop() {
  stopPhysicsLoop();
  physicsInterval = setInterval(updatePhysics, PHYSICS.TICK_MS);
}

function stopPhysicsLoop() {
  if (physicsInterval) {
    clearInterval(physicsInterval);
    physicsInterval = null;
  }
}

function processTap(playerId, currentTime) {
  const player = raceState.players[playerId];
  if (!player || player.eliminated || !player.visible) {
    return { success: false, reason: 'player-not-active' };
  }

  if (raceState.status !== 'racing') {
    return { success: false, reason: 'race-not-active' };
  }

  if (player.currentRound !== raceState.currentRound) {
    return { success: false, reason: 'wrong-round' };
  }

  const round = raceState.rounds[raceState.currentRound];
  if (!round || !round.participants.includes(playerId)) {
    return { success: false, reason: 'no-active-round' };
  }

  if (!raceState.tapHistory[playerId]) {
    raceState.tapHistory[playerId] = [];
  }

  const oneSecondAgo = currentTime - 1000;
  raceState.tapHistory[playerId] = raceState.tapHistory[playerId].filter((timestamp) => timestamp > oneSecondAgo);

  if (raceState.tapHistory[playerId].length >= PHYSICS.TAP_RATE_LIMIT) {
    return { success: false, reason: 'rate-limited' };
  }

  raceState.tapHistory[playerId].push(currentTime);

  const nextBoost = Math.min(
    PHYSICS.MAX_BOOST,
    (round.boosts[playerId] || 0) + PHYSICS.BOOST_PER_TAP
  );

  round.boosts[playerId] = nextBoost;
  round.taps[playerId] = (round.taps[playerId] || 0) + 1;

  return {
    success: true,
    boost: nextBoost,
    velocity: round.velocities[playerId] || 0,
    position: round.positions[playerId] || 0,
    taps: round.taps[playerId]
  };
}

function calculateWinners(roundNumber) {
  const round = raceState.rounds[roundNumber];
  if (!round) {
    return [];
  }

  const rankings = round.participants
    .map((playerId) => ({
      playerId,
      distance: round.positions[playerId] || 0
    }))
    .sort((a, b) => b.distance - a.distance);

  if (rankings.length === 0) {
    return [];
  }

  const configuredWinners = ROUND_CONFIG[roundNumber].winners;
  const actualWinners = Math.min(configuredWinners, rankings.length);
  const winners = rankings.slice(0, actualWinners).map((ranking) => ranking.playerId);

  rankings.slice(actualWinners).forEach((ranking) => {
    if (raceState.players[ranking.playerId]) {
      raceState.players[ranking.playerId].eliminated = true;
    }
  });

  return winners;
}

function advanceToNextRound(winners, currentRound) {
  if (currentRound === 4 || winners.length <= 1) {
    raceState.status = 'complete';
    return { complete: true, winner: winners[0] || null };
  }

  const nextRound = currentRound + 1;
  raceState.rounds[nextRound] = createRound(winners);

  winners.forEach((playerId) => {
    if (raceState.players[playerId]) {
      raceState.players[playerId].currentRound = nextRound;
    }
  });

  raceState.currentRound = nextRound;
  raceState.status = 'waiting';

  return { complete: false, round: nextRound };
}

// ===== RACE API ENDPOINTS =====

// Get race status
app.get('/api/race/status', (req, res) => {
  res.json({
    ...raceState,
    serverTime: Date.now()
  });
});

// Join race
app.post('/api/race/join', (req, res) => {
  const { deviceId } = req.body || {};

  if (!deviceId) {
    return res.status(400).json({ success: false, error: 'Missing deviceId' });
  }

  const existingPlayerId = raceState.devicePlayers[deviceId];
  const existingPlayer = existingPlayerId ? raceState.players[existingPlayerId] : null;

  if (existingPlayer) {
    existingPlayer.lastSeenAt = Date.now();
    return res.json(buildPlayerPayload(existingPlayer, true));
  }

  if (hasRaceStarted()) {
    return res.status(409).json({
      success: false,
      error: 'The race is already underway on other devices. Reuse the original device or wait for a reset.'
    });
  }

  const playerId = generatePlayerId();
  const cakeId = getNextAvailableCake();
  const cakeName = CAKE_NAMES[cakeId - 1] || `Cake ${cakeId}`;
  const player = {
    id: playerId,
    deviceId,
    name: cakeName,
    cakeId,
    joinedAt: Date.now(),
    lastSeenAt: Date.now(),
    currentRound: 1,
    eliminated: false,
    visible: false
  };

  raceState.players[playerId] = player;
  raceState.devicePlayers[deviceId] = playerId;

  res.json(buildPlayerPayload(player));
});

// Activate player (make visible on display)
app.post('/api/race/activate', (req, res) => {
  const { playerId } = req.body;

  if (!playerId) {
    return res.status(400).json({ success: false, error: 'Missing playerId' });
  }

  const player = raceState.players[playerId];
  if (!player) {
    return res.status(404).json({ success: false, error: 'Player not found' });
  }

  if (player.eliminated) {
    return res.status(409).json({ success: false, error: 'Player has already been eliminated' });
  }

  const roundNumber = player.currentRound || raceState.currentRound || 1;
  const round = ensureRound(roundNumber);

  if (round.startTime && !round.participants.includes(playerId)) {
    return res.status(409).json({ success: false, error: 'Round already started on this device' });
  }

  player.visible = true;
  player.lastSeenAt = Date.now();

  ensureRoundParticipant(roundNumber, playerId);

  if (raceState.currentRound === 0) {
    raceState.currentRound = roundNumber;
  }

  res.json({ success: true, playerId, currentRound: roundNumber });
});

// Process tap
app.post('/api/race/tap', (req, res) => {
  const { playerId } = req.body;

  if (!playerId) {
    return res.status(400).json({ success: false, error: 'Missing playerId' });
  }

  const result = processTap(playerId, Date.now());
  res.json(result);
});

// Admin: Start round
app.post('/api/race/admin/start', (req, res) => {
  const { password } = req.body;

  if (password !== RACE_ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }

  const roundNum = raceState.currentRound || 1;
  const round = ensureRound(roundNum);
  const activeParticipants = round.participants.filter((playerId) => {
    const player = raceState.players[playerId];
    return player && player.visible && !player.eliminated && player.currentRound === roundNum;
  });

  if (activeParticipants.length === 0) {
    return res.json({ success: false, error: 'No activated cakes are ready for this round' });
  }

  round.participants = activeParticipants;
  round.startTime = Date.now();
  round.endTime = null;
  round.winners = [];

  activeParticipants.forEach((playerId) => {
    round.positions[playerId] = 0;
    round.velocities[playerId] = 0;
    round.boosts[playerId] = 0;
    round.taps[playerId] = 0;
    raceState.tapHistory[playerId] = [];
  });

  raceState.status = 'racing';
  raceState.currentRound = roundNum;
  raceState.roundStartTime = Date.now();

  startPhysicsLoop();

  res.json({ success: true, round: roundNum, startTime: raceState.roundStartTime });
});

// Admin: Stop round and advance
app.post('/api/race/admin/stop', (req, res) => {
  const { password } = req.body;

  if (password !== RACE_ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }

  if (raceState.status !== 'racing') {
    return res.json({ success: false, error: 'No active race' });
  }

  const currentRound = raceState.currentRound;
  const round = raceState.rounds[currentRound];

  if (round) {
    round.endTime = Date.now();

    stopPhysicsLoop();

    const winners = calculateWinners(currentRound);
    round.winners = winners;

    const result = advanceToNextRound(winners, currentRound);

    res.json({
      success: true,
      winners,
      complete: result.complete,
      nextRound: result.round || null,
      winner: result.winner || null
    });
  } else {
    res.json({ success: false, error: 'No round data' });
  }
});

// Admin: Reset game
app.post('/api/race/admin/reset', (req, res) => {
  const { password } = req.body;

  if (password !== RACE_ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }

  stopPhysicsLoop();

  raceState = createInitialRaceState();

  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Voting Display: http://localhost:${PORT}/index.html`);
  console.log(`Voting Page: http://localhost:${PORT}/vote.html`);
  console.log(`Race Display: http://localhost:${PORT}/race/display.html`);
  console.log(`Race Play: http://localhost:${PORT}/race/play.html`);
  console.log(`Race Admin: http://localhost:${PORT}/race/admin.html`);
});
