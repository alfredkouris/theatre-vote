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

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Display: http://localhost:${PORT}/display.html`);
  console.log(`Vote: http://localhost:${PORT}/vote.html`);
});
