// Old School RuneScape sound effects (cache index 4) are not recordings. Each
// one is a program for the game client's synthesizer: up to ten instruments,
// each with envelopes, up to five oscillators, a gate, an echo and a filter.
// This is a port of that synthesizer; the integer and 32-bit float arithmetic
// follows the Java client step by step, because the filter in particular does
// not survive "equivalent" rewrites. Names follow the RuneLite project's
// deobfuscation of the client (Instrument, SoundEnvelope, AudioFilter).
//
// Output is what the client mixes: signed 8-bit mono PCM at 22,050 Hz.

export const SAMPLE_RATE = 22050;

const toInt = (x) => (x >= 2147483647 ? 2147483647 : x <= -2147483648 ? -2147483648 : Math.trunc(x) || 0); // Java (int) cast
const f32 = Math.fround;
// Java's (int) ((long) a * b >> 16) without losing bits above 2^53.
const mulShift16 = (a, b) => (a * (b >> 16) + Math.floor((a * (b & 0xffff)) / 65536)) | 0;

let SINE, NOISE;
function tables() {
  SINE = new Int32Array(32768);
  NOISE = new Int8Array(32768);
  // java.util.Random(0).nextInt(), a 48-bit linear congruential generator.
  let seed = 0x5deece66dn;
  for (let i = 0; i < 32768; i++) {
    seed = (seed * 0x5deece66dn + 0xbn) & 0xffffffffffffn;
    NOISE[i] = (Number(seed >> 16n) & 2) - 1;
    SINE[i] = toInt(Math.sin(i / 5215.1903) * 16384);
  }
}

function wave(phase, amplitude, form) {
  if (form === 1) return (phase & 32767) < 16384 ? amplitude : -amplitude; // square
  if (form === 2) return (SINE[phase & 32767] * amplitude) >> 14;
  if (form === 3) return (((phase & 32767) * amplitude) >> 14) - amplitude; // saw
  if (form === 4) return amplitude * NOISE[((phase / 2607) | 0) & 32767];
  return 0;
}

// ------------------------------------------------------------------ decoding

class Reader {
  constructor(bytes) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.at = 0;
  }
  peek() {
    return this.view.getUint8(this.at);
  }
  u8() {
    return this.view.getUint8(this.at++);
  }
  u16() {
    this.at += 2;
    return this.view.getUint16(this.at - 2);
  }
  i32() {
    this.at += 4;
    return this.view.getInt32(this.at - 4);
  }
  // "Smart" values take one byte below 128 and two otherwise.
  unsignedSmart() {
    return this.peek() < 128 ? this.u8() : this.u16() - 32768;
  }
  signedSmart() {
    return this.peek() < 128 ? this.u8() - 64 : this.u16() - 49152;
  }
}

function readSegments(reader, envelope) {
  const count = reader.u8();
  envelope.durations = [];
  envelope.levels = [];
  for (let i = 0; i < count; i++) {
    envelope.durations.push(reader.u16());
    envelope.levels.push(reader.u16());
  }
  return envelope;
}

const readEnvelope = (reader) => readSegments(reader, { form: reader.u8(), start: reader.i32(), end: reader.i32() });
// A pair of envelopes is present when the next byte (the first one's form) is not 0.
const readOptionalPair = (reader) => (reader.u8() ? (reader.at--, [readEnvelope(reader), readEnvelope(reader)]) : [null, null]);

function readInstrument(reader) {
  const instrument = { pitch: readEnvelope(reader), volume: readEnvelope(reader), oscillators: [] };
  [instrument.pitchModifier, instrument.pitchModifierAmplitude] = readOptionalPair(reader);
  [instrument.volumeMultiplier, instrument.volumeMultiplierAmplitude] = readOptionalPair(reader);
  [instrument.release, instrument.attack] = readOptionalPair(reader);
  for (let i = 0; i < 10; i++) {
    const volume = reader.unsignedSmart();
    if (!volume) break;
    instrument.oscillators.push({ volume, pitch: reader.signedSmart(), delay: reader.unsignedSmart() });
  }
  instrument.delayTime = reader.unsignedSmart();
  instrument.delayDecay = reader.unsignedSmart();
  instrument.duration = reader.u16(); // milliseconds
  instrument.offset = reader.u16();

  // Filter: pole/zero pairs for the feed-forward (0) and feedback (1) halves,
  // each with a start [0] and end [1] setting the envelope moves between.
  const filter = { pairs: [0, 0], unity: [0, 0], phases: [[[], []], [[], []]], magnitudes: [[[], []], [[], []]] };
  instrument.filter = filter;
  instrument.filterEnvelope = { form: 0, start: 0, end: 0, durations: [0, 65535], levels: [0, 65535] };
  const packed = reader.u8();
  filter.pairs = [packed >> 4, packed & 15];
  if (packed) {
    filter.unity = [reader.u16(), reader.u16()];
    const moving = reader.u8();
    for (let direction = 0; direction < 2; direction++)
      for (let i = 0; i < filter.pairs[direction]; i++) {
        filter.phases[direction][0][i] = reader.u16();
        filter.magnitudes[direction][0][i] = reader.u16();
      }
    for (let direction = 0; direction < 2; direction++)
      for (let i = 0; i < filter.pairs[direction]; i++) {
        const moves = moving & ((1 << (direction * 4)) << i);
        filter.phases[direction][1][i] = moves ? reader.u16() : filter.phases[direction][0][i];
        filter.magnitudes[direction][1][i] = moves ? reader.u16() : filter.magnitudes[direction][0][i];
      }
    if (moving || filter.unity[1] !== filter.unity[0]) readSegments(reader, instrument.filterEnvelope);
  }
  return instrument;
}

