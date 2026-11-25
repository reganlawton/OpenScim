import { encounterDirectories } from "./registry.js";
import { sandboxPresentations } from "./sandbox/presentation.js";
// What draws an encounter: the presentations that are written in modules.
// The chunk rendering.js holds the scene classes, so a presentation cannot
// import its base scene. It is a function instead: rendering.js calls every
// function of `presentationBuilders` once, when it is loaded, with
//   BaseScene   the scene class to build or extend (InfernoScene of
//               rendering.js, which extends SceneCompositor)
//   packHsl     the renderer's colour packing (util/packHsl.js)
//   tools       { widgetModelView }: draws an interface's model the way the
//               game client does, into a canvas of its own (Vardorvis'
//               strangle overlay)
// and puts what they return in front of its own presentations (Yama, the
// lobby, Sol Heredit, the Inferno), in the order of the list. From that list it fills
// the scene builder registry, the audio layers and the cameras; a kind's
// variant kinds (registry.js) get the presentation of the kind.
//
// A presentation is { kind, sceneBuilder, renderConfig?, audio?,
// defaultCamera?, setupCameras?, presentation? }:
//   kind             the kind of a definition in registry.js
//   sceneBuilder(context)
//                    makes the scene of one visit; `context` is
//                    { cacheManager, eventAudioPlayer, frameSoundTracker,
//                    encounterRenderConfig }. buildScene of
//                    shared/buildScene.js makes the default one
//   renderConfig     what the scene loads and draws: terrainMapSquare (the
//                    descriptor's mapSquare when absent), spotAnimIds,
//                    preloadNpcTypes, primaryNpc, locRender,
//                    createSceneObjectController
//   audio            { layerName, rules }: an audio layer of its own, its
//                    rules keyed by the type of a tick event
//   defaultCamera    { yaw, pitch, zoom? } when the encounter is entered;
//   setupCameras     others, each for a set of mechanics values
//   presentation     the menus' art and texts: title, tagline, blurb,
//                    setupContext, heroArt, thumb, wikiUrl, portrait
// To add one, write it in the presentation.js of the encounter's directory
// and export it as `presentation`; or as `presentations`, a list, when the
// encounter has several (the Doom's two rooms: the later of a kind is the
// one rendering.js keeps). Every ./<directory>/presentation.js is found
// here, as registry.js finds the encounters, and the list is in the order of
// the registry's. Nothing in client/assets/ has to change.
const foundModules = import.meta.glob("./*/presentation.js", { eager: true });
const presentationModules = Object.entries(foundModules);
const moduleOfDirectory = new Map(presentationModules.map(([path, module]) => [path.split("/")[1], module]));
// The sandbox: one presentation per arena, each its own kind (sandbox/arenas.js), after all the others.
moduleOfDirectory.delete("sandbox");
for (const directory of moduleOfDirectory.keys()) {
  if (!encounterDirectories.includes(directory)) throw new Error(`./${directory}/presentation.js has no encounter.js beside it`);
}
export const presentationBuilders = encounterDirectories.flatMap((directory) => {
  const module = moduleOfDirectory.get(directory);
  if (!module) return []; // drawn by a scene of rendering.js: Yama, the lobby, Sol Heredit, the Inferno
  const presentations = module.presentations ?? (module.presentation ? [module.presentation] : undefined);
  if (!presentations) throw new Error(`./${directory}/presentation.js exports neither \`presentation\` nor \`presentations\``);
  return presentations;
});
presentationBuilders.push(...sandboxPresentations);
