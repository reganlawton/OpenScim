// Sound effects are synthesized from cache index 4 by client/audio/soundEffects.js.
// The project used to ship them as 392 .ogg files; this compares the
// synthesizer with those recordings.
//
// The recordings are Jagex audio and are not in the repository. Set
// SOUND_REFERENCE to a zip or directory holding <id>.ogg files; the default is
// OpenScim-assets-backup.zip next to the repository. Without them the
// comparison is skipped and only the cache checks run.
//
// What "same sound" means here, and why:
//
// - Length: equal, or the recording up to 256 samples (one short Vorbis
//   block) shorter; the encoder dropped the tail of 165 of them.
// - Waveform: correlation at zero lag of at least 0.8. Vorbis at 45-58 kbit/s
//   keeps tonal effects above 0.95 and blurs broadband noise.
// - 106 of the recordings (Zebak, 5818-5923) were rendered for this project
//   from the same cache; they must reach 0.9 as synthesized (lowest: 0.957).
// - The other recordings came from the original site. Its converter refreshed
//   every envelope one sample late (it tested `>` where the game client tests
//   `>=`), which delays pitch by a sample and flips the gate of effects whose
//   gate starts at zero. A render with that one comparison changed is what
//   those files are compared with; the shipped synthesizer keeps the client's
//   behaviour, which is also what the game itself is heard doing
//   (crossbow 2695).
// - Effects that fall below 0.8 are ones where sample-level detail is not
//   reproducible through a lossy file: white noise, noise-driven pitch or
//   volume modulation, and filters with poles within 0.2% of the unit circle,
//   where the first rounding difference changes every later sample. They are
//   listed in the output and must still match in spectrum: correlation of at
//   least 0.7 between 16-band magnitude spectrograms (256-sample frames).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";
import { chromium } from "playwright-core";
import { unpack, unzipCache } from "../tools/assets/cache.mjs";
import { readCacheGroups } from "../tools/assets/cache-groups.mjs";
import { SAMPLE_RATE, soundEffectWav, synthesizeSoundEffect } from "../client/audio/soundEffects.js";

const repo = path.resolve(import.meta.dirname, "..");
const cache = await unzipCache(fs.readFileSync(path.join(repo, "client/osrs-cache/disk.zip")));
const ids = readCacheGroups()[4];
const effect = async (id) => unpack(await cache.group(4, id));

const stepperTest = "if (max >= ticks) {";
const source = fs.readFileSync(path.join(repo, "client/audio/soundEffects.js"), "utf8");
assert.equal(source.split(stepperTest).length, 2, "envelope stepper comparison not found in soundEffects.js");
const originalSiteConverter = (
  await import("data:text/javascript;base64," + Buffer.from(source.replace(stepperTest, "if (max > ticks) {")).toString("base64"))
).synthesizeSoundEffect;

// The loudest sample of an effect is at least 12 of 128, except where the
// effect itself asks for less. CACHE, 10352: one noise oscillator at volume 10
// of 100 under an envelope that peaks at 7638 of 65535, which is 381 of 32768;
// its filter (one zero pair, magnitude 0.53) raises that to 891 at most, and
// 891 is 4 of 128. CACHE, 3052 (a bubble of 0.1 seconds): one sine oscillator at
// volume 20 of 100 under an envelope that peaks at 35914 of 65535, which is 3590
// of 32768; its volume is modulated by a noise that does not move on in that
// time and halves it, and the filter leaves 1486 of that, which is 5 of 128.
const AUDIBLE = 12;
const faint = new Map([[10352, 4], [3052, 5]]);

test("every sound effect in the trimmed cache synthesizes to audible PCM", async () => {
  assert.equal(SAMPLE_RATE, 22050);
  for (const id of ids) {
    const pcm = synthesizeSoundEffect(await effect(id));
    assert.ok(pcm.length >= 1000 && pcm.length <= 10 * SAMPLE_RATE, id + ": " + pcm.length + " samples");
    assert.ok(pcm.some((sample) => Math.abs(sample) >= (faint.get(id) ?? AUDIBLE)), id + " is silent");
  }
  // Requested by the simulator but never among the old files.
  for (const id of [8143, 8248]) {
    const pcm = synthesizeSoundEffect(await effect(id));
    const rms = Math.sqrt(pcm.reduce((sum, sample) => sum + sample * sample, 0) / pcm.length);
    assert.ok(pcm.length >= SAMPLE_RATE && rms > 10, id + ": " + pcm.length + " samples, rms " + rms.toFixed(1));
  }
  const wav = soundEffectWav(await effect(ids[0]));
  assert.equal(Buffer.from(wav.subarray(0, 4)).toString(), "RIFF");
  assert.equal(new DataView(wav.buffer).getUint32(40, true), wav.length - 44);
});

// ----------------------------------------------------------------- recordings

const referencePath = process.env.SOUND_REFERENCE ?? path.resolve(repo, "../OpenScim-assets-backup.zip");

async function readRecordings() {
  const files = new Map();
  if (fs.statSync(referencePath).isDirectory()) {
    for (const name of fs.readdirSync(referencePath)) if (/^\d+\.ogg$/.test(name)) files.set(parseInt(name), fs.readFileSync(path.join(referencePath, name)));
  } else {
    const zip = await JSZip.loadAsync(fs.readFileSync(referencePath));
    for (const entry of Object.values(zip.files)) {
      const id = /(?:^|\/)(\d+)\.ogg$/.exec(entry.name)?.[1];
      if (id) files.set(Number(id), await entry.async("nodebuffer"));
    }
  }
  return files;
}

