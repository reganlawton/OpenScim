// The sandbox's gateway in the lobby: the platform's own floor reaches out
// along a spoke to a round dais, ringed by beams of light in the colours of
// the fights whose monsters the sandbox borrows. A click on the dais opens
// the sandbox's setup window (the loadout presets), as the Desert Treasure II
// vault opens its chooser. No object of the cache is placed.
import { centerX, lobbyGateway, rimY } from "../../lobby/gateway.js";
import { toaMesh, toaShaderModes } from "../../toa/shader.js";

// The sandbox's kind (arenas.js). Not imported: the lobby's gateways load
// in plain Node in a test, and arenas.js reaches the engine's modules.
const sandboxKind = "sandbox";

// The direction of the spoke, anticlockwise from east: between Yama (90) and
// his neighbour at 149.
const spokeDegrees = 117;

// Laid out as if the spoke pointed north (see lobby/gateway.js).
const dais = { y: 46, radius: 3.2 };
const stripHalfWidth = 2.1;
const walkway = { minX: 30, maxX: 32, minY: 39 };

const { toLayout, turnMatrix, tilesIn, gatewayLocs, turnGatewayObject } = lobbyGateway(spokeDegrees, []);
export { gatewayLocs, turnGatewayObject };

export const sandboxGatewayLabel = "Sandbox";
const select = (open) =>
  open({ encounterKind: sandboxKind, displayName: "Sandbox", description: "Build a fight of your own: an arena, monsters of the other fights, and their bosses." });

// The dais's tiles: a click on one opens the setup window.
const daisTiles = tilesIn(centerX - 2, dais.y - 2, centerX + 2, dais.y + 2);
export const gatewayPortals = daisTiles.map((position) => ({ position, displayName: sandboxGatewayLabel, open: select }));

// The walkway and the dais are walkable; nothing is blocked.
export function extendLobbyArena(walkable) {
  for (const [x, y] of tilesIn(walkway.minX, walkway.minY, walkway.maxX + 1, dais.y + 3)) walkable.add(x + "," + y);
  for (const [x, y] of tilesIn(centerX - 3, dais.y - 3, centerX + 3, dais.y + 3)) walkable.add(x + "," + y);
}

// The floor: a strip from the rim to the dais, and the dais. The lobby lays
// it with its own floor. Takes a lobby position.
export function gatewayFloor(lobbyX, lobbyY) {
  const [x, y] = toLayout(lobbyX, lobbyY);
  const onStrip = Math.abs(x - centerX) <= stripHalfWidth && y >= rimY - 1 && y <= dais.y;
  return onStrip || Math.hypot(x - centerX, y - dais.y) <= dais.radius + 0.6;
}
export const gatewayCovers = gatewayFloor;

// Hue, saturation and lightness (0 to 255) of each beam: the Inferno's fire,
// the Colosseum's gold, the Stranglewood's blood, the Doom's green, ToA's
// blue, and the sandbox's own white in the middle.
const beamColours = [[8, 230, 120], [32, 224, 150], [0, 224, 96], [64, 200, 110], [150, 200, 140]];

export function gatewayMeshes({ baseZ, hsl }) {
  const part = (name, zIndex) => toaMesh("sandbox-gateway-" + name, zIndex, "read", [toaShaderModes.shaft, 0, 0, 0], turnMatrix);
  const beams = part("beams", 8);
  const ring = dais.radius - 0.6;
  beamColours.forEach((colour, index) => {
    const angle = (index / beamColours.length) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * ring, y = dais.y + Math.sin(angle) * ring, radius = 0.45;
    beams.sheet([x - radius, y], [x + radius, y], baseZ + 3, 8, hsl(...colour), 0.6, 0);
    beams.sheet([x, y - radius], [x, y + radius], baseZ + 3, 8, hsl(...colour), 0.6, 0);
  });
  const centre = part("centre", 9);
  const white = hsl(0, 0, 220), radius = 1.2;
  centre.sheet([centerX - radius, dais.y], [centerX + radius, dais.y], baseZ + 5, 20, white, 0.5, 0);
  centre.sheet([centerX, dais.y - radius], [centerX, dais.y + radius], baseZ + 5, 20, white, 0.5, 0);
  return [beams, centre].map((mesh) => mesh.command());
}
