import { memo, useMemo } from "react";
import type { QuantumStack } from "../../src/engine/types.js";
import type { GameView } from "../../src/server/protocol.js";
import type { BoardMap } from "./net.js";
import { curve, GUTTER, H, layout, NH, sectorWidth, W, type Layout } from "./layout.js";
import { colorOf, QUANTUM, type Geometry } from "./rules.js";

export { W, H };

export interface Effect {
  id: number;
  kind: "collapse" | "vanish" | "attack";
  sector: string;
  from?: string;
  text?: string;
  color?: string;
  won?: boolean;
}

interface Props {
  map: BoardMap;
  geo: Geometry;
  view: GameView;
  /** Sectors that can be clicked right now. */
  selectable: Set<string>;
  selected: string[];
  pending: Record<string, number>;
  effects: Effect[];
  onSector(s: string, e: React.MouseEvent): void;
  /** Map export: show sector names only. */
  blank?: boolean;
}

function Substrate() {
  return (
    <>
      <defs>
        <pattern id="vias" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="20" cy="20" r="1.6" className="via" />
        </pattern>
        <radialGradient id="glow" cx="50%" cy="45%" r="75%">
          <stop offset="0%" stopColor="#123a2a" />
          <stop offset="100%" stopColor="#071a12" />
        </radialGradient>
      </defs>
      <rect x="-6" y="-6" width={W + 12} height={H + 12} rx="26" className="board-edge" />
      <rect width={W} height={H} rx="22" fill="url(#glow)" />
      <rect width={W} height={H} rx="22" fill="url(#vias)" />
      {[[26, 26], [W - 26, 26], [26, H - 26], [W - 26, H - 26]].map(([x, y]) => (
        <g key={`${x}${y}`}>
          <circle cx={x} cy={y} r="12" className="mount" />
          <circle cx={x} cy={y} r="6" fill="#050d09" />
        </g>
      ))}
    </>
  );
}

function Packages({ lay, map }: { lay: Layout; map: BoardMap }) {
  return (
    <g>
      {lay.housings.map((h) => (
        <g key={h.sector}>
          <rect x={h.rect.x} y={h.rect.y} width={h.rect.w} height={h.rect.h} rx="6" className="housing" />
          <text x={h.rect.x + 4} y={h.labelBelow ? h.rect.y + h.rect.h + 13 : h.rect.y - 6} className="silk small">
            {h.label}
          </text>
        </g>
      ))}
      {lay.packages.map(({ name, bonus, rect: { x, y, w, h } }) => (
        <g key={name}>
          {name === "CPU" &&
            Array.from({ length: Math.floor((h - 16) / 18) }, (_, i) => (
              <g key={i}>
                <rect x={x - 8} y={y + 12 + i * 18} width="8" height="7" className="pin" />
                <rect x={x + w} y={y + 12 + i * 18} width="8" height="7" className="pin" />
              </g>
            ))}
          {name === "GPU" &&
            Array.from({ length: Math.floor((w - 40) / 14) }, (_, i) => <rect key={i} x={x + 20 + i * 14} y={y + h} width="8" height="9" className="pin" />)}
          <rect x={x} y={y} width={w} height={h} rx={name === "CPU" ? 10 : 14} className={`package pkg-${name}`} />
          <text x={x + 4} y={y - 9} className="silk cluster">
            {name}
          </text>
          <text x={x + w - 4} y={y - 9} textAnchor="end" className="silk bonus">
            +{bonus}
          </text>
        </g>
      ))}
    </g>
  );
}

function Connections({ lay }: { lay: Layout }) {
  return (
    <g>
      {lay.routes.map(({ a, b, kind, d }) => {
        const key = `${a}|${b}`;
        if (kind === "cable")
          return (
            <g key={key}>
              <path d={d} className="cable-outer" />
              <path d={d} className="cable-inner" />
            </g>
          );
        if (kind === "bus")
          return (
            <g key={key}>
              <path d={d} className="bus-wide" />
              <path d={d} className="bus-core" />
            </g>
          );
        return <path key={key} d={d} className="trace" />;
      })}
    </g>
  );
}

function StackLinks({ map, stacks }: { map: BoardMap; stacks: QuantumStack[] }) {
  return (
    <g>
      {stacks.map((st) => {
        const [a, b] = st.branches.map((s) => map.positions[s]!) as [[number, number], [number, number]];
        return (
          <g key={st.id}>
            <path d={curve(a, b)} className="entangle-glow" stroke={QUANTUM} />
            <path d={curve(a, b)} className="entangle" stroke={colorOf(st.owner)} />
          </g>
        );
      })}
    </g>
  );
}

