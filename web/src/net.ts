import { useCallback, useEffect, useRef, useState } from "react";
import type { MapDef } from "../../src/engine/types.js";
import type { Action, ClientMessage, GameView, SeatKind, ServerMessage } from "../../src/server/protocol.js";

export type BoardMap = MapDef & { positions: Record<string, [number, number]> };

export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ??
  (["localhost", "127.0.0.1"].includes(location.hostname) ? `ws://${location.hostname}:8787/ws` : "wss://play.vincentschall.com/ws");

const storeKey = (room: string) => `quantumrisk:room:${room}`;
function loadTokens(room: string): Record<number, string> {
  try {
    return JSON.parse(localStorage.getItem(storeKey(room)) ?? "{}") as Record<number, string>;
  } catch {
    return {};
  }
}
function saveTokens(room: string, tokens: Record<number, string>) {
  try {
    localStorage.setItem(storeKey(room), JSON.stringify(tokens));
  } catch {
    /* private mode: tokens only live in memory */
  }
}
export function hasSavedSeats(room: string): boolean {
  return Object.keys(loadTokens(room)).length > 0;
}

export interface Connection {
  status: "connecting" | "open" | "closed";
  view: GameView | null;
  map: BoardMap | null;
  room: string | null;
  error: string | null;
  clearError(): void;
  create(mode: "missions" | "domination", seats: { kind: SeatKind; name: string }[]): void;
  join(room: string, name?: string): void;
  act(action: Action): void;
}

/** One WebSocket to the game server, with automatic reconnect and seat resume. */
export function useConnection(): Connection {
  const [status, setStatus] = useState<Connection["status"]>("connecting");
  const [view, setView] = useState<GameView | null>(null);
  const [map, setMap] = useState<BoardMap | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const tokens = useRef<Record<number, string>>({});
  const roomRef = useRef<string | null>(null);
  const queue = useRef<ClientMessage[]>([]);

  const send = useCallback((m: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(m));
    else queue.current.push(m);
  }, []);

  useEffect(() => {
    let stopped = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout>;
    const connect = () => {
      setStatus("connecting");
      const sock = new WebSocket(SERVER_URL);
      ws.current = sock;
      sock.onopen = () => {
        retry = 0;
        setStatus("open");
        // Resume the current room after a reconnect.
        if (roomRef.current && !queue.current.some((m) => m.t === "join" || m.t === "create"))
          sock.send(JSON.stringify({ t: "join", room: roomRef.current, tokens: Object.values(tokens.current) } satisfies ClientMessage));
        for (const m of queue.current.splice(0)) sock.send(JSON.stringify(m));
      };
      sock.onmessage = (ev) => {
        const m = JSON.parse(String(ev.data)) as ServerMessage;
        if (m.t === "joined") {
          roomRef.current = m.room;
          tokens.current = { ...loadTokens(m.room), ...m.tokens };
          saveTokens(m.room, tokens.current);
          setRoom(m.room);
          setMap(m.map);
          const url = new URL(location.href);
          url.searchParams.set("room", m.room);
          history.replaceState(null, "", url);
        } else if (m.t === "state") setView(m.view);
        else if (m.t === "error") setError(m.message);
      };
      sock.onclose = () => {
        setStatus("closed");
        if (!stopped) timer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 10_000));
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ws.current?.close();
    };
  }, []);

  return {
    status,
    view,
    map,
    room,
    error,
    clearError: () => setError(null),
    create: (mode, seats) => send({ t: "create", mode, seats }),
    join: (r, name) => {
      roomRef.current = r;
      send({ t: "join", room: r, name, tokens: Object.values(loadTokens(r)) });
    },
    act: (action) => {
      const v = view;
      const r = roomRef.current;
      const token = v ? tokens.current[v.current] : undefined;
      if (!r || !token) return setError("It is not your turn");
      send({ t: "act", room: r, token, action });
    },
  };
}
