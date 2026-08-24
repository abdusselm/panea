

// Loopback-only request guards.
//
// The WebSocket bridge hands out a real login shell, and the same-origin policy
// does NOT apply to WebSocket handshakes: without this check any page you happen
// to visit could open ws://127.0.0.1:4820 and run commands as you. The HTTP side
// gets a matching Host check so a DNS-rebound name cannot be used to load the UI
// from an attacker-controlled origin in the first place.

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

function hostnameOf(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

// Port is deliberately not compared: reaching us already implies our port, and
// pinning it would only break non-default PANEA_PORT setups.
function isLoopback(value) {
  const hostname = hostnameOf(value);
  return hostname !== null && LOOPBACK.has(hostname);
}

// Browsers always send Origin on a WebSocket handshake, so a missing header
// means a non-browser client (curl, tests, the capture harness) and can never be
// a drive-by page.
export function isAllowedOrigin(origin) {
  if (!origin) return true;
  return isLoopback(origin);
}

export function isAllowedHost(host) {
  if (!host) return false;
  return isLoopback(`http://${host}`);
}

export function verifyClient({ origin }) {
  return isAllowedOrigin(origin);
}
