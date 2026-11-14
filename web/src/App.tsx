import { useEffect, useState } from "react";
import type { SeatKind } from "../../src/server/protocol.js";
import { GameScreen } from "./Game.js";
import { hasSavedSeats, useConnection } from "./net.js";
import { colorOf } from "./rules.js";

const initialRoom = new URLSearchParams(location.search).get("room");

export function App() {
  const conn = useConnection();
  const [joinName, setJoinName] = useState("");
  const [askName, setAskName] = useState(false);

  // Opening a link with ?room=…: resume your seats, or ask for a name to take an open seat.
  useEffect(() => {
    if (!initialRoom) return;
    if (hasSavedSeats(initialRoom)) conn.join(initialRoom);
    else setAskName(true);
  }, []);

  useEffect(() => {
    if (!conn.error) return;
    const t = setTimeout(conn.clearError, 4000);
    return () => clearTimeout(t);
  }, [conn.error]);

  const inviteUrl = conn.room ? `${location.origin}${location.pathname}?room=${conn.room}` : "";

  return (
    <>
      <DesktopNotice />
      {conn.status !== "open" && <div className="status">{conn.status === "connecting" ? "Connecting to the game server…" : "Connection lost, reconnecting…"}</div>}
      {conn.error && (
        <div className="toast" onClick={conn.clearError}>
          {conn.error}
        </div>
      )}
      {conn.view && conn.map ? (
        <GameScreen view={conn.view} map={conn.map} act={conn.act} inviteUrl={inviteUrl} />
      ) : askName && initialRoom ? (
        <div className="lobby">
          <Title />
          <section className="panel">
            <h3>Join game</h3>
            <label className="field">
              Your name
              <input value={joinName} maxLength={20} onChange={(e) => setJoinName(e.target.value)} placeholder="Name" autoFocus />
            </label>
            <div className="row">
              <button className="primary" onClick={() => (conn.join(initialRoom, joinName || "Player"), setAskName(false))}>
                Join
              </button>
              <button onClick={() => conn.join(initialRoom)}>Just watch</button>
            </div>
          </section>
        </div>
      ) : (
        <Lobby onCreate={conn.create} />
      )}
    </>
  );
}

function Title() {
  return (
    <header className="title">
      <h1>QuantumRisk</h1>
    </header>
  );
}

const KIND_LABEL: Record<SeatKind, string> = { local: "Here", open: "Invite", bot: "Bot" };

function Lobby({ onCreate }: { onCreate(mode: "missions" | "domination", seats: { kind: SeatKind; name: string }[]): void }) {
  const [count, setCount] = useState(3);
  const [mode, setMode] = useState<"missions" | "domination">("missions");
  const [seats, setSeats] = useState<{ kind: SeatKind; name: string }[]>([
    { kind: "local", name: "" },
    { kind: "bot", name: "" },
    { kind: "bot", name: "" },
    { kind: "bot", name: "" },
  ]);
  const active = seats.slice(0, count);
  return (
    <div className="lobby">
      <Title />
      <section className="panel">
        <h3>New game</h3>
        <div className="row">
          {[2, 3, 4].map((n) => (
            <button key={n} className={count === n ? "on" : ""} onClick={() => setCount(n)}>
              {n} players
            </button>
          ))}
        </div>
        <div className="row">
          <button className={mode === "missions" ? "on" : ""} onClick={() => setMode("missions")}>
            Missions · ~30 min
          </button>
          <button className={mode === "domination" ? "on" : ""} onClick={() => setMode("domination")}>
            Domination · longer
          </button>
        </div>
        <div className="seats">
          {active.map((s, i) => (
            <div key={i} className="seat" style={{ borderColor: colorOf(i) }}>
              <span className="dot" style={{ background: colorOf(i) }} />
              <input
                value={s.name}
                maxLength={20}
                placeholder={s.kind === "bot" ? `Bot ${i + 1}` : `Player ${i + 1}`}
                disabled={s.kind === "open"}
                onChange={(e) => setSeats(seats.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <div className="seg">
                {(["local", "open", "bot"] as SeatKind[]).map((k) => (
                  <button key={k} className={s.kind === k ? "on" : ""} onClick={() => setSeats(seats.map((x, j) => (j === i ? { ...x, kind: k } : x)))}>
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="muted small">
          <b>Here</b>: plays on this screen (pass it around for hot-seat). <b>Invite</b>: you get a link to send. <b>Bot</b>: the computer plays (all bots: watch a game). Seat 1 starts; later seats get a few extra
          starting troops.
        </p>
        <button className="primary big" onClick={() => onCreate(mode, active)}>
          Start game
        </button>
      </section>
      <footer className="muted small">
        Quantum measurements run on the Moth Quantum platform. <a href="https://github.com/vincentschall/QuantumRisk">Rules & source</a>
      </footer>
    </div>
  );
}

function DesktopNotice() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="desktop-notice">
      <div>
        <span className="ket">|QuantumRisk⟩</span>
        <p>QuantumRisk is playable on desktop. Open this page on a computer with a larger screen.</p>
        <button onClick={() => setDismissed(true)}>Continue anyway</button>
      </div>
    </div>
  );
}
