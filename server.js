require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { google } = require('googleapis');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public', { index: false }));

const AUDITION_TIMEZONE = process.env.AUDITION_TIMEZONE || 'Australia/Sydney';
const AUDITION_SLOT_DURATION_MINUTES = Number.parseInt(process.env.AUDITION_SLOT_DURATION_MINUTES || '5', 10);
const AUDITION_SLOT_GAP_MINUTES = Number.parseInt(process.env.AUDITION_SLOT_GAP_MINUTES || '5', 10);
const AUDITION_WINDOW_START = process.env.AUDITION_WINDOW_START || '';
const AUDITION_WINDOW_END = process.env.AUDITION_WINDOW_END || '';
const AUDITION_PACK_PATH = process.env.AUDITION_PACK_PATH || path.join(__dirname, 'assets', 'audition-pack.pdf');
const AUDITION_REGISTRATION_SECRET = process.env.AUDITION_REGISTRATION_SECRET || 'change-me-before-production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || '';
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';
const GOOGLE_GMAIL_USER = process.env.GOOGLE_GMAIL_USER || '';
const REGISTRATION_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const slotLabelFormatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: AUDITION_TIMEZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit'
});

const slotEndFormatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: AUDITION_TIMEZONE,
  hour: 'numeric',
  minute: '2-digit'
});

const slotEmailFormatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: AUDITION_TIMEZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit'
});

let googleAuthClient = null;
function validateAuditionWindow() {
  if (!AUDITION_WINDOW_START || !AUDITION_WINDOW_END) {
    throw new Error('Audition window is not configured. Set AUDITION_WINDOW_START and AUDITION_WINDOW_END.');
  }

  if (!Number.isFinite(AUDITION_SLOT_DURATION_MINUTES) || AUDITION_SLOT_DURATION_MINUTES <= 0) {
    throw new Error('AUDITION_SLOT_DURATION_MINUTES must be a positive integer.');
  }

  if (!Number.isFinite(AUDITION_SLOT_GAP_MINUTES) || AUDITION_SLOT_GAP_MINUTES < 0) {
    throw new Error('AUDITION_SLOT_GAP_MINUTES must be zero or a positive integer.');
  }

  const start = new Date(AUDITION_WINDOW_START);
  const end = new Date(AUDITION_WINDOW_END);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('AUDITION_WINDOW_START and AUDITION_WINDOW_END must be valid ISO timestamps.');
  }

  if (end <= start) {
    throw new Error('AUDITION_WINDOW_END must be after AUDITION_WINDOW_START.');
  }

  return {
    start,
    end,
    slotDurationMinutes: AUDITION_SLOT_DURATION_MINUTES,
    slotGapMinutes: AUDITION_SLOT_GAP_MINUTES,
    slotDurationMs: AUDITION_SLOT_DURATION_MINUTES * 60 * 1000,
    slotStepMs: (AUDITION_SLOT_DURATION_MINUTES + AUDITION_SLOT_GAP_MINUTES) * 60 * 1000
  };
}

function ensureGoogleCredentials() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('Google integration is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.');
  }
}

function getGoogleAuthClient() {
  ensureGoogleCredentials();

  if (!googleAuthClient) {
    googleAuthClient = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    googleAuthClient.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  }

  return googleAuthClient;
}

function getCalendarClient() {
  return google.calendar({
    version: 'v3',
    auth: getGoogleAuthClient()
  });
}

function getGmailClient() {
  return google.gmail({
    version: 'v1',
    auth: getGoogleAuthClient()
  });
}

function sanitizeName(name = '') {
  return name.replace(/\s+/g, ' ').trim();
}

function isValidEmail(email = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function createRegistrationToken(name, email) {
  const payload = {
    name,
    email,
    issuedAt: Date.now()
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', AUDITION_REGISTRATION_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  return `${encodedPayload}.${signature}`;
}

function verifyRegistrationToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    throw new Error('Registration token is missing or invalid.');
  }

  const [encodedPayload, providedSignature] = token.split('.');
  const expectedSignature = crypto
    .createHmac('sha256', AUDITION_REGISTRATION_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new Error('Registration token could not be verified.');
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));

  if (!payload.issuedAt || Date.now() - payload.issuedAt > REGISTRATION_TOKEN_MAX_AGE_MS) {
    throw new Error('Registration token has expired. Please register again.');
  }

  return {
    name: sanitizeName(payload.name),
    email: String(payload.email || '').trim().toLowerCase()
  };
}

