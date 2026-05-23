# Theatre Vote

Small Express app for three lightweight flows:

- `/survey` for the chef survey display
- `/survey/vote` for the survey voting page
- `/race/*` for the cupcake race screens
- `/audition` for the audition registration and booking flow

`/` intentionally returns `404 Not found` so the survey is not exposed at the root URL.

## Run locally

```bash
npm install
npm start
```

## Audition flow

The `/audition` page works in two steps:

1. A person submits their name and email.
2. The server generates a watermarked audition pack PDF with their name for immediate viewing or download.
3. The page loads live 10-minute availability from Google Calendar.
4. When they book a slot, the app creates a Google Calendar event called `[Name] - Audition` and asks Google to email the calendar invitation to the attendee.

There is no database. Slot locking is handled by:

- Checking live busy times from Google Calendar
- Creating each slot with a deterministic Google Calendar event ID so the same 10-minute slot cannot be booked twice

## Railway environment variables

Set these in Railway before using `/audition`:

```bash
AUDITION_TIMEZONE=Australia/Sydney
AUDITION_SLOT_DURATION_MINUTES=5
AUDITION_SLOT_GAP_MINUTES=5
AUDITION_WINDOW_START=2026-05-24T12:00:00+10:00
AUDITION_WINDOW_END=2026-05-24T16:00:00+10:00
AUDITION_PACK_PATH=/app/assets/audition-pack.pdf
AUDITION_REGISTRATION_SECRET=replace-with-a-long-random-string

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_CALENDAR_ID=primary
GOOGLE_GMAIL_USER=akhsbac@gmail.com
```

Place the PDF at `assets/audition-pack.pdf` unless you point `AUDITION_PACK_PATH` somewhere else.

## Google setup

You need one Google OAuth client and one refresh token from the Google account that owns the calendar and sends the plain-text confirmation email.

Required Google scopes:

- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/gmail.send`

The app uses the same Google account to:

- read busy times from Calendar
- create the audition event
- generate the Google Meet link
- send the plain-text booking confirmation email

### Generate the refresh token

Add these first:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Then add this exact OAuth redirect URI to your Google Cloud OAuth client:

```bash
http://127.0.0.1:3005/oauth2callback
```

Run:

```bash
npm run oauth:google
```

The script will print a Google auth URL. Open it, sign into the correct Google account, approve access, and copy the printed `GOOGLE_REFRESH_TOKEN` into Railway. Regenerate the token any time you add scopes such as `gmail.send`.

## Calendar invitation delivery

Attendees receive the calendar invite because the app creates the event with them in the `attendees` list and sends the insert request with `sendUpdates: "all"`.

That means Google Calendar handles the invitation email automatically. No separate database or calendar email logic is needed for invites.
