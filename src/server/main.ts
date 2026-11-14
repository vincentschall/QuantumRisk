/**
 * QuantumRisk game server: HTTP health check plus one WebSocket endpoint (/ws).
 * The server runs the engine and Moth; browsers only receive what their seats may see.
 *   PORT (default 8787), ALLOWED_ORIGINS (comma-separated; default: any), MOTH_API_KEY (via .env)
 */
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { RuleError, type PlayerId } from "../engine/index.js";
import { loadMap } from "../node/loadMap.js";
import { createHybridSource } from "../node/quantumSource.js";
import type { ClientMessage, ServerMessage } from "./protocol.js";
import { Room, roomId, type Listener } from "./room.js";

const PORT = Number(process.env.PORT ?? 8787);
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const ROOM_TTL_MS = 6 * 3600_000;
const MAX_ROOMS = 200;

const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);
const map = loadMap();
const mapDef = map.def as typeof map.def & { positions: Record<string, [number, number]> };
const source = createHybridSource({ onProviderError: (p, e) => log(`measurement provider ${p} failed: ${(e as Error).message}`) });
void source.ready(64).then(() => log(`measurement buffer ready: ${JSON.stringify(source.bufferedBySource())}`));

const rooms = new Map<string, Room>();

const http = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, bits: source.bufferedBySource() }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({
  server: http,
  path: "/ws",
  maxPayload: 16 * 1024,
  verifyClient: ({ origin }: { origin: string }) => ORIGINS.length === 0 || ORIGINS.includes(origin),
});

wss.on("connection", (ws: WebSocket) => {
  const memberships = new Map<Room, Listener>();
  const send = (m: ServerMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));

  const listen = (room: Room, seats: PlayerId[]) => {
    let l = memberships.get(room);
    if (!l) {
      l = { seats: new Set(), send: (view) => send({ t: "state", view }) };
      memberships.set(room, l);
      room.listeners.add(l);
    }
    for (const s of seats) l.seats.add(s);
    room.broadcast();
  };

  ws.on("message", async (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      return send({ t: "error", message: "Invalid message" });
    }
    try {
      if (msg.t === "create") {
        if (rooms.size >= MAX_ROOMS) throw new RuleError("The server is full, try again later");
        const id = roomId();
        const room = new Room(id, msg.mode === "domination" ? "domination" : "missions", msg.seats, map, source, log);
        rooms.set(id, room);
        log(`room ${id} created: ${msg.seats.map((s) => s.kind).join(",")} ${room.mode}`);
        const tokens = room.localTokens(msg.seats.map((s) => s.kind));
        send({ t: "joined", room: id, tokens, map: mapDef });
        listen(room, Object.keys(tokens).map(Number));
        room.scheduleBots();
      } else if (msg.t === "join") {
        const room = rooms.get(msg.room);
        if (!room) throw new RuleError("This game doesn't exist (any more)");
        const seats = room.seatsForTokens(msg.tokens ?? []);
        const tokens: Record<number, string> = {};
        for (const s of seats) tokens[s] = room.seats[s]!.token;
        if (seats.length === 0 && msg.name !== undefined) {
          const s = room.claimOpenSeat(msg.name);
          if (s !== null) {
            tokens[s] = room.seats[s]!.token;
            seats.push(s);
          }
        }
        send({ t: "joined", room: room.id, tokens, map: mapDef }); // no tokens = spectator
        listen(room, seats);
      } else if (msg.t === "act") {
        const room = rooms.get(msg.room);
        if (!room) throw new RuleError("This game doesn't exist (any more)");
        const [seat] = room.seatsForTokens([msg.token]);
        if (seat === undefined) throw new RuleError("You don't hold that seat");
        await room.act(seat, msg.action);
      }
    } catch (e) {
      send({ t: "error", message: e instanceof RuleError ? e.message : "Server error" });
      if (!(e instanceof RuleError)) log(`error: ${(e as Error).stack ?? e}`);
    }
  });

  ws.on("close", () => {
    for (const [room, l] of memberships) {
      room.listeners.delete(l);
      room.broadcast();
    }
  });
});

setInterval(() => {
  for (const [id, room] of rooms)
    if (Date.now() - room.lastActivity > ROOM_TTL_MS && room.listeners.size === 0) {
      room.stop();
      rooms.delete(id);
      log(`room ${id} expired`);
    }
}, 600_000).unref();

http.listen(PORT, () => log(`QuantumRisk server on :${PORT}${ORIGINS.length ? ` (origins: ${ORIGINS.join(", ")})` : ""}`));