function Sector(props: {
  name: string;
  pos: [number, number];
  owner: number;
  troops: number;
  stack: QuantumStack | undefined;
  stronghold: boolean;
  selectable: boolean;
  selected: boolean;
  pending: number;
  blank?: boolean;
  onClick(e: React.MouseEvent): void;
}) {
  const [x, y] = props.pos;
  const NW = sectorWidth(props.name, props.stronghold);
  const color = colorOf(props.owner);
  const cls = ["sector", props.selectable && "selectable", props.selected && "selected"].filter(Boolean).join(" ");
  return (
    <g className={cls} transform={`translate(${x - NW / 2},${y - NH / 2})`} onClick={props.onClick} onContextMenu={props.onClick}>
      <rect className="hit" x="-6" y="-6" width={NW + 12} height={NH + 12} rx="12" />
      {props.stack && <rect x="-7" y="-7" width={NW + 14} height={NH + 14} rx="13" className="branch-ring" stroke={colorOf(props.stack.owner)} />}
      <rect width={NW} height={NH} rx="8" className="body" style={{ stroke: color, fill: `color-mix(in srgb, ${color} 22%, #0b1116)` }} />
      {props.stronghold && (
        <g className="heatsink" transform={`translate(${NW - 24}, 6)`}>
          {[0, 5, 10, 15].map((i) => (
            <rect key={i} x={i} y="0" width="3" height="11" rx="1" />
          ))}
        </g>
      )}
      <text x="9" y="17" className="sector-name">
        {props.name}
      </text>
      {!props.blank && <text x="9" y="41" className="troops" style={{ fill: color }}>
        {props.troops}
        {props.pending > 0 && <tspan className="pending"> +{props.pending}</tspan>}
      </text>}
      {props.stack && (
        <g transform={`translate(${NW - 34}, ${NH - 24})`}>
          <rect width="40" height="22" rx="11" className="ghost" style={{ stroke: QUANTUM }} />
          <text x="20" y="15.5" textAnchor="middle" className="ghost-text">
            ?{props.stack.size}
          </text>
        </g>
      )}
    </g>
  );
}

function Effects({ map, effects }: { map: BoardMap; effects: Effect[] }) {
  return (
    <g pointerEvents="none">
      {effects.map((e) => {
        const [x, y] = map.positions[e.sector]!;
        if (e.kind === "attack" && e.from) {
          const [fx, fy] = map.positions[e.from]!;
          return (
            <g key={e.id} className="fx-attack">
              <line x1={fx} y1={fy} x2={x} y2={y} stroke={e.color} />
              <text x={x} y={y - NH / 2 - 14} textAnchor="middle" className={`fx-text ${e.won ? "won" : "lost"}`}>
                {e.text}
              </text>
            </g>
          );
        }
        if (e.kind === "collapse")
          return (
            <g key={e.id} className="fx-collapse">
              <circle cx={x} cy={y} r="40" stroke={QUANTUM} />
              <text x={x} y={y - NH / 2 - 14} textAnchor="middle" className="fx-text quantum">
                {e.text}
              </text>
            </g>
          );
        return (
          <g key={e.id} className="fx-vanish">
            <text x={x} y={y + 6} textAnchor="middle">
              ∅
            </text>
          </g>
        );
      })}
    </g>
  );
}

function BoardImpl({ map, geo, view, selectable, selected, pending, effects, onSector, blank }: Props) {
  const stackAt = useMemo(() => {
    const m = new Map<string, QuantumStack>();
    for (const st of view.stacks) for (const b of st.branches) m.set(b, st);
    return m;
  }, [view.stacks]);
  const lay = useMemo(() => layout(map), [map]);
  const background = useMemo(
    () => (
      <>
        <Substrate />
        <Packages lay={lay} map={map} />
        <Connections lay={lay} />
      </>
    ),
    [lay, map],
  );
  return (
    <svg className="board" viewBox={`${-GUTTER} ${-GUTTER} ${W + 2 * GUTTER} ${H + 2 * GUTTER}`} role="img" aria-label="The Mainboard">
      {background}
      <StackLinks map={map} stacks={view.stacks} />
      {Object.keys(map.positions).map((s) => (
        <Sector
          key={s}
          name={s}
          pos={map.positions[s]!}
          owner={view.sectors[s]!.owner}
          troops={view.sectors[s]!.troops}
          stack={stackAt.get(s)}
          stronghold={geo.strongholds.has(s)}
          selectable={selectable.has(s)}
          selected={selected.includes(s)}
          pending={pending[s] ?? 0}
          blank={blank}
          onClick={(e) => onSector(s, e)}
        />
      ))}
      <Effects map={map} effects={effects} />
    </svg>
  );
}

export const Board = memo(BoardImpl);
