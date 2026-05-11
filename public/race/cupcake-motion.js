(function attachCupcakeMotion(global) {
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

  function createProfile(seed, mode = 'idle') {
    const random = mulberry32(hashString(`${seed}:${mode}`));
    const profile = {
      mode,
      seed,
      pace: 0.75 + random() * 0.85,
      bobAmp: 1.6 + random() * 3.8,
      bobSpeed: 1.2 + random() * 1.5,
      swayAmp: 0.6 + random() * 2.6,
      swaySpeed: 0.45 + random() * 1.25,
      tiltAmp: 1.5 + random() * 5.5,
      tiltSpeed: 0.7 + random() * 1.35,
      hopAmp: 1 + random() * 4.5,
      hopSpeed: 1.5 + random() * 1.7,
      breatheAmp: 0.01 + random() * 0.03,
      breatheSpeed: 0.5 + random() * 0.8,
      driftAmp: 0.4 + random() * 2.2,
      driftSpeed: 0.25 + random() * 0.8,
      phaseA: random() * Math.PI * 2,
      phaseB: random() * Math.PI * 2,
      phaseC: random() * Math.PI * 2,
      phaseD: random() * Math.PI * 2,
      phaseE: random() * Math.PI * 2,
      phaseF: random() * Math.PI * 2,
      phaseG: random() * Math.PI * 2,
      runLean: 1.5 + random() * 4.5,
      settle: 0.8 + random() * 0.8,
      phraseSpeed: 0.24 + random() * 0.38,
      phraseAmp: 0.25 + random() * 0.45,
      accentSpeed: 0.45 + random() * 0.55,
      accentAmp: 0.45 + random() * 0.75,
      glanceAmp: 0.35 + random() * 0.9,
      bounceSharpness: 1.5 + random() * 1.5
    };

    if (mode === 'race') {
      profile.bobAmp *= 0.75;
      profile.hopAmp *= 0.7;
      profile.tiltAmp *= 0.85;
      profile.driftAmp *= 0.45;
    }

    if (mode === 'podium') {
      profile.bobAmp *= 1.35;
      profile.hopAmp *= 1.4;
      profile.swayAmp *= 1.4;
      profile.tiltAmp *= 1.15;
      profile.phraseAmp *= 1.35;
      profile.accentAmp *= 1.35;
    }

    if (mode === 'card') {
      profile.bobAmp *= 1.35;
      profile.swayAmp *= 1.55;
      profile.hopAmp *= 1.9;
      profile.tiltAmp *= 1.45;
      profile.driftAmp *= 1.15;
      profile.phraseAmp *= 1.85;
      profile.accentAmp *= 2;
      profile.glanceAmp *= 1.55;
      profile.breatheAmp *= 1.2;
    }

    return profile;
  }

  function computeTransform(profile, now, context = {}) {
    const t = now / 1000;
    const velocity = Math.max(0, context.velocity || 0);
    const velocityNorm = Math.min(1, velocity / 480);
    const intensity = Math.max(0.2, context.intensity ?? 1);
    const facing = context.facing ?? 1;
    const baseScale = context.baseScale ?? 1;

    const pace = profile.pace;
    const phrase = 0.5 + 0.5 * Math.sin(t * profile.phraseSpeed * pace + profile.phaseF);
    const settleWave = 0.5 + 0.5 * Math.sin(t * profile.settle * pace + profile.phaseG);
    const settleBlend = 0.55 + settleWave * (0.45 + profile.phraseAmp * 0.2);
    const accentCarrier = Math.max(0, Math.sin(t * profile.accentSpeed * pace + profile.phaseE));
    const accent = Math.pow(accentCarrier, 4.5 - Math.min(2, profile.bounceSharpness));
    const offAccent = Math.max(0, Math.sin(t * (profile.accentSpeed * 0.61) * pace + profile.phaseB));
    const glance = Math.sin(t * (profile.tiltSpeed * 0.34) * pace + profile.phaseF) * profile.glanceAmp;
    const drift = Math.sin(t * profile.driftSpeed * pace + profile.phaseA) * profile.driftAmp;
    const sway = Math.sin(t * profile.swaySpeed * pace + profile.phaseB) * profile.swayAmp;
    const secondaryBob = Math.sin(t * (profile.bobSpeed * 0.63) * pace + profile.phaseC) * (profile.bobAmp * 0.45);
    const bob = Math.sin(t * profile.bobSpeed * pace + profile.phaseD) * profile.bobAmp + secondaryBob;
    const hopWave = Math.max(0, Math.sin(t * profile.hopSpeed * pace + profile.phaseE));
    const hop = Math.pow(hopWave, profile.bounceSharpness) * profile.hopAmp * (0.45 + velocityNorm * 0.9 + accent * profile.accentAmp);
    const breathe = Math.sin(t * profile.breatheSpeed * pace + profile.phaseA) * profile.breatheAmp;
    const tilt = Math.sin(t * profile.tiltSpeed * pace + profile.phaseC) * profile.tiltAmp
      + Math.cos(t * profile.swaySpeed * 0.85 * pace + profile.phaseD) * (profile.tiltAmp * 0.35);
    const runLean = velocityNorm * profile.runLean;

    const x = (drift * (0.8 + phrase * 0.5) + sway * (0.65 + phrase * 0.9) + offAccent * profile.swayAmp * 0.22) * intensity;
    const y = ((bob * settleBlend) - hop - accent * profile.bobAmp * 0.3) * intensity;
    const rotate = (tilt * (0.8 + phrase * 0.55) + glance * (0.7 + accent * 0.5)) * intensity + runLean;
    const squash = hop * 0.008 + accent * 0.012;
    const stretch = hop * 0.012 + accent * 0.018;
    const scaleY = baseScale * (1 + breathe + stretch - squash * 0.45);
    const scaleX = baseScale * (1 - breathe * 0.65 - squash + stretch * 0.2) * facing;

    return { x, y, rotate, scaleX, scaleY };
  }

  global.CupcakeMotion = {
    hashString,
    mulberry32,
    createProfile,
    computeTransform
  };
})(window);
