// panea desktop shell.
//
// Wraps the local web UI in a native window using the Electron runtime that
// ships pre-signed and notarized, so it launches on a managed Mac without any
// self-built native binary. The window loads the same 127.0.0.1 server the
// browser build uses; the server is started here as a child process.

const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

const PORT = Number(process.env.PANEA_PORT || 4820);
const HOST = "127.0.0.1";
const ROOT = path.join(__dirname, "..");

app.setName("panea");

let serverProc = null;
let win = null;

function startServer() {
  serverProc = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: ROOT,
    env: { ...process.env, PANEA_PORT: String(PORT), PANEA_NO_OPEN: "1", ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  serverProc.on("exit", (code) => {
    if (code && code !== 0) console.error("panea server exited", code);
  });
}

// Resolve once the server is accepting TCP connections.
function waitForPort(retries = 100) {
  return new Promise((resolve, reject) => {
    const tryOnce = (n) => {
      const sock = net.connect(PORT, HOST);
      sock.once("connect", () => { sock.destroy(); resolve(); });
      sock.once("error", () => {
        sock.destroy();
        if (n <= 0) reject(new Error("server did not start"));
        else setTimeout(() => tryOnce(n - 1), 100);
      });
    };
    tryOnce(retries);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: "#0a0a0a",
    titleBarStyle: "hiddenInset", // native traffic lights over our chrome, like cmux
    trafficLightPosition: { x: 14, y: 18 },
    title: "panea",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.webContents.session.clearCache().catch(() => {});
  win.loadURL(`http://${HOST}:${PORT}`);

  // Open any external links in the real browser, not inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  // One-shot screenshot mode (dev aid): capture the window then quit.
  if (process.env.PANEA_CAPTURE) {
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          if (process.env.PANEA_DEMO_TITLE) {
            // Emit an OSC title on the focused pane exactly like a running
            // program would, to exercise the auto-title code path.
            const t = JSON.stringify(process.env.PANEA_DEMO_TITLE);
            await win.webContents.executeJavaScript(
              `panea.state.panes.get(panea.state.focusedPaneId).term.write("\\x1b]2;" + ${t} + "\\x07")`
            );
            await new Promise((r) => setTimeout(r, 600));
          }
          if (process.env.PANEA_DEMO_TEXT) {
            const txt = JSON.stringify(process.env.PANEA_DEMO_TEXT);
            await win.webContents.executeJavaScript(
              `panea.state.panes.get(panea.state.focusedPaneId).term.write(${txt}.replace(/\\n/g, "\\r\\n"))`
            );
            await new Promise((r) => setTimeout(r, 400));
          }
          if (process.env.PANEA_DEMO_JS) {
            await win.webContents.executeJavaScript(process.env.PANEA_DEMO_JS);
            await new Promise((r) => setTimeout(r, 1100));
          }
          const img = await win.webContents.capturePage();
          require("node:fs").writeFileSync(process.env.PANEA_CAPTURE, img.toPNG());
        } catch (e) { console.error("capture failed", e); }
        app.quit();
      }, Number(process.env.PANEA_CAPTURE_DELAY || 3500));
    });
  }
}

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForPort();
  } catch (e) {
    console.error(e.message);
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
  if (serverProc) { try { serverProc.kill("SIGTERM"); } catch (_) {} }
});
