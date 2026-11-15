/* Interface sounds — one small synthesised voice per preset.
   Nothing is shipped as an asset: every click is built from an oscillator
   envelope (and the odd burst of filtered noise) at the moment it is needed, so
   each theme can sound like itself — a terminal beeps, a 95 desktop clicks, a
   bubblegum button pops, deco rings a small bell.

   The context is created lazily on the first gesture (browsers refuse to start
   audio before one) and every interface voice is deliberately quiet: this is a
   tick, not a soundtrack. Attention Guard's separately controlled, default-on
   sustained-focus siren uses a separate higher-volume path. */

type Ctor = typeof AudioContext;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let focusAlarmOscillator: OscillatorNode | null = null;
let focusAlarmModulator: OscillatorNode | null = null;
let focusAlarmModulationGain: GainNode | null = null;
let focusAlarmGain: GainNode | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC: Ctor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try {
      const nextContext = new AC();
      const nextMaster = nextContext.createGain();
      // Quiet by design — peaks below are 0.02–0.09 before this.
      nextMaster.gain.value = 0.5;
      nextMaster.connect(nextContext.destination);
      ctx = nextContext;
      master = nextMaster;
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  return ctx;
}

/** A short exponential envelope, already patched into the master bus. */
function envelope(c: AudioContext, at: number, peak: number, attack: number, decay: number) {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  gain.connect(master ?? c.destination);
  return gain;
}

/** One pitched blip, optionally gliding from `from` to `to` hertz. */
function blip(c: AudioContext, wave: OscillatorType, from: number, to: number, at: number, decay: number, peak: number) {
  const osc = c.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(from, at);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 20), at + decay);
  osc.connect(envelope(c, at, peak, Math.min(0.012, decay * 0.3), decay));
  osc.start(at);
  osc.stop(at + decay + 0.06);
}

