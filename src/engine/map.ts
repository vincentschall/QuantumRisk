import type { MapDef } from "./types.js";

/** A map with precomputed lookups. */
export interface GameMap {
  def: MapDef;
  sectors: string[];
  clusters: string[];
  clusterOf: Map<string, string>;
  clusterSectors: Map<string, string[]>;
  bonus: Map<string, number>;
  adjacency: Map<string, Set<string>>;
  strongholds: Set<string>;
}

export function compileMap(def: MapDef): GameMap {
  const sectors: string[] = [];
  const clusterOf = new Map<string, string>();
  const clusterSectors = new Map<string, string[]>();
  const bonus = new Map<string, number>();
  for (const [cluster, c] of Object.entries(def.clusters)) {
    clusterSectors.set(cluster, [...c.sectors]);
    bonus.set(cluster, c.bonus);
    for (const s of c.sectors) {
      if (clusterOf.has(s)) throw new Error(`Sector ${s} is in two clusters`);
      clusterOf.set(s, cluster);
      sectors.push(s);
    }
  }
  const adjacency = new Map<string, Set<string>>(sectors.map((s) => [s, new Set<string>()]));
  for (const [a, b] of def.connections) {
    const sa = adjacency.get(a);
    const sb = adjacency.get(b);
    if (!sa || !sb) throw new Error(`Unknown sector in connection ${a} - ${b}`);
    sa.add(b);
    sb.add(a);
  }
  for (const s of def.strongholds) {
    if (!clusterOf.has(s)) throw new Error(`Unknown stronghold ${s}`);
  }
  return {
    def,
    sectors,
    clusters: [...clusterSectors.keys()],
    clusterOf,
    clusterSectors,
    bonus,
    adjacency,
    strongholds: new Set(def.strongholds),
  };
}
