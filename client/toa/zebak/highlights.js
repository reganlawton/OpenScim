// What the Zebak fight marks by default, for every Tidal Wave (NPC 11738, or 11739 when bloody): its true tile, and the tile it is
// drawn on (RuneLite's "true tile" and "tile" of an NPC).
// OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, ticks 162-197 and 438-458): the client draws a wave
// behind the tile the server has it on, a row behind as it leaves the shore and two rows behind by the
// far shore, so the wave a player sees is not the row that decides a hit.
// The colours are RuneLite's defaults for an NPC's true tile: "#00FFFF", 2 wide, filled at 0x14 of 0xFF.
import { packHsl } from "../../util/packHsl.js";

const highlight = { color: "#00FFFF", fillOpacity: 0x14 / 0xff, outlineWidth: 2 };
// inferred: the drawn tile's colour, chosen to stand apart from the true tile's.
const drawn = { color: "#FFFF00", opacity: 0x50 / 0xff };
export const waveNpcTypeIds = new Set([11738, 11739]);

// "#RRGGBB" as the renderer's packed colour: hue, saturation and lightness of 0 to 255.
function packHex(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return packHsl(Math.round((((h * 60 + 360) % 360) / 360) * 255), Math.round(s * 255), Math.round(l * 255));
}
// The renderer's width of a true-tile line is 0.02 of a tile for each unit of RuneLite's width.
const outline = { color: packHex(highlight.color), style: "full", lineWidth: highlight.outlineWidth * 0.02 };

/** The input of the scene's build, with an outline and a fill on the true tile of every wave and a fill on
 *  the tile under where it is drawn; `drawnPosition(npc)` is that place in tiles, or nothing before it is drawn. */
export function withWaveTiles(input, drawnPosition = () => null) {
  const state = input.simulationState;
  if (!state?.npcs?.some((npc) => npc.alive && waveNpcTypeIds.has(npc.npcTypeId))) return input;
  const fills = [];
  const npcs = state.npcs.map((npc) => {
    if (!npc.alive || !waveNpcTypeIds.has(npc.npcTypeId)) return npc;
    fills.push({ x: npc.position[0], y: npc.position[1], color: highlight.color, opacity: highlight.fillOpacity, label: "" });
    const at = drawnPosition(npc);
    // The tile under the middle of the model, as the client's own highlight has it.
    if (at) fills.push({ x: Math.round(at[0]), y: Math.round(at[1]), color: drawn.color, opacity: drawn.opacity, label: "" });
    return { ...npc, outline };
  });
  const options = input.options ?? {};
  return {
    ...input,
    simulationState: { ...state, npcs },
    options: { ...options, showTileMarkers: true },
    // The player's own markers stay as he set them: shown only if he shows them.
    tileMarkers: [...(options.showTileMarkers ? (input.tileMarkers ?? []) : []), ...fills],
  };
}
