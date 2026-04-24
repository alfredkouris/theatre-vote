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

// Round configuration
const ROUND_CONFIG = {
  1: { winners: 16 },
  2: { winners: 8 },
  3: { winners: 4 },
  4: { winners: 1 }
};

// In-memory race state
let raceState = {
  status: 'waiting',  // 'waiting' | 'racing' | 'round-complete' | 'complete'
  currentRound: 0,    // 0 (waiting) | 1-4 (active rounds)
  roundStartTime: null,

  players: {},        // playerId: { id, name, cakeId, currentRound, eliminated }
  rounds: {},         // roundNumber: { participants, positions, velocities, taps, winners, startTime, endTime }
  tapHistory: {},     // playerId: [timestamp, ...]
  availableCakes: Array.from({length: 55}, (_, i) => i + 1)  // [1, 2, 3, ..., 55]
};

// Physics constants
const PHYSICS = {
  TAP_ACCELERATION: 2.5,    // How much velocity each tap adds
  FRICTION: 0.98,           // Velocity decay per frame (0.98 = 2% loss)
  MAX_VELOCITY: 8,          // Maximum velocity cap
  UPDATE_INTERVAL: 50       // Physics update every 50ms (20 FPS)
};

// Physics update interval
let physicsInterval = null;

// Generate unique player ID
function generatePlayerId() {
  return 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Get next available cake
function getNextAvailableCake() {
  if (raceState.availableCakes.length === 0) {
    // All cakes taken, recycle from eliminated players
    const eliminatedPlayers = Object.values(raceState.players).filter(p => p.eliminated);
    if (eliminatedPlayers.length > 0) {
      return eliminatedPlayers[0].cakeId;
    }
    // Fallback: random cake
    return Math.floor(Math.random() * 55) + 1;
  }

  const cakeId = raceState.availableCakes.shift();
  return cakeId;
}

// Physics update loop - runs continuously during races
function updatePhysics() {
  if (raceState.status !== 'racing') return;

  const round = raceState.rounds[raceState.currentRound];
  if (!round || !round.velocities) return;

  // Update each racer's position based on velocity
  round.participants.forEach(playerId => {
    const velocity = round.velocities[playerId] || 0;
    const position = round.positions[playerId] || 0;

    // Update position
    const newPosition = position + velocity;
    round.positions[playerId] = newPosition;

    // Apply friction (velocity decay)
    const newVelocity = velocity * PHYSICS.FRICTION;
    round.velocities[playerId] = Math.max(0, newVelocity);
  });
}

// Start physics loop
function startPhysicsLoop() {
  if (physicsInterval) clearInterval(physicsInterval);
  physicsInterval = setInterval(updatePhysics, PHYSICS.UPDATE_INTERVAL);
}

// Stop physics loop
function stopPhysicsLoop() {
  if (physicsInterval) {
    clearInterval(physicsInterval);
    physicsInterval = null;
  }
}

// Process tap with rate limiting - now adds velocity instead of distance
function processTap(playerId, currentTime) {
  // Check if player exists and is not eliminated
  const player = raceState.players[playerId];
  if (!player || player.eliminated) {
    return { success: false, reason: 'player-not-active' };
  }

  // Check if race is active
  if (raceState.status !== 'racing') {
    return { success: false, reason: 'race-not-active' };
  }

  // Initialize tap history
  if (!raceState.tapHistory[playerId]) {
    raceState.tapHistory[playerId] = [];
  }

  // Remove taps older than 1 second
  const oneSecondAgo = currentTime - 1000;
  raceState.tapHistory[playerId] = raceState.tapHistory[playerId].filter(t => t > oneSecondAgo);

  // Check rate limit (max 10 taps/sec)
  if (raceState.tapHistory[playerId].length >= 10) {
    return { success: false, reason: 'rate-limited' };
  }

  // Record tap
  raceState.tapHistory[playerId].push(currentTime);

  const round = raceState.rounds[raceState.currentRound];
  if (!round) {
    return { success: false, reason: 'no-active-round' };
  }

  // Increase velocity instead of directly adding distance
  const currentVelocity = round.velocities[playerId] || 0;
  const newVelocity = Math.min(PHYSICS.MAX_VELOCITY, currentVelocity + PHYSICS.TAP_ACCELERATION);

  round.velocities[playerId] = newVelocity;
  round.taps[playerId] = (round.taps[playerId] || 0) + 1;

  return {
    success: true,
    velocity: newVelocity,
    position: round.positions[playerId] || 0,
    taps: round.taps[playerId]
  };
}

// Calculate winners for a round
function calculateWinners(roundNumber) {
  const round = raceState.rounds[roundNumber];
  if (!round) return [];

  // Sort by distance (descending)
  const rankings = Object.entries(round.positions)
    .map(([playerId, distance]) => ({ playerId, distance }))
    .sort((a, b) => b.distance - a.distance);

  // Select top N winners (or all players if fewer than required)
  const configuredWinners = ROUND_CONFIG[roundNumber].winners;
  const actualWinners = Math.min(configuredWinners, rankings.length);
  const winners = rankings.slice(0, actualWinners).map(r => r.playerId);

  // Mark eliminated players (only if there are more players than winners)
  if (rankings.length > actualWinners) {
    rankings.slice(actualWinners).forEach(r => {
      raceState.players[r.playerId].eliminated = true;
    });
  }

  return winners;
}

// Advance to next round
function advanceToNextRound(winners, currentRound) {
  // If only 1 winner remains or we've completed round 4, game is complete
  if (currentRound === 4 || winners.length === 1) {
    raceState.status = 'complete';
    return { complete: true, winner: winners[0] };
  }

  const nextRound = currentRound + 1;

  // Initialize next round
  raceState.rounds[nextRound] = {
    participants: winners,
    positions: {},
    velocities: {},
    taps: {},
    winners: [],
    startTime: null,
    endTime: null
  };

  // Initialize positions and velocities for next round
  winners.forEach(id => {
    raceState.rounds[nextRound].positions[id] = 0;
    raceState.rounds[nextRound].velocities[id] = 0;
    raceState.rounds[nextRound].taps[id] = 0;

    if (raceState.players[id]) {
      raceState.players[id].currentRound = nextRound;
    }
  });

  raceState.currentRound = nextRound;
  raceState.status = 'waiting';

  return { complete: false, round: nextRound };
}

// ===== RACE API ENDPOINTS =====

// Get race status
app.get('/api/race/status', (req, res) => {
  res.json(raceState);
});

// Join race
app.post('/api/race/join', (req, res) => {
  const playerId = generatePlayerId();
  const cakeId = getNextAvailableCake();

  // Get cake name from cakeId (client will load from cakes.js)
  const cakeNames = [
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

  const cakeName = cakeNames[cakeId - 1] || `Cake ${cakeId}`;

  // Create player (not visible until they click JOIN)
  raceState.players[playerId] = {
    id: playerId,
    name: cakeName,
    cakeId: cakeId,
    joinedAt: Date.now(),
    currentRound: raceState.currentRound || 1,
    eliminated: false,
    visible: false  // Only visible after clicking JOIN RACE button
  };

  // Add to current round (or round 1 if waiting)
  const roundNum = raceState.currentRound || 1;
  if (!raceState.rounds[roundNum]) {
    raceState.rounds[roundNum] = {
      participants: [],
      positions: {},
      velocities: {},
      taps: {},
      winners: [],
      startTime: null,
      endTime: null
    };
  }

  // Add to participants if not already there
  if (!raceState.rounds[roundNum].participants.includes(playerId)) {
    raceState.rounds[roundNum].participants.push(playerId);
    raceState.rounds[roundNum].positions[playerId] = 0;
    raceState.rounds[roundNum].velocities[playerId] = 0;
    raceState.rounds[roundNum].taps[playerId] = 0;
  }

  res.json({
    playerId,
    cakeId,
    cakeName,
    currentRound: raceState.currentRound || 1
  });
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

  // Make player visible
  player.visible = true;

  res.json({ success: true });
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

  // Start the current round or round 1
  const roundNum = raceState.currentRound || 1;

  if (!raceState.rounds[roundNum]) {
    raceState.rounds[roundNum] = {
      participants: Object.keys(raceState.players),
      positions: {},
      velocities: {},
      taps: {},
      winners: [],
      startTime: Date.now(),
      endTime: null
    };

    // Initialize positions and velocities for all participants
    raceState.rounds[roundNum].participants.forEach(playerId => {
      raceState.rounds[roundNum].positions[playerId] = 0;
      raceState.rounds[roundNum].velocities[playerId] = 0;
      raceState.rounds[roundNum].taps[playerId] = 0;
    });
  } else {
    raceState.rounds[roundNum].startTime = Date.now();
  }

  raceState.status = 'racing';
  raceState.currentRound = roundNum;
  raceState.roundStartTime = Date.now();

  // Start physics loop for continuous movement
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

    // Stop physics loop
    stopPhysicsLoop();

    // Calculate winners
    const winners = calculateWinners(currentRound);
    round.winners = winners;

    // Advance to next round
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

  // Stop physics loop
  stopPhysicsLoop();

  // Reset all state
  raceState = {
    status: 'waiting',
    currentRound: 0,
    roundStartTime: null,
    players: {},
    rounds: {},
    tapHistory: {},
    availableCakes: Array.from({length: 55}, (_, i) => i + 1)
  };

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
