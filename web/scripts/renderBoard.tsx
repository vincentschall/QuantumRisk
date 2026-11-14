/**
 * Renders the board to a standalone SVG (with the board CSS inlined). `npm run map:svg` writes design/map.svg.
 *   npx tsx --tsconfig web/tsconfig.json web/scripts/renderBoard.tsx out.svg [--demo]
 * --demo deals a seeded 3-player game and adds a quantum stack, for previews.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Game, makeConfig, NEUTRAL, seededSource } from "../../src/engine/index.js";
import { loadMap } from "../../src/node/loadMap.js";
import type { GameView } from "../../src/server/protocol.js";
import { Board } from "../src/Board.js";
import type { BoardMap } from "../src/net.js";
import { geometry } from "../src/rules.js";

const [out = "board.svg", ...flags] = process.argv.slice(2);
const map = loadMap();
const def = map.def as BoardMap;
const sectors: GameView["sectors"] = {};
let stacks: GameView["stacks"] = [];
if (flags.includes("--demo")) {
  const g = new Game(makeConfig(3), map, seededSource(7));
  for (const [s, st] of g.sectors) sectors[s] = { owner: st.owner, troops: st.troops + ((s.length * 7) % 5) };
  const p0 = g.ownedSectors(0);
  stacks = [{ id: 1, owner: 0, size: 6, branches: [p0[0]!, p0[1]!] }];
} else for (const s of map.sectors) sectors[s] = { owner: NEUTRAL, troops: 0 };

const view = { sectors, stacks } as GameView;
let svg = renderToStaticMarkup(
  <Board map={def} geo={geometry(def)} view={view} selectable={new Set()} selected={[]} pending={{}} effects={[]} onSector={() => {}} blank={!flags.includes("--demo")} />,
);
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
svg = svg.replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" width="1340" height="1000" `).replace(/(<svg[^>]*>)/, `$1<style>${css}</style>`);
writeFileSync(out, svg);
console.log(`wrote ${out}`);
