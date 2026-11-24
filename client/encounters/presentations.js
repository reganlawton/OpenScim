import { zebakPresentation } from "/toa/zebak/native.js";
import { nexusPresentation } from "/toa/nexus.js";
import { colosseumPresentation } from "./colosseum/presentation.js";
import { vardorvisPresentation } from "./vardorvis/presentation.js";
import { doomPresentation, doomDeepPresentation } from "./doom-of-mokhaiotl/presentation.js";
import { zulrahPresentation } from "./zulrah/presentation.js";
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
// lobby, Sol Heredit, the Inferno), in this order. From that list it fills
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
// To add one, write the function beside the encounter and add it to the
// list. Nothing in client/assets/ has to change.
export const presentationBuilders = [zebakPresentation, nexusPresentation, colosseumPresentation, vardorvisPresentation, doomPresentation, zulrahPresentation];
// After the Doom's own: his deeper room's kind takes this one (rendering.js keeps the last per kind).
presentationBuilders.push(doomDeepPresentation);
