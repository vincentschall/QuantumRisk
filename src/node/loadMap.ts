import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { compileMap, type GameMap, type MapDef } from "../engine/index.js";

export const DEFAULT_MAP_PATH = fileURLToPath(new URL("../../design/map.yaml", import.meta.url));

/** Load and compile a map YAML file (Node only; the engine itself takes a plain MapDef). */
export function loadMap(path = DEFAULT_MAP_PATH): GameMap {
  const def = parse(readFileSync(path, "utf8")) as MapDef;
  return compileMap(def);
}