function noise(c: AudioContext): AudioBuffer | null {
  if (noiseBuffer) return noiseBuffer;
  const length = Math.floor(c.sampleRate * 0.3);
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

/** A burst of filtered noise — paper, clicks, ink. */
function hiss(c: AudioContext, at: number, decay: number, peak: number, type: BiquadFilterType, freq: number, q = 1) {
  const buffer = noise(c);
  if (!buffer) return;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  src.connect(filter);
  filter.connect(envelope(c, at, peak, 0.004, decay));
  src.start(at);
  src.stop(at + decay + 0.05);
}

type Voice = (c: AudioContext, at: number) => void;

/* One voice per preset. Kept explicit rather than derived from colour: what a
   theme should sound like is a design decision, not a function of its hue. */
const VOICES: Record<string, Voice> = {
  // paper & print
  classic: (c, at) => blip(c, "sine", 620, 520, at, 0.09, 0.05),
  editorial: (c, at) => hiss(c, at, 0.05, 0.05, "bandpass", 2400, 1.4),
  brutalist: (c, at) => {
    hiss(c, at, 0.07, 0.09, "lowpass", 700, 0.8);
    blip(c, "square", 150, 92, at, 0.07, 0.045);
  },
  swiss: (c, at) => hiss(c, at, 0.022, 0.06, "highpass", 3200, 0.7),
  sketch: (c, at) => {
    hiss(c, at, 0.07, 0.04, "bandpass", 1800, 0.9);
    hiss(c, at + 0.035, 0.05, 0.025, "bandpass", 2600, 1.1);
  },
  // retro & neon
  terminal: (c, at) => blip(c, "square", 880, 880, at, 0.035, 0.045),
  retro: (c, at) => {
    blip(c, "square", 520, 470, at, 0.026, 0.05);
    hiss(c, at, 0.018, 0.04, "highpass", 2200, 0.7);
  },
  cyber: (c, at) => blip(c, "sawtooth", 1300, 240, at, 0.16, 0.045),
  deco: (c, at) => {
    blip(c, "sine", 880, 880, at, 0.3, 0.038);
    blip(c, "sine", 1320, 1320, at + 0.012, 0.26, 0.02);
  },
  // soft & sculpted
  clay: (c, at) => {
    blip(c, "sine", 320, 170, at, 0.1, 0.06);
    hiss(c, at, 0.05, 0.02, "lowpass", 600, 0.7);
  },
  neu: (c, at) => blip(c, "triangle", 540, 500, at, 0.07, 0.045),
  // curated palettes
  ocean: (c, at) => {
    blip(c, "sine", 900, 280, at, 0.14, 0.05);
    blip(c, "sine", 1800, 560, at + 0.01, 0.1, 0.014);
  },
  sunset: (c, at) => {
    blip(c, "sine", 392, 392, at, 0.22, 0.04);
    blip(c, "sine", 587, 587, at + 0.015, 0.2, 0.02);
  },
  botanical: (c, at) => {
    blip(c, "sine", 660, 660, at, 0.13, 0.05);
    blip(c, "sine", 990, 990, at, 0.06, 0.016);
  },
  // illustrated & motion
  kaleido: (c, at) => {
    [880, 1108, 1318].forEach((freq, index) => blip(c, "triangle", freq, freq, at + index * 0.03, 0.12, 0.032));
  },
  manga: (c, at) => {
    hiss(c, at, 0.06, 0.07, "bandpass", 4200, 1.2);
    hiss(c, at + 0.04, 0.04, 0.03, "bandpass", 5200, 1.4);
  },
  pop: (c, at) => {
    blip(c, "square", 1046, 1046, at, 0.04, 0.038);
    hiss(c, at, 0.03, 0.045, "bandpass", 3000, 1);
  },
  bubblegum: (c, at) => {
    blip(c, "sine", 300, 900, at, 0.08, 0.05);
    blip(c, "sine", 1200, 1500, at + 0.07, 0.03, 0.012);
  },
  vaporwave: (c, at) => {
    blip(c, "sine", 220, 220, at, 0.4, 0.034);
    blip(c, "sine", 330, 330, at + 0.02, 0.36, 0.02);
    hiss(c, at, 0.12, 0.01, "bandpass", 1200, 0.6);
  },
};

/** Fall back to the original look for anything unmapped (fable themes, new ids). */
const FALLBACK: Voice = (c, at) => blip(c, "sine", 620, 520, at, 0.09, 0.05);

export type UiSoundKind = "tap" | "select";

/** Play the interface voice for `design`. Safe to call anywhere: it no-ops when
    audio is unavailable, and starts the context on the first real gesture. */
export function playUi(design: string, kind: UiSoundKind = "tap") {
  const c = audio();
  if (!c) return;
  const at = c.currentTime + 0.001;
  const voice = VOICES[design] ?? FALLBACK;
  try {
    voice(c, at);
    // Picking a theme gets a second, quieter echo so the change feels committed.
    if (kind === "select") voice(c, at + 0.085);
  } catch {
    /* audio is a nicety; never let it break a click */
  }
}

/** Prepare the audio context from the user's explicit sound-preference gesture. */
export function prepareAttentionWarningAudio() {
  audio();
}

/** Unlock Web Audio from the explicit Focus-tracking start or alarm-setting gesture. */
export function prepareFocusAlarmAudio() {
  audio();
}

/** Start a sustained, pitch-wavering alarm for a level-2 off-target state. */
export function startFocusAlarm() {
  const c = audio();
  if (!c || focusAlarmOscillator) return;

  let oscillator: OscillatorNode | null = null;
  let gain: GainNode | null = null;
  let modulator: OscillatorNode | null = null;
  let modulationGain: GainNode | null = null;
  try {
    const at = c.currentTime + 0.02;
    oscillator = c.createOscillator();
    gain = c.createGain();
    modulator = c.createOscillator();
    modulationGain = c.createGain();

    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(820, at);
    modulator.type = "sine";
    modulator.frequency.setValueAtTime(1.5, at);
    modulationGain.gain.setValueAtTime(230, at);
    modulator.connect(modulationGain);
    modulationGain.connect(oscillator.frequency);

    // Keep the unscheduled value quiet too, so a warning that clears during
    // the short scheduling lead-in cannot briefly jump to full volume.
    gain.gain.value = 0.0001;
    // The dedicated direct-to-output bus is deliberately much louder than the
    // optional soft reminder chime, while keeping the peak below full scale.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.17, at + 0.08);
    oscillator.connect(gain);
    gain.connect(c.destination);
    oscillator.start(at);
    modulator.start(at);

    focusAlarmOscillator = oscillator;
    focusAlarmGain = gain;
    focusAlarmModulator = modulator;
    focusAlarmModulationGain = modulationGain;
  } catch {
    try { oscillator?.stop(); } catch { /* oscillator never started */ }
    try { modulator?.stop(); } catch { /* modulator never started */ }
    oscillator?.disconnect();
    modulator?.disconnect();
    gain?.disconnect();
    modulationGain?.disconnect();
    focusAlarmOscillator = null;
    focusAlarmGain = null;
    focusAlarmModulator = null;
    focusAlarmModulationGain = null;
  }
}

/** Play a short copy of the siren from a user gesture to verify browser audio. */
export function playFocusAlarmTest() {
  const c = audio();
  if (!c || focusAlarmOscillator) return;

  let oscillator: OscillatorNode | null = null;
  let gain: GainNode | null = null;
  let modulator: OscillatorNode | null = null;
  let modulationGain: GainNode | null = null;
  try {
    const at = c.currentTime + 0.02;
    const endAt = at + 1.35;
    oscillator = c.createOscillator();
    gain = c.createGain();
    modulator = c.createOscillator();
    modulationGain = c.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(820, at);
    modulator.type = "sine";
    modulator.frequency.setValueAtTime(1.5, at);
    modulationGain.gain.setValueAtTime(230, at);
    modulator.connect(modulationGain);
    modulationGain.connect(oscillator.frequency);
    gain.gain.value = 0.0001;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.17, at + 0.08);
    gain.gain.setValueAtTime(0.17, endAt - 0.14);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt - 0.04);
    oscillator.connect(gain);
    gain.connect(c.destination);
    oscillator.start(at);
    modulator.start(at);
    oscillator.stop(endAt);
    modulator.stop(endAt);
    oscillator.onended = () => {
      oscillator?.disconnect();
      modulator?.disconnect();
      gain?.disconnect();
      modulationGain?.disconnect();
    };
  } catch {
    try { oscillator?.stop(); } catch { /* oscillator never started */ }
    try { modulator?.stop(); } catch { /* modulator never started */ }
    oscillator?.disconnect();
    modulator?.disconnect();
    gain?.disconnect();
    modulationGain?.disconnect();
  }
}