function buildAuditionSlots() {
  const { start, end, slotDurationMs, slotStepMs } = validateAuditionWindow();
  const slots = [];

  for (let slotStartMs = start.getTime(); slotStartMs + slotDurationMs <= end.getTime(); slotStartMs += slotStepMs) {
    const slotStart = new Date(slotStartMs);
    const slotEnd = new Date(slotStartMs + slotDurationMs);

    slots.push({
      start: slotStart,
      end: slotEnd,
      eventId: buildAuditionEventId(slotStart),
      label: `${slotLabelFormatter.format(slotStart)} - ${slotEndFormatter.format(slotEnd)}`
    });
  }

  return slots;
}

function buildAuditionEventId(slotStart) {
  return `audition${slotStart.getTime().toString(16)}`;
}

function findSlotByStart(slotStartIso) {
  const requestedStart = new Date(slotStartIso);

  if (Number.isNaN(requestedStart.getTime())) {
    return null;
  }

  return buildAuditionSlots().find((slot) => slot.start.getTime() === requestedStart.getTime()) || null;
}

async function listBusyRanges(calendar, windowStart, windowEnd) {
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: windowStart.toISOString(),
      timeMax: windowEnd.toISOString(),
      items: [{ id: GOOGLE_CALENDAR_ID }]
    }
  });

  return response.data.calendars?.[GOOGLE_CALENDAR_ID]?.busy || [];
}

function slotIsBusy(slot, busyRanges, now = new Date()) {
  if (slot.start <= now) {
    return true;
  }

  return busyRanges.some((range) => {
    const busyStart = new Date(range.start);
    const busyEnd = new Date(range.end);

    return slot.start < busyEnd && slot.end > busyStart;
  });
}

async function buildWatermarkedPack(name) {
  const existingPdfBytes = await fs.readFile(AUDITION_PACK_PATH);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const watermark = sanitizeName(name).toUpperCase();

  pdfDoc.getPages().forEach((page) => {
    const { width, height } = page.getSize();
    const fontSize = Math.max(42, Math.min(width, height) / 7);
    const textWidth = font.widthOfTextAtSize(watermark, fontSize);
    const positions = [0.74, 0.5, 0.26];

    positions.forEach((ratio) => {
      page.drawText(watermark, {
        x: (width - textWidth) / 2,
        y: height * ratio - fontSize / 2,
        size: fontSize,
        font,
        rotate: degrees(35),
        color: rgb(0.55, 0.55, 0.55),
        opacity: 0.12
      });
    });
  });

  return Buffer.from(await pdfDoc.save());
}