// ----------------------------------------------------------------- synthesis

// Walks an envelope's (duration, level) points over `steps` calls, returning
// the interpolated level (0..65535) each time.
function stepper(envelope, steps) {
  const { durations, levels } = envelope;
  let ticks = 0, index = 0, step = 0, amplitude = 0, max = 0;
  return () => {
    // `>=` as in the game client. The original site's converter had `>`, one
    // sample late; test/test-sound-synth.mjs swaps this line to compare with
    // its recordings.
    if (max >= ticks) {
      amplitude = levels[index++] << 15;
      if (index >= levels.length) index = levels.length - 1;
      ticks = toInt((durations[index] / 65536) * steps);
      if (ticks > max) step = toInt(((levels[index] << 15) - amplitude) / (ticks - max));
    }
    amplitude += step;
    max++;
    return (amplitude - step) >> 15;
  };
}

// Coefficients of one half of the filter at envelope position t (0..1), as
// 16.16 fixed point; returns how many there are. `state` carries the forward
// gain from the direction 0 call to the caller.
function filterCoefficients(filter, direction, t, state) {
  const lerp = (values, i) => f32(values[direction][0][i] + f32(t * (values[direction][1][i] - values[direction][0][i])));
  const magnitude = (i) => f32(1 - f32(Math.pow(10, f32(-f32(lerp(filter.magnitudes, i) * f32(0.0015258789)) / 20))));
  const phase = (i) => {
    const octaves = f32(lerp(filter.phases, i) * f32(1.2207031e-4));
    const frequency = f32(f32(32.703197) * f32(Math.pow(2, octaves)));
    return f32(f32(frequency * f32(3.1415927)) / 11025);
  };
  if (direction === 0) {
    const unity = f32(f32(filter.unity[0] + f32((filter.unity[1] - filter.unity[0]) * t)) * f32(0.0030517578));
    state.forward = f32(Math.pow(0.1, f32(unity / 20)));
    state.forwardFixed = toInt(f32(state.forward * 65536));
  }
  const pairs = filter.pairs[direction];
  if (!pairs) return 0;
  const c = new Float32Array(8);
  let m = magnitude(0);
  c[0] = f32(f32(-2 * m) * f32(Math.cos(phase(0))));
  c[1] = f32(m * m);
  for (let pair = 1; pair < pairs; pair++) {
    m = magnitude(pair);
    const a = f32(f32(-2 * m) * f32(Math.cos(phase(pair))));
    const b = f32(m * m);
    c[pair * 2 + 1] = f32(c[pair * 2 - 1] * b);
    c[pair * 2] = f32(f32(c[pair * 2 - 1] * a) + f32(c[pair * 2 - 2] * b));
    for (let i = pair * 2 - 1; i >= 2; i--) c[i] = f32(c[i] + f32(f32(c[i - 1] * a) + f32(c[i - 2] * b)));
    c[1] = f32(c[1] + f32(f32(c[0] * a) + b));
    c[0] = f32(c[0] + a);
  }
  for (let i = 0; i < pairs * 2; i++) {
    if (direction === 0) c[i] = f32(c[i] * state.forward);
    state.fixed[direction][i] = toInt(f32(c[i] * 65536));
  }
  return pairs * 2;
}

