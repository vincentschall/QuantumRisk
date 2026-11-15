/** The board for the tutorial, bundled into the client so the tutorial runs without the server. */
import { parse } from "yaml";
import { compileMap, type MapDef } from "../../../src/engine/index.js";
import mapYaml from "../../../design/map.yaml?raw";
import type { BoardMap } from "../net.js";
import { makeScenarios } from "./scenarios.js";

export const TUTORIAL_MAP = parse(mapYaml) as BoardMap;
export const MAP = compileMap(TUTORIAL_MAP as MapDef);
export const scenarios = makeScenarios(MAP);
