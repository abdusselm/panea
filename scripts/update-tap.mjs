#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

const REPO = "abdusselm/panea";
const TAP = process.env.PANEA_TAP || path.join(path.dirname(ROOT), "homebrew-tap");
const FORMULA = path.join(TAP, "Formula", "panea.rb");

const version = process.argv[2] || pkg.version;
const source = process.env.PANEA_TARBALL || `https://github.com/${REPO}/archive/refs/tags/v${version}.tar.gz`;

async function sha256(url) {
  if (url.startsWith("file://")) {
    return crypto.createHash("sha256").update(fs.readFileSync(fileURLToPath(url))).digest("hex");
  }
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return crypto.createHash("sha256").update(Buffer.from(await res.arrayBuffer())).digest("hex");
}

const DESC = "Local multi-pane terminal workspace with vertical tabs and split panes";

function formula(url, digest) {
  return `class Panea < Formula
  desc "${DESC}"
  homepage "https://github.com/${REPO}"
  url "${url}"
  sha256 "${digest}"
  license "MIT"

  depends_on "node"
  depends_on :macos

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def caveats
    <<~EOS
      The Electron runtime is not installed into the Cellar, because Homebrew
      relocates Mach-O files and that invalidates the signature Electron ships
      with. The first \`panea --app\` downloads it into ~/.panea/electron instead.

      \`panea\` on its own needs none of that and starts immediately.
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/panea --version")
    assert_match "multi-pane", shell_output("#{bin}/panea --help")
  end
end
`;
}

const digest = await sha256(source);

fs.mkdirSync(path.dirname(FORMULA), { recursive: true });
fs.writeFileSync(FORMULA, formula(source, digest));

console.log(`wrote ${FORMULA}`);
console.log(`  version ${version}`);
console.log(`  sha256  ${digest}`);

if (process.env.PANEA_TAP_PUSH === "1") {
  const git = (...args) => execFileSync("git", args, { cwd: TAP, stdio: "inherit" });
  git("add", "Formula/panea.rb");
  git("commit", "-m", `panea ${version}`);
  git("push");
}
