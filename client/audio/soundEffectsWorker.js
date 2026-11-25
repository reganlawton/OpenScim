// Synthesizes sound effects for soundEffects.js off the main thread: one
// index 4 file in, its WAV bytes out (the same bytes soundEffectWav returns
// on the main thread).
import { soundEffectWav } from "./soundEffects.js";

self.onmessage = ({ data: { ticket, bytes } }) => {
  const wav = soundEffectWav(bytes);
  self.postMessage({ ticket, wav }, [wav.buffer]);
};
