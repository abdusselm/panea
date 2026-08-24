import test from "node:test";
import assert from "node:assert/strict";

import { shellEnv, cleanPath } from "../server/shell-env.js";

test("drops the npm config npm run injects, which stops nvm activating", () => {
  const env = shellEnv({ HOME: "/Users/x", npm_config_prefix: "/Users/x/.npm-global" });
  assert.equal(env.npm_config_prefix, undefined);
  assert.equal(env.HOME, "/Users/x");
});

test("drops every npm_ variable regardless of case", () => {
  const env = shellEnv({ npm_package_name: "panea", NPM_CONFIG_REGISTRY: "https://r", npm_execpath: "/x" });
  assert.deepEqual(env, {});
});

test("drops the electron launcher flags so a pane can run electron itself", () => {
  const env = shellEnv({ ELECTRON_RUN_AS_NODE: "1", NODE: "/opt/node", INIT_CWD: "/tmp" });
  assert.deepEqual(env, {});
});

test("keeps everything the user's shell actually needs", () => {
  const env = shellEnv({ HOME: "/Users/x", SHELL: "/bin/zsh", NVM_DIR: "/Users/x/.nvm", PANEA_THEME_DIR: "/z" });
  assert.deepEqual(env, { HOME: "/Users/x", SHELL: "/bin/zsh", NVM_DIR: "/Users/x/.nvm", PANEA_THEME_DIR: "/z" });
});

test("strips the local bin directories npm prepends to PATH", () => {
  const path = cleanPath("/repo/node_modules/.bin:/repo/../node_modules/.bin:/usr/bin:/bin");
  assert.equal(path, "/usr/bin:/bin");
});

test("leaves an ordinary PATH untouched", () => {
  assert.equal(cleanPath("/usr/bin:/bin"), "/usr/bin:/bin");
});

test("PATH is cleaned in place rather than dropped", () => {
  const env = shellEnv({ PATH: "/repo/node_modules/.bin:/usr/bin" });
  assert.equal(env.PATH, "/usr/bin");
});