async function createAuditionEvent(name, email, slot) {
  const calendar = getCalendarClient();

  return calendar.events.insert({
    calendarId: GOOGLE_CALENDAR_ID,
    conferenceDataVersion: 1,
    sendUpdates: 'all',
    requestBody: {
      summary: `${name} - Audition`,
      description: `Audition booking for ${name} (${email}).`,
      attendees: [
        {
          email,
          displayName: name
        }
      ],
      extendedProperties: {
        private: {
          registrationEmail: email,
          registrationName: name,
          slotStart: slot.start.toISOString(),
          slotEnd: slot.end.toISOString()
        }
      },
      start: {
        dateTime: slot.start.toISOString(),
        timeZone: AUDITION_TIMEZONE
      },
      end: {
        dateTime: slot.end.toISOString(),
        timeZone: AUDITION_TIMEZONE
      },
      conferenceData: {
        createRequest: {
          requestId: `${slot.eventId}-${Date.now()}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      }
    }
  });
}

async function listAuditionEvents(calendar, windowStart, windowEnd) {
  const response = await calendar.events.list({
    calendarId: GOOGLE_CALENDAR_ID,
    timeMin: windowStart.toISOString(),
    timeMax: windowEnd.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250
  });

  return response.data.items || [];
}

async function getAuditionEvent(calendar, eventId) {
  const response = await calendar.events.get({
    calendarId: GOOGLE_CALENDAR_ID,
    eventId
  });

  return response.data;
}

function buildBookingDetailsFromEvent(event) {
  const start = event.start?.dateTime || event.start?.date || '';
  const end = event.end?.dateTime || event.end?.date || '';
  const meetLink =
    event.hangoutLink ||
    event.conferenceData?.entryPoints?.find((entryPoint) => entryPoint.entryPointType === 'video')?.uri ||
    '';

  return {
    eventId: event.id,
    eventLink: event.htmlLink || '',
    meetLink,
    slot: {
      start,
      end,
      label: start && end ? `${slotLabelFormatter.format(new Date(start))} - ${slotEndFormatter.format(new Date(end))}` : event.summary || 'Booked slot'
    }
  };
}

function escapeIcsText(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatIcsDate(dateLike) {
  const date = new Date(dateLike);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid event date for calendar file.');
  }

  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function buildAuditionIcs(event, attendeeName) {
  const booking = buildBookingDetailsFromEvent(event);
  const start = formatIcsDate(booking.slot.start);
  const end = formatIcsDate(booking.slot.end);
  const stamp = formatIcsDate(new Date());
  const attendeeEmail = event.extendedProperties?.private?.registrationEmail || '';
  const description = [
    `Audition booking for ${attendeeName}.`,
    booking.meetLink ? `Google Meet: ${booking.meetLink}` : '',
    `Timezone: ${AUDITION_TIMEZONE}`
  ].filter(Boolean).join('\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AKHSBAC//Auditions//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(event.id)}@akhsbac.site`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(event.summary || `${attendeeName} - Audition`)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(booking.meetLink || 'Online')}`,
    attendeeEmail ? `ATTENDEE;CN=${escapeIcsText(attendeeName)}:mailto:${escapeIcsText(attendeeEmail)}` : '',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');
}

function buildConfirmationEmail(name, bookingDetails) {
  const startDate = new Date(bookingDetails.slot.start);
  const endDate = new Date(bookingDetails.slot.end);
  const startLabel = slotEmailFormatter.format(startDate);
  const endTimeLabel = slotEndFormatter.format(endDate).replace(/\s/g, '');
  const meetLine = bookingDetails.meetLink
    ? `Google Meet:\n${bookingDetails.meetLink}\n\n`
    : '';

  return {
    subject: `Audition confirmed - ${startLabel} ${AUDITION_TIMEZONE}`,
    text: [
      `Hi ${name},`,
      '',
      'Your audition is confirmed.',
      '',
      'Time:',
      `${startLabel} - ${endTimeLabel}`,
      AUDITION_TIMEZONE,
      '',
      meetLine,
      'If you need anything, reply to this email.',
      '',
      'AKHSBAC'
    ].join('\n')
  };
}

async function sendConfirmationEmail(name, recipientEmail, bookingDetails) {
  if (!GOOGLE_GMAIL_USER) {
    throw new Error('GOOGLE_GMAIL_USER must be configured to send confirmation emails.');
  }

  const gmail = getGmailClient();
  const email = buildConfirmationEmail(name, bookingDetails);
  const rawMessage = [
    `From: AKHSBAC <${GOOGLE_GMAIL_USER}>`,
    `To: ${recipientEmail}`,
    `Subject: ${email.subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    'Content-Transfer-Encoding: 7bit',
    '',
    email.text
  ].join('\r\n');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '')
    }
  });
}

function findExistingBookingForAttendee(events, email) {
  return events.find((event) => {
    if (event.status === 'cancelled') {
      return false;
    }

    const registeredEmail = event.extendedProperties?.private?.registrationEmail;
    if (registeredEmail && registeredEmail.toLowerCase() === email) {
      return true;
    }

    if (event.attendees?.some((attendee) => String(attendee.email || '').trim().toLowerCase() === email)) {
      return true;
    }

    return typeof event.description === 'string' && event.description.includes(`(${email})`);
  }) || null;
}

// In-memory vote storage
let votes = {
  julia: 0,
  betty: 0
};

// Get current votes
app.get('/api/votes', (req, res) => {
  res.json(votes);
});

// Submit a vote
app.post('/api/vote', (req, res) => {
  const { vote } = req.body;

  if (vote === 'julia' || vote === 'betty') {
    votes[vote]++;
    res.json({ success: true, votes });
  } else {
    res.status(400).json({ success: false, error: 'Invalid vote' });
  }
});