// One instrument to `steps` 16-bit samples (held in an Int32Array, which wraps
// like Java's int).
function synthesizeInstrument(instrument, steps) {
  const samples = new Int32Array(steps);
  if (instrument.duration < 10) return samples;
  const perMs = steps / instrument.duration;
  const { pitch, volume, pitchModifier, volumeMultiplier, release, filter } = instrument;
  const pitchAt = stepper(pitch, steps);
  const volumeAt = stepper(volume, steps);
  const rate = (envelope) => [toInt(((envelope.end - envelope.start) * 32.768) / perMs), toInt((envelope.start * 32.768) / perMs)];

  let pitchModRate, pitchModAmplitude, pitchModStep = 0, pitchModBase = 0, pitchModPhase = 0;
  if (pitchModifier) {
    pitchModRate = stepper(pitchModifier, steps);
    pitchModAmplitude = stepper(instrument.pitchModifierAmplitude, steps);
    [pitchModStep, pitchModBase] = rate(pitchModifier);
  }
  let volumeModRate, volumeModAmplitude, volumeModStep = 0, volumeModBase = 0, volumeModPhase = 0;
  if (volumeMultiplier) {
    volumeModRate = stepper(volumeMultiplier, steps);
    volumeModAmplitude = stepper(instrument.volumeMultiplierAmplitude, steps);
    [volumeModStep, volumeModBase] = rate(volumeMultiplier);
  }

  const oscillators = instrument.oscillators.slice(0, 5).map((oscillator) => ({
    delay: toInt(oscillator.delay * perMs),
    volumeStep: ((oscillator.volume << 14) / 100) | 0,
    pitchStep: toInt(((pitch.end - pitch.start) * 32.768 * Math.pow(1.0057929410678534, oscillator.pitch)) / perMs),
    pitchBase: toInt((pitch.start * 32.768) / perMs),
  }));
  const phases = new Int32Array(oscillators.length);

  for (let i = 0; i < steps; i++) {
    let frequency = pitchAt();
    let amplitude = volumeAt();
    if (pitchModifier) {
      const rateNow = pitchModRate();
      frequency += wave(pitchModPhase, pitchModAmplitude(), pitchModifier.form) >> 1;
      pitchModPhase = (pitchModPhase + pitchModBase + ((rateNow * pitchModStep) >> 16)) | 0;
    }
    if (volumeMultiplier) {
      const rateNow = volumeModRate();
      amplitude = (amplitude * ((wave(volumeModPhase, volumeModAmplitude(), volumeMultiplier.form) >> 1) + 32768)) >> 15;
      volumeModPhase = (volumeModPhase + volumeModBase + ((rateNow * volumeModStep) >> 16)) | 0;
    }
    oscillators.forEach((oscillator, o) => {
      const at = i + oscillator.delay;
      if (at >= steps) return;
      samples[at] += wave(phases[o], (amplitude * oscillator.volumeStep) >> 15, pitch.form);
      phases[o] += ((frequency * oscillator.pitchStep) >> 16) + oscillator.pitchBase;
    });
  }

  // Gate: alternately mute and pass, for lengths the two envelopes choose.
  if (release) {
    const releaseAt = stepper(release, steps);
    const attackAt = stepper(instrument.attack, steps);
    let counter = 0, muted = true;
    for (let i = 0; i < steps; i++) {
      const on = releaseAt();
      const off = attackAt();
      const threshold = (((muted ? on : off) * (release.end - release.start)) >> 8) + release.start;
      counter += 256;
      if (counter >= threshold) {
        counter = 0;
        muted = !muted;
      }
      if (muted) samples[i] = 0;
    }
  }

  // Echo.
  if (instrument.delayTime > 0 && instrument.delayDecay > 0) {
    const delay = toInt(instrument.delayTime * perMs);
    for (let i = delay; i < steps; i++) samples[i] += (Math.imul(samples[i - delay], instrument.delayDecay) / 100) | 0;
  }

  // Filter, in place: the feed-forward half reads samples not yet overwritten
  // (ahead of i), the feedback half reads filtered ones (behind i). The
  // coefficients are recomputed every 128 samples from the filter envelope.
  if (filter.pairs[0] > 0 || filter.pairs[1] > 0) {
    const envelopeAt = stepper(instrument.filterEnvelope, steps + 1);
    const state = { forward: 0, forwardFixed: 0, fixed: [new Int32Array(8), new Int32Array(8)] };
    const [forwardFixed, backwardFixed] = state.fixed;
    let t = envelopeAt();
    let forward = filterCoefficients(filter, 0, f32(t / 65536), state);
    let backward = filterCoefficients(filter, 1, f32(t / 65536), state);
    if (steps >= forward + backward) {
      let i = 0;
      const filtered = (feedback) => {
        let sample = mulShift16(samples[i + forward], state.forwardFixed);
        for (let k = 0; k < forward; k++) sample = (sample + mulShift16(samples[i + forward - 1 - k], forwardFixed[k])) | 0;
        for (let k = 0; k < feedback; k++) sample = (sample - mulShift16(samples[i - 1 - k], backwardFixed[k])) | 0;
        return sample;
      };
      for (const end = Math.min(backward, steps - forward); i < end; i++) {
        samples[i] = filtered(i); // fewer than `backward` filtered samples exist yet
        t = envelopeAt();
      }
      for (let end = 128; ; end += 128) {
        for (const stop = Math.min(end, steps - forward); i < stop; i++) {
          samples[i] = filtered(backward);
          t = envelopeAt();
        }
        if (i >= steps - forward) break;
        forward = filterCoefficients(filter, 0, f32(t / 65536), state);
        backward = filterCoefficients(filter, 1, f32(t / 65536), state);
      }
      for (; i < steps; i++) {
        // Tail: the feed-forward half runs out of input.
        let sample = 0;
        for (let k = i + forward - steps; k < forward; k++) sample = (sample + mulShift16(samples[i + forward - 1 - k], forwardFixed[k])) | 0;
        for (let k = 0; k < backward; k++) sample = (sample - mulShift16(samples[i - 1 - k], backwardFixed[k])) | 0;
        samples[i] = sample;
        envelopeAt();
      }
    }
  }

  for (let i = 0; i < steps; i++) samples[i] = Math.max(-32768, Math.min(32767, samples[i]));
  return samples;
}