// Chrome decodes the Ogg files: id -> Float32Array at 22,050 Hz.
async function decodeRecordings(files) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    const page = await browser.newPage();
    const decoded = new Map();
    const entries = [...files];
    for (let at = 0; at < entries.length; at += 40) {
      const batch = entries.slice(at, at + 40).map(([id, bytes]) => [id, bytes.toString("base64")]);
      const result = await page.evaluate(async (batch) => {
        const context = new OfflineAudioContext(1, 1, 22050);
        const out = [];
        for (const [id, base64] of batch) {
          const audio = await context.decodeAudioData(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer);
          const bytes = new Uint8Array(audio.getChannelData(0).slice().buffer);
          let text = "";
          for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
          out.push([id, audio.sampleRate, audio.numberOfChannels, btoa(text)]);
        }
        return out;
      }, batch);
      for (const [id, rate, channels, base64] of result) {
        assert.deepEqual([rate, channels], [22050, 1], id + ".ogg format");
        const bytes = Buffer.from(base64, "base64");
        decoded.set(id, new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4));
      }
    }
    return decoded;
  } finally {
    await browser.close();
  }
}

function correlation(a, b) {
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0, n = Math.min(a.length, b.length); i < n; i++) {
    ab += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
}

// Magnitudes in 16 bands of 256-sample Hann frames (hop 128), one after another.
function spectrogram(samples) {
  const N = 256, out = [];
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let at = 0; at + N <= samples.length; at += N / 2) {
    for (let i = 0; i < N; i++) {
      re[i] = samples[at + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    for (let i = 1, j = 0; i < N; i++) {
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) [re[i], re[j]] = [re[j], re[i]]; // im is all zero here
    }
    for (let size = 2; size <= N; size <<= 1)
      for (let start = 0; start < N; start += size)
        for (let k = 0; k < size / 2; k++) {
          const angle = (-2 * Math.PI * k) / size, a = start + k, b = a + size / 2;
          const xr = re[b] * Math.cos(angle) - im[b] * Math.sin(angle);
          const xi = re[b] * Math.sin(angle) + im[b] * Math.cos(angle);
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
    const bands = new Float64Array(16);
    for (let k = 1; k < N / 2; k++) bands[k >> 3] += re[k] * re[k] + im[k] * im[k];
    for (const energy of bands) out.push(Math.sqrt(energy));
  }
  return out;
}

test("synthesized effects match the recordings the project used to ship", { skip: !fs.existsSync(referencePath) && "no recordings at " + referencePath }, async () => {
  const recordings = await decodeRecordings(await readRecordings());
  const rows = [];
  for (const [id, recording] of [...recordings].sort(([a], [b]) => a - b)) {
    const bytes = await effect(id);
    const client = Float32Array.from(synthesizeSoundEffect(bytes), (sample) => sample / 128);
    const converter = Float32Array.from(originalSiteConverter(bytes), (sample) => sample / 128);
    const row = { id, lengthDiff: recording.length - client.length, client: correlation(client, recording), converter: correlation(converter, recording) };
    row.waveform = Math.max(row.client, row.converter);
    row.spectrum = correlation(spectrogram(row.client >= row.converter ? client : converter), spectrogram(recording));
    rows.push(row);
  }
  const worst = (key) => rows.reduce((a, b) => (b[key] < a[key] ? b : a));
  const low = rows.filter((row) => row.waveform < 0.8);
  const zebak = rows.filter((row) => row.id >= 5818 && row.id <= 5923);
  console.log(
    rows.length + " recordings. Waveform >= 0.8: " + (rows.length - low.length) + " (>= 0.95: " + rows.filter((row) => row.waveform >= 0.95).length + ")." +
      " As the game client plays them: " + rows.filter((row) => row.client >= row.converter).length + "; only with the original site's envelope timing: " + rows.filter((row) => row.client < row.converter).length + "." +
      " Recording shorter than synthesized: " + rows.filter((row) => row.lengthDiff).length + " (" + Math.min(...rows.map((row) => row.lengthDiff)) + ".." + Math.max(...rows.map((row) => row.lengthDiff)) + " samples)." +
      " Lowest Zebak waveform " + Math.min(...zebak.map((row) => row.client)).toFixed(3) + "; lowest spectrum " + worst("spectrum").spectrum.toFixed(3) + " (" + worst("spectrum").id + ").",
  );
  console.log("Below 0.8 waveform (id waveform/spectrum): " + low.map((row) => row.id + " " + row.waveform.toFixed(2) + "/" + row.spectrum.toFixed(2)).join(", "));

  assert.equal(rows.length, 392);
  for (const row of rows) {
    assert.ok(row.lengthDiff <= 0 && row.lengthDiff >= -256, row.id + " length differs by " + row.lengthDiff + " samples");
    assert.ok(row.waveform >= 0.8 || row.spectrum >= 0.7, row.id + " waveform " + row.waveform.toFixed(3) + ", spectrum " + row.spectrum.toFixed(3));
  }
  assert.equal(zebak.length, 106);
  for (const row of zebak) assert.ok(row.client >= 0.9, "Zebak " + row.id + " waveform " + row.client.toFixed(3));
  assert.ok(low.length <= 60, low.length + " recordings below 0.8 waveform correlation");
});
