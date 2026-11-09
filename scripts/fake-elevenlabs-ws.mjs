// A stand-in for ElevenLabs' Text to Dialogue WebSocket, for tests and local end-to-end checks.
// No dependencies: a minimal WebSocket server on node:http (text frames, close, ping).
//
//   node scripts/fake-elevenlabs-ws.mjs 8765          # then ELEVENLABS_WS_URL=ws://127.0.0.1:8765
//
// Behaviour, chosen by the voice ID or model in the request:
//   model_id not starting with eleven_v3/eleven_v4 -> an error message, then close 1008 (like a rejected model)
//   voice "rejectsettings0"                       -> an error about voice_settings, then close 1008
//   voice "dropconnection0"                       -> closes 1011 after the first audio chunk
//   anything else                                 -> one audio chunk (silent MP3) per ~40 characters, then is_final
import http from "node:http";
import crypto from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** Silent MPEG-1 Layer III frames (128 kbps, 44.1 kHz): about 26 ms each, decodable by every browser. */
export function silentMp3(frames) {
  const frame = Buffer.alloc(417);
  frame.writeUInt32BE(0xfffb9064, 0);
  return Buffer.concat(Array.from({ length: frames }, () => frame));
}

function encodeFrame(opcode, payload) {
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, len]) : len < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  if (len >= 126 && len < 65536) {
    head[0] = 0x80 | opcode;
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else if (len >= 65536) {
    head[0] = 0x80 | opcode;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

/** Parses as many complete client frames as `buf` holds. */
function decodeFrames(buf) {
  const frames = [];
  let off = 0;
  while (buf.length - off >= 2) {
    const opcode = buf[off] & 0x0f;
    const masked = (buf[off + 1] & 0x80) !== 0;
    let len = buf[off + 1] & 0x7f;
    let p = off + 2;
    if (len === 126) {
      if (buf.length < p + 2) break;
      len = buf.readUInt16BE(p);
      p += 2;
    } else if (len === 127) {
      if (buf.length < p + 8) break;
      len = Number(buf.readBigUInt64BE(p));
      p += 8;
    }
    const maskLen = masked ? 4 : 0;
    if (buf.length < p + maskLen + len) break;
    const mask = masked ? buf.subarray(p, p + 4) : null;
    p += maskLen;
    const payload = Buffer.from(buf.subarray(p, p + len));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    frames.push({ opcode, payload });
    off = p + len;
  }
  return { frames, rest: buf.subarray(off) };
}

/**
 * Starts the fake server. Every connection is recorded in `connections` with its URL, the JSON
 * messages it received and how it ended.
 */
export function startFakeElevenLabs(port = 0) {
  const connections = [];
  const server = http.createServer((_req, res) => {
    res.writeHead(426).end();
  });
  server.on("upgrade", (req, socket) => {
    const url = new URL(req.url ?? "/", "http://fake");
    if (url.pathname !== "/v1/text-to-dialogue/stream-input") {
      socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
      return;
    }
    const accept = crypto.createHash("sha1").update(`${req.headers["sec-websocket-key"]}${GUID}`).digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const conn = { url: url.toString(), query: Object.fromEntries(url.searchParams), messages: [], closedByClient: false, closeCode: null };
    connections.push(conn);
    let buffered = Buffer.alloc(0);
    let voice = "";
    let pending = "";
    let open = true;

    const sendJSON = (obj) => open && socket.write(encodeFrame(0x1, Buffer.from(JSON.stringify(obj))));
    const close = (code, reason = "") => {
      if (!open) return;
      open = false;
      conn.closeCode = code;
      const body = Buffer.alloc(2 + Buffer.byteLength(reason));
      body.writeUInt16BE(code, 0);
      body.write(reason, 2);
      socket.write(encodeFrame(0x8, body));
      socket.end();
    };
    const audioFor = (text) => {
      const frames = Math.max(4, Math.round(text.length * 1.4)); // about 36 ms of "speech" per character
      const chars = [...text];
      sendJSON({
        audio: silentMp3(frames).toString("base64"),
        alignment: { chars, char_start_times_ms: chars.map((_, i) => i * 36), char_durations_ms: chars.map(() => 36) },
        normalized_alignment: null,
      });
    };
    // Like the real server: generate once about 40 characters and 8 words are buffered, or on flush.
    const generate = (force) => {
      while (pending.length >= 40 && pending.trim().split(/\s+/).length >= 8) {
        const cut = pending.lastIndexOf(" ", 60) > 0 ? pending.lastIndexOf(" ", 60) + 1 : pending.length;
        audioFor(pending.slice(0, cut));
        pending = pending.slice(cut);
        if (voice === "dropconnection0") return close(1011, "internal error");
      }
      if (force && pending.trim()) {
        audioFor(pending);
        pending = "";
      }
    };

    const onMessage = (msg) => {
      conn.messages.push(msg);
      if (conn.messages.length === 1) {
        if (!msg.xi_api_key) {
          sendJSON({ message: "No API key was provided.", error: "authentication_required", code: 1008, param: null });
          return close(1008, "authentication_required");
        }
        if (!/^eleven_v[34]/.test(conn.query.model_id ?? "")) {
          sendJSON({ message: "model_id must start with eleven_v3 or eleven_v4", error: "invalid_model", code: 1008, param: "model_id" });
          return close(1008, "invalid_model");
        }
        voice = msg.voices?.[0] ?? "";
        if (voice === "rejectsettings0") {
          sendJSON({ message: "voice_settings.style is not supported", error: "invalid_voice_settings", code: 1008, param: "voice_settings" });
          return close(1008, "invalid_voice_settings");
        }
        return;
      }
      for (const input of msg.inputs ?? []) pending += input.text;
      if (msg.inputs) generate(false);
      if (!open) return;
      if (msg.flush || msg.close_socket) generate(true);
      if (msg.close_socket && open) {
        sendJSON({ is_final: true });
        close(1000);
      }
    };

    socket.on("data", (chunk) => {
      buffered = Buffer.concat([buffered, chunk]);
      const { frames, rest } = decodeFrames(buffered);
      buffered = Buffer.from(rest);
      for (const f of frames) {
        if (f.opcode === 0x8) {
          if (open) conn.closedByClient = true;
          if (open) close(f.payload.length >= 2 ? f.payload.readUInt16BE(0) : 1000);
        } else if (f.opcode === 0x9) {
          socket.write(encodeFrame(0xa, f.payload));
        } else if (f.opcode === 0x1) {
          try {
            onMessage(JSON.parse(f.payload.toString("utf8")));
          } catch {
            /* ignore malformed */
          }
        }
      }
    });
    socket.on("error", () => {});
    socket.on("close", () => {
      if (open) conn.closedByClient = true;
      open = false;
    });
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        url: `ws://127.0.0.1:${address.port}`,
        connections,
        close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fake = await startFakeElevenLabs(Number(process.argv[2] ?? 8765));
  console.log(`fake ElevenLabs dialogue socket on ${fake.url}`);
}