// Reset votes (for testing)
app.post('/api/reset', (req, res) => {
  votes = { julia: 0, betty: 0 };
  res.json({ success: true, votes });
});

// ===== AUDITIONS =====

app.post('/api/audition/register', async (req, res) => {
  try {
    const name = sanitizeName(req.body?.name);
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!name) {
      return res.status(400).json({ success: false, error: 'Please enter your name.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    validateAuditionWindow();

    res.json({
      success: true,
      registrationToken: createRegistrationToken(name, email),
      message: 'Your registration is complete. You can now open the audition pack and choose a slot.'
    });
  } catch (error) {
    console.error('Audition registration failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Could not complete registration right now.'
    });
  }
});

app.get('/api/audition/pack', async (req, res) => {
  try {
    const attendee = verifyRegistrationToken(req.query.registrationToken);
    const pdfBuffer = await buildWatermarkedPack(attendee.name);
    const safeFileName = `${attendee.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'audition'}-pack.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${req.query.download ? 'attachment' : 'inline'}; filename="${safeFileName}"`
    );
    res.send(pdfBuffer);
  } catch (error) {
    const statusCode = /token/i.test(error.message) ? 401 : 500;
    console.error('Could not build audition pack:', error);
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Could not open the audition pack right now.'
    });
  }
});

app.get('/api/audition/slots', async (req, res) => {
  try {
    const attendee = verifyRegistrationToken(req.query.registrationToken);
    const calendar = getCalendarClient();
    const windowConfig = validateAuditionWindow();
    const slots = buildAuditionSlots();
    const busyRanges = await listBusyRanges(calendar, windowConfig.start, windowConfig.end);
    const events = await listAuditionEvents(calendar, windowConfig.start, windowConfig.end);
    const existingBooking = findExistingBookingForAttendee(events, attendee.email);

    res.json({
      success: true,
      attendee,
      timezone: AUDITION_TIMEZONE,
      windowStart: windowConfig.start.toISOString(),
      windowEnd: windowConfig.end.toISOString(),
      slotDurationMinutes: windowConfig.slotDurationMinutes,
      slotGapMinutes: windowConfig.slotGapMinutes,
      existingBooking: existingBooking ? buildBookingDetailsFromEvent(existingBooking) : null,
      slots: slots.map((slot) => ({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        label: slot.label,
        available: !slotIsBusy(slot, busyRanges)
      }))
    });
  } catch (error) {
    const statusCode = /token/i.test(error.message) ? 401 : 500;
    console.error('Could not load audition slots:', error);
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Could not load audition slots right now.'
    });
  }
});

