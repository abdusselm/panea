const DROP = new Set(["NODE", "INIT_CWD", "ELECTRON_RUN_AS_NODE", "ELECTRON_NO_ATTACH_CONSOLE"]);

function isLauncherKey(key) {
  return key.toLowerCase().startsWith("npm_") || DROP.has(key);
}

export function cleanPath(value) {
  if (!value) return value;
  return value.split(":").filter((entry) => !entry.endsWith("/node_modules/.bin")).join(":");
}

export function shellEnv(source = process.env) {
  const env = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || isLauncherKey(key)) continue;
    env[key] = value;
  }
  const path = cleanPath(env.PATH);
  if (path) env.PATH = path;
  return env;
}
