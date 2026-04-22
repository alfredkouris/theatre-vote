# Theatre Vote System

A minimal, fast live voting system for theatre shows with a stainless steel aesthetic.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open in your browser:
   - **Display (for projection)**: http://localhost:3000/display.html
   - **Voting page**: http://localhost:3000/vote.html

## Usage

### For the theatre:
1. Open `display.html` on the computer connected to your projector
2. Audience members scan the QR code with their phones
3. They vote Agree/Disagree on Harry's behaviour
4. Results update live on the projected display

### URLs:
- Display page: Shows QR code (left) + live graph (right)
- Vote page: The page audience members access to vote

## Features

- **Real-time updates**: Votes appear instantly on the display
- **Minimal design**: Clean stainless steel aesthetic
- **Mobile-friendly**: Voting page works on all devices
- **No database needed**: Uses in-memory storage (resets on restart)
- **Fast & lightweight**: No unnecessary dependencies

## API Endpoints

- `GET /api/votes` - Get current vote counts
- `POST /api/vote` - Submit a vote (body: `{"vote": "agree"}` or `{"vote": "disagree"}`)
- `POST /api/reset` - Reset all votes to zero

## Customization

### Change the question:
Edit the `<h1>` tag in both `display.html` and `vote.html`

### Change colors:
Modify `styles.css` - look for background colors and borders

### Change update frequency:
In `display.html`, find `setInterval(updateVotes, 1000)` and change `1000` (milliseconds)

## Deploy to Railway

1. Push this repository to GitHub

2. Go to [railway.app](https://railway.app) and sign in with GitHub

3. Click "New Project" → "Deploy from GitHub repo"

4. Select your `theatre-vote` repository

5. Railway will automatically detect the Node.js app and deploy it

6. Once deployed, click "Generate Domain" to get your public URL

7. Your voting system will be live at `https://your-app.railway.app`

That's it! The QR code will automatically update to use your Railway URL.

## Notes

- Votes are stored in memory, so they reset when the app restarts
- For persistent votes, consider adding a database (Railway offers PostgreSQL)
- The free tier is perfect for theatre shows with moderate traffic
