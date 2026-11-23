// The server for playing with friends, on Cloudflare. It only passes messages between the
// players in a room: see race-room.js for what they are. Each room is one Durable Object, named by its
// code, and each player keeps one WebSocket open to it. The sockets hibernate while nothing's being said,
// and the runtime answers the players' keep-alive pings itself, so a quiet room costs nothing.
//
//   wss://<this server>/room/<CODE> for High Five Racers, /room/<game>/<CODE> for the others, with
//   ?was=<id> for a player coming back after losing the connection, and ?make=1 for one making a new game
//
// Deploy with: npx wrangler deploy --config server/wrangler.jsonc
import { DurableObject } from 'cloudflare:workers';
import { COMES_BACK_WITHIN_MS, idFor, mostIn, RaceRoom, takeOver, validCode } from './race-room.js';

// Only the games' own pages may use it.
const ALLOWED_ORIGINS = ['https://hemi.infoicy.com', 'http://localhost:8642', 'http://127.0.0.1:8642'];
// The games with rooms of their own. High Five Racers' are just the code, as they came first.
const GAMES = ['sky-wings', 'balloon-pop', 'mighty-moves', 'bounce-back', 'leap-trail', 'giraffe-maze', 'lighthouse', 'smoothie-stand', 'cannon-bay', 'spider-catcher', 'tank-patrol', 'giraffe-garden', 'frost-arena', 'arrow-meadow', 'giraffe-puzzles', 'chick-flap', 'mighty-lift', 'gobble-grow', 'giraffe-paint', 'moto-mountain', 'rooftop-rope', 'riddle-doors'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const [, kind, ...rest] = url.pathname.split('/');
    const code = rest.at(-1);
    const game = rest.length === 2 ? rest[0] : '';
    if (kind !== 'room' || rest.length > 2 || !validCode(code) || (game && !GAMES.includes(game))) return new Response('Not found', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket only', { status: 426 });
    if (!ALLOWED_ORIGINS.includes(request.headers.get('Origin'))) return new Response('Not allowed', { status: 403 });
    return env.ROOMS.get(env.ROOMS.idFromName(game ? `${game}:${code}` : code)).fetch(request);
  },
};

const newId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.rules = new RaceRoom({ players: () => this.players() });
    this.heard = new WeakMap(); // ws: when its last message came. Its pings are answered without waking this.
  }

  /**
   * Who has just gone, kept across the times this sleeps, so that someone whose laptop slept, or whose wifi
   * dropped, comes back as themselves: still hosting, still in the race.
   */
  async remember() {
    if (this.remembered) return;
    this.remembered = true;
    for (const [id, gone] of (await this.ctx.storage.get('recent')) ?? []) if (!this.rules.recent.has(id)) this.rules.recent.set(id, gone);
  }

  async keepRecent() {
    const now = Date.now();
    const recent = [...this.rules.recent].filter(([, { at }]) => now - at <= COMES_BACK_WITHIN_MS);
    if (recent.length) await this.ctx.storage.put('recent', recent);
    else await this.ctx.storage.delete('recent');
  }

  /** Everyone still connected, as race-room.js wants them. */
  players(leaving = null) {
    return this.ctx.getWebSockets().filter((ws) => ws !== leaving && ws.readyState === WebSocket.OPEN).map((ws) => this.player(ws));
  }

  player(ws) {
    const { ctx, heard } = this;
    if (!this.seen) this.seen = new WeakMap();
    let player = this.seen.get(ws);
    if (!player) {
      player = {
        ws,
        get meta() {
          return ws.deserializeAttachment();
        },
        // Anything from them, even a ping, which the runtime answers itself and only keeps the time of.
        get heardAt() {
          let pinged = 0;
          try {
            pinged = ctx.getWebSocketAutoResponseTimestamp?.(ws)?.getTime() ?? 0;
          } catch {
            // Not known: what else came from them still counts.
          }
          return Math.max(heard.get(ws) ?? 0, pinged, ws.deserializeAttachment()?.seen ?? 0);
        },
        setMeta(meta) {
          ws.serializeAttachment(meta);
        },
        send(message) {
          try {
            ws.send(JSON.stringify(message));
          } catch {
            // It's closing.
          }
        },
        close() {
          try {
            ws.close(1000, 'replaced');
          } catch {
            // Already closed.
          }
        },
      };
      this.seen.set(ws, player);
    }
    return player;
  }

  async fetch(request) {
    await this.remember();
    const url = new URL(request.url);
    const was = url.searchParams.get('was');
    const making = url.searchParams.get('make') === '1';
    // /room/<game>/<CODE>, as the worker checked: a fight holds two.
    const [, , game, code] = url.pathname.split('/');
    // Taking over a connection that died without closing, or back within moments of one that did close.
    const kept = takeOver(this.players(), was) ?? this.rules.cameBack(was);
    const id = kept ? was : idFor(this.players(), was, newId);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    const options = { most: mostIn(code ? game : ''), making, fresh: !was && !making };
    if (!this.rules.arrive(this.player(server), id, kept, options)) server.close(1000, 'full');
    await this.keepRecent();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    this.heard.set(ws, Date.now());
    if (typeof message === 'string') this.rules.hear(this.player(ws), message);
  }

  async webSocketClose(ws) {
    await this.remember();
    this.goodbye(ws);
    await this.keepRecent();
    // Always 1000: the code that came in can be one that mustn't be sent back, like 1005 for "none given",
    // and then the player's browser waits 10 seconds for an answer before it can connect again.
    try {
      ws.close(1000, 'bye');
    } catch {
      // Already closed.
    }
  }

  async webSocketError(ws) {
    await this.remember();
    this.goodbye(ws);
    await this.keepRecent();
  }

  /** A closing socket is no longer open, so it's left out of everyone the others are told about. */
  goodbye(ws) {
    try {
      this.rules.leave(this.player(ws));
    } catch {
      // Its record had already gone with it.
    }
  }
}
