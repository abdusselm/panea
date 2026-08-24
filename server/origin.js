

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

function hostnameOf(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function isLoopback(value) {
  const hostname = hostnameOf(value);
  return hostname !== null && LOOPBACK.has(hostname);
}

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