// The bytes of one index 4 file to signed 8-bit PCM at SAMPLE_RATE.
export function synthesizeSoundEffect(bytes) {
  if (!SINE) tables();
  const reader = new Reader(bytes);
  const instruments = [];
  for (let i = 0; i < 10; i++) if (reader.u8()) (reader.at--, instruments.push(readInstrument(reader)));
  // Two more u16 follow (loop start and end); the simulator plays effects once.
  const samplesFor = (ms) => ((ms * SAMPLE_RATE) / 1000) | 0;
  const mix = new Int8Array(samplesFor(Math.max(0, ...instruments.map((instrument) => instrument.duration + instrument.offset))));
  for (const instrument of instruments) {
    const steps = samplesFor(instrument.duration);
    const offset = samplesFor(instrument.offset);
    const samples = synthesizeInstrument(instrument, steps);
    for (let i = 0; i < steps; i++) mix[i + offset] = Math.max(-128, Math.min(127, (samples[i] >> 8) + mix[i + offset]));
  }
  return mix;
}

// The same sound as an 8-bit PCM WAV file, which decodeAudioData and <audio> accept.
export function soundEffectWav(bytes) {
  const pcm = synthesizeSoundEffect(bytes);
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);
  const text = (at, string) => wav.set(Array.from(string, (c) => c.charCodeAt(0)), at);
  text(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE, true); // bytes per second
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample; 8-bit WAV is unsigned
  text(36, "data");
  view.setUint32(40, pcm.length, true);
  for (let i = 0; i < pcm.length; i++) wav[44 + i] = pcm[i] + 128;
  return wav;
}

// ------------------------------------------------------ the simulator's cache

// WAV for effect `id` from a loaded CacheManager, or null when the cache is
// not loaded or does not hold that effect (the trimmed cache carries only the
// ids listed under "4" in tools/assets/cache-groups.json and the files of
// tools/assets/cache-groups/).
function wavFromCache(cacheManager, id) {
  let file;
  try {
    file = cacheManager.cacheSystem.getIndex(4).getFile(id, 0);
  } catch {
    return null;
  }
  return file ? soundEffectWav(file.data) : null;
}

// Stands in for fetch("/assets/sounds/<id>.ogg"): 200 with a WAV body, 404
// for an effect the cache does not have, 503 when the cache failed to load.
export async function soundEffectResponse(cacheManager, id) {
  const state = await new Promise((resolve) => {
    const stop = cacheManager.subscribe(({ state }) => {
      if (state !== "LOADED" && state !== "ERROR") return;
      resolve(state);
      queueMicrotask(() => stop()); // subscribe() calls back before it returns `stop`
    });
  });
  if (state !== "LOADED") return new Response(null, { status: 503 });
  const wav = wavFromCache(cacheManager, id);
  return wav ? new Response(wav, { headers: { "Content-Type": "audio/wav" } }) : new Response(null, { status: 404 });
}

const urls = new Map();
// For <audio>: an object URL of the WAV ("#id" appended so the source stays
// recognisable), or "" when wavFromCache has nothing.
export function soundEffectUrl(cacheManager, id) {
  if (!urls.has(id)) {
    const wav = wavFromCache(cacheManager, id);
    if (!wav) return "";
    urls.set(id, URL.createObjectURL(new Blob([wav], { type: "audio/wav" })) + "#" + id);
  }
  return urls.get(id);
}