app.post('/api/audition/book', async (req, res) => {
  try {
    const attendee = verifyRegistrationToken(req.body?.registrationToken);
    const slot = findSlotByStart(req.body?.slotStart);

    if (!slot) {
      return res.status(400).json({ success: false, error: 'That audition slot is invalid.' });
    }

    const calendar = getCalendarClient();
    const windowConfig = validateAuditionWindow();
    const events = await listAuditionEvents(calendar, windowConfig.start, windowConfig.end);
    const existingBooking = findExistingBookingForAttendee(events, attendee.email);

    if (existingBooking) {
      return res.status(409).json({
        success: false,
        error: 'You already have an audition slot booked.',
        existingBooking: buildBookingDetailsFromEvent(existingBooking)
      });
    }

    const busyRanges = await listBusyRanges(calendar, windowConfig.start, windowConfig.end);

    if (slotIsBusy(slot, busyRanges)) {
      return res.status(409).json({
        success: false,
        error: 'That audition slot has already been taken. Please choose another one.'
      });
    }

    const response = await createAuditionEvent(attendee.name, attendee.email, slot);
    const bookingDetails = buildBookingDetailsFromEvent(response.data);
    let confirmationEmailSent = false;
    let confirmationEmailError = '';

    try {
      await sendConfirmationEmail(attendee.name, attendee.email, bookingDetails);
      confirmationEmailSent = true;
    } catch (emailError) {
      confirmationEmailError = emailError.message || 'Confirmation email could not be sent.';
      console.error('Could not send audition confirmation email:', emailError);
    }

    res.json({
      success: true,
      message: 'Your audition is booked. Check your email for your calendar invite and Google Meet link.',
      confirmationEmailSent,
      confirmationEmailError,
      ...bookingDetails
    });
  } catch (error) {
    const statusCode = error?.code === 409 ? 409 : /token/i.test(error.message) ? 401 : 500;
    console.error('Could not book audition slot:', error);
    res.status(statusCode).json({
      success: false,
      error:
        statusCode === 409
          ? 'That audition slot was just taken. Please pick another one.'
          : error.message || 'Could not book that audition slot right now.'
    });
  }
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

const MAX_BRACKET_SIZE = 16;
const MAX_CAKES = CAKE_NAMES.length;

const ROUND_DURATION_SECONDS = 30;
const ROUND_DURATION_MS = ROUND_DURATION_SECONDS * 1000;

// Physics constants
const PHYSICS = {
  TICK_MS: 1000 / 60,
  TAP_RATE_LIMIT: 12,
  BOOST_PER_TAP: 0.2,
  MAX_BOOST: 1,
  BOOST_DECAY_PER_SECOND: 1.05,
  MAX_SPEED: 480,
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
    rankings: [],
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
    lastResult: null,
    roundTargets: [],
    players: {},
    rounds: {},
    tapHistory: {},
    devicePlayers: {},
    availableCakes: Array.from({ length: MAX_CAKES }, (_, index) => index + 1)
  };
}

let raceState = createInitialRaceState();
let physicsInterval = null;

function generatePlayerId() {
  return 'player_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
}

function getNextAvailableCake() {
  return raceState.availableCakes.shift() || null;
}

function getPlayerLaneIndex(playerId) {
  return raceState.players[playerId]?.laneIndex ?? Number.MAX_SAFE_INTEGER;
}

function sortPlayerIdsByLane(playerIds = []) {
  return [...playerIds].sort((a, b) => getPlayerLaneIndex(a) - getPlayerLaneIndex(b));
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

function buildRoundTargets(participantCount) {
  if (participantCount <= 1) {
    return [1];
  }

  let nextCut = 1;

  while (nextCut * 2 < participantCount && nextCut * 2 <= MAX_BRACKET_SIZE) {
    nextCut *= 2;
  }

  const targets = [];

  for (let size = nextCut; size >= 1; size /= 2) {
    targets.push(size);
  }

  return targets;
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
    laneIndex: player.laneIndex,
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

  if (round.startTime && Date.now() - round.startTime >= ROUND_DURATION_MS) {
    finishCurrentRound('timer');
  }
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

function buildRoundRankings(roundNumber) {
  const round = raceState.rounds[roundNumber];
  if (!round) {
    return [];
  }

  return round.participants
    .map((playerId) => ({
      playerId,
      distance: round.positions[playerId] || 0,
      taps: round.taps[playerId] || 0,
      joinedAt: raceState.players[playerId]?.joinedAt || 0
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
}

function calculateWinners(roundNumber) {
  const rankings = buildRoundRankings(roundNumber);

  if (rankings.length === 0) {
    return { rankings: [], winners: [], eliminated: [] };
  }

  const configuredWinners = raceState.roundTargets[roundNumber - 1] || 1;
  const actualWinners = Math.min(configuredWinners, rankings.length);
  const winners = rankings.slice(0, actualWinners).map((ranking) => ranking.playerId);
  const eliminated = rankings.slice(actualWinners).map((ranking) => ranking.playerId);

  eliminated.forEach((playerId) => {
    if (raceState.players[playerId]) {
      raceState.players[playerId].eliminated = true;
    }
  });

  return { rankings, winners, eliminated };
}

function advanceToNextRound(winners, currentRound) {
  raceState.roundStartTime = null;
  const nextTarget = raceState.roundTargets[currentRound] || null;

  if (!nextTarget || winners.length <= 1) {
    raceState.status = 'complete';
    raceState.currentRound = currentRound;
    return { complete: true, winner: winners[0] || null };
  }

  const nextRound = currentRound + 1;
  const stableLaneWinners = sortPlayerIdsByLane(winners);
  raceState.rounds[nextRound] = createRound(stableLaneWinners);

  stableLaneWinners.forEach((playerId) => {
    if (raceState.players[playerId]) {
      raceState.players[playerId].currentRound = nextRound;
    }
  });

  raceState.currentRound = nextRound;
  raceState.status = 'results';

  return { complete: false, round: nextRound };
}

function finishCurrentRound(reason = 'manual') {
  if (raceState.status !== 'racing') {
    return null;
  }

  const currentRound = raceState.currentRound;
  const round = raceState.rounds[currentRound];

  if (!round) {
    return null;
  }

  round.endTime = Date.now();
  stopPhysicsLoop();

  const { rankings, winners, eliminated } = calculateWinners(currentRound);
  round.rankings = rankings;
  round.winners = winners;

  const result = advanceToNextRound(winners, currentRound);

  raceState.lastResult = {
    reason,
    roundNumber: currentRound,
    rankings,
    winners,
    eliminated,
    finishedAt: round.endTime,
    nextRound: result.round || null,
    complete: result.complete,
    winner: result.winner || null
  };

  return {
    success: true,
    winners,
    rankings,
    complete: result.complete,
    nextRound: result.round || null,
    winner: result.winner || null
  };
}

// ===== RACE API ENDPOINTS =====

// Get race status
app.get('/api/race/status', (req, res) => {
  res.json({
    ...raceState,
    serverTime: Date.now()
  });
});

app.get('/', (req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

app.get('/survey', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/survey/vote', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vote.html'));
});

app.get('/survey/display', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/audition', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'audition.html'));
});

app.get('/race', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'race', 'display.html'));
});

app.get('/race/play', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'race', 'play.html'));
});