/** Fade the siren out once Attention Guard clears the sustained warning. */
export function stopFocusAlarm() {
  const c = ctx;
  const oscillator = focusAlarmOscillator;
  const modulator = focusAlarmModulator;
  const gain = focusAlarmGain;
  const modulationGain = focusAlarmModulationGain;
  focusAlarmOscillator = null;
  focusAlarmModulator = null;
  focusAlarmGain = null;
  focusAlarmModulationGain = null;

  if (!c || !oscillator || !gain) return;
  const at = c.currentTime;
  try {
    gain.gain.cancelScheduledValues(at);
    gain.gain.setTargetAtTime(0.0001, at, 0.025);
    oscillator.stop(at + 0.12);
    modulator?.stop(at + 0.12);
    oscillator.onended = () => oscillator.disconnect();
    if (modulator) modulator.onended = () => modulator.disconnect();
    window.setTimeout(() => {
      gain.disconnect();
      modulationGain?.disconnect();
    }, 200);
  } catch {
    oscillator.disconnect();
    modulator?.disconnect();
    gain.disconnect();
    modulationGain?.disconnect();
  }
}

/** A quiet in-app alert used only when an opted-in focus intervention fires. */
export function playAttentionWarning(level: 1 | 2) {
  const c = audio();
  if (!c) return;
  const at = c.currentTime + 0.01;
  try {
    if (level === 1) {
      blip(c, "sine", 620, 520, at, 0.16, 0.03);
    } else {
      blip(c, "sine", 740, 640, at, 0.15, 0.032);
      blip(c, "sine", 510, 440, at + 0.16, 0.17, 0.03);
    }
  } catch {
    /* audio is optional and must never interrupt a focus session */
  }
}

/** True when the browser exposes Web Audio at all (used to hide the setting). */
export function soundSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext);
}