app.get('/race/display', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'race', 'display.html'));
});

app.get('/race/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'race', 'admin.html'));
});

app.get('/race/cupcakes', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'race', 'cupcakes.html'));
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

  if (Object.keys(raceState.players).length >= MAX_CAKES) {
    return res.status(409).json({
      success: false,
      error: `All ${MAX_CAKES} cupcakes are already in use. Reset the race to start a fresh field.`
    });
  }

  const playerId = generatePlayerId();
  const cakeId = getNextAvailableCake();
  if (!cakeId) {
    return res.status(409).json({
      success: false,
      error: `All ${MAX_CAKES} cupcakes are already in use. Reset the race to start a fresh field.`
    });
  }

  const cakeName = CAKE_NAMES[cakeId - 1] || `Cake ${cakeId}`;
  const player = {
    id: playerId,
    deviceId,
    name: cakeName,
    cakeId,
    laneIndex: Object.keys(raceState.players).length,
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

  if (raceState.status === 'racing') {
    return res.json({ success: false, error: 'A round is already in play' });
  }

  if (raceState.status === 'complete') {
    return res.json({ success: false, error: 'The tournament is complete. Reset to start again.' });
  }

  const roundNum = raceState.currentRound || 1;
  const round = ensureRound(roundNum);
  const activeParticipants = sortPlayerIdsByLane(round.participants.filter((playerId) => {
    const player = raceState.players[playerId];
    return player && player.visible && !player.eliminated && player.currentRound === roundNum;
  }));

  if (activeParticipants.length === 0) {
    return res.json({ success: false, error: 'No activated cakes are ready for this round' });
  }

  if (raceState.roundTargets.length === 0) {
    raceState.roundTargets = buildRoundTargets(activeParticipants.length);
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
  raceState.lastResult = null;

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

  const result = finishCurrentRound('manual');

  if (!result) {
    res.json({ success: false, error: 'No round data' });
    return;
  }

  res.json(result);
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
  console.log(`Survey Home: http://localhost:${PORT}/survey`);
  console.log(`Survey Vote: http://localhost:${PORT}/survey/vote`);
  console.log(`Survey Display Alias: http://localhost:${PORT}/survey/display`);
  console.log(`Audition Booking: http://localhost:${PORT}/audition`);
  console.log(`Race Home: http://localhost:${PORT}/race`);
  console.log(`Race Play: http://localhost:${PORT}/race/play`);
  console.log(`Race Display Alias: http://localhost:${PORT}/race/display`);
  console.log(`Race Admin: http://localhost:${PORT}/race/admin`);
  console.log(`Cupcake Gallery: http://localhost:${PORT}/race/cupcakes`);
});
