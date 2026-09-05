

import { state } from "./state.js";
import { ICON } from "./theme.js";
import { setPaneTitle } from "./tabs.js";
import { persist } from "./session.js";
import { splitPane, closePane, focusPane } from "./panes.js";
import { wirePaneArrange } from "./pane-arrange.js";
import { wirePaneIdentity, applyPaneIdentity } from "./pane-identity.js";
import { wirePaneVisibility, applyPaneHidden } from "./pane-visibility.js";
import { normalizeUrl, hostLabel, BLANK_URL } from "./browser-url.js";

export const HOME_URL = "https://duckduckgo.com";

export function isDesktopRuntime() {
  return typeof navigator !== "undefined" && /\bElectron\//.test(navigator.userAgent || "");
}

export function isBrowserPane(pane) {
  return !!pane && pane.kind === "browser";
}

export function browserPaneUrl(pane) {
  return isBrowserPane(pane) ? pane.url || "" : "";
}

export function createBrowserPane(paneId, tabId, url, restore) {
  const desktop = isDesktopRuntime();
  const startUrl = normalizeUrl(url || (desktop ? HOME_URL : "")) || BLANK_URL;

  const el = document.createElement("div");
  el.className = "leaf node browser-leaf";
  el.dataset.paneId = paneId;
  el.innerHTML = `
    <div class="leaf-bar">
      <span class="ico">${ICON.globe}</span>
      <span class="attn-dot"></span>
      <span class="title"></span>
      <div class="actions">
        <button data-act="split-h" title="Split right (Cmd-D)">${ICON.splitH}</button>
        <button data-act="split-v" title="Split down (Cmd-Shift-D)">${ICON.splitV}</button>
        <button data-act="hide" title="Hide pane (keeps it running)">${ICON.eyeOff}</button>
        <button class="close" data-act="close" title="Close (Cmd-W)">${ICON.close}</button>
      </div>
    </div>
    <div class="browser-bar">
      <button class="browser-nav" data-act="back" title="Back">${ICON.chevronLeft}</button>
      <button class="browser-nav" data-act="forward" title="Forward">${ICON.chevronRight}</button>
      <button class="browser-nav" data-act="reload" title="Reload">${ICON.reload}</button>
      <input class="browser-address" spellcheck="false" autocomplete="off" placeholder="Enter a URL or search" />
      <button class="browser-nav" data-act="external" title="Open in system browser">${ICON.external}</button>
    </div>
    <div class="browser-view"></div>`;

  const titleEl = el.querySelector(".title");
  const addressEl = el.querySelector(".browser-address");
  const viewEl = el.querySelector(".browser-view");
  const title = hostLabel(startUrl);
  titleEl.textContent = title;
  addressEl.value = startUrl === BLANK_URL ? "" : startUrl;

  const pane = {
    id: paneId,
    kind: "browser",
    tabId,
    el,
    titleEl,
    addressEl,
    viewEl,
    view: null,
    url: startUrl,
    loading: false,
    title,
    customTitle: "",
    color: "",
    hidden: false,
    exited: false,
    renaming: false,
    attention: false,
    attnReason: "",
    attnMessage: "",
    idleTimer: null,
    refitRAF: 0,
    exchanges: [],
    queuedInput: [],
    cwd: "",
    meta: { cwd: "", branch: "", ports: [], agent: "" },
  };
  state.panes.set(paneId, pane);

  if (!desktop) viewEl.before(buildNotice(pane));
  pane.view = desktop ? buildWebview(pane, startUrl) : buildFrame(pane, startUrl);
  viewEl.appendChild(pane.view);
  if (startUrl === BLANK_URL) showPlaceholder(pane);

  el.querySelector('[data-act="split-h"]').onclick = (e) => { e.stopPropagation(); splitPane(paneId, "h"); };
  el.querySelector('[data-act="split-v"]').onclick = (e) => { e.stopPropagation(); splitPane(paneId, "v"); };
  el.querySelector('[data-act="close"]').onclick = (e) => { e.stopPropagation(); closePane(paneId); };
  el.querySelector('[data-act="back"]').onclick = (e) => { e.stopPropagation(); goBack(pane); };
  el.querySelector('[data-act="forward"]').onclick = (e) => { e.stopPropagation(); goForward(pane); };
  el.querySelector('[data-act="reload"]').onclick = (e) => { e.stopPropagation(); reload(pane); };
  el.querySelector('[data-act="external"]').onclick = (e) => { e.stopPropagation(); openExternal(pane); };
  el.addEventListener("mousedown", () => focusPane(paneId));

  addressEl.addEventListener("mousedown", (e) => e.stopPropagation());
  addressEl.addEventListener("focus", () => addressEl.select());
  addressEl.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); navigate(pane, addressEl.value); }
    else if (e.key === "Escape") { e.preventDefault(); addressEl.value = pane.url; addressEl.blur(); focusBrowserPane(pane); }
  });

  wirePaneArrange(pane);
  wirePaneIdentity(pane);
  wirePaneVisibility(pane);
  applyPaneIdentity(pane, restore);
  applyPaneHidden(pane, restore);
  syncNavState(pane);
  return pane;
}

function buildNotice(pane) {
  const notice = document.createElement("div");
  notice.className = "browser-notice";
  notice.innerHTML =
    '<span class="bn-text">Limited in browser mode — sites that send <code>X-Frame-Options</code> refuse to load here. ' +
    'Run <code>panea --app</code> for the full browser pane.</span>' +
    '<button class="bn-open">Open in system browser</button>' +
    '<button class="bn-x" title="Dismiss">×</button>';
  notice.querySelector(".bn-open").onclick = (e) => { e.stopPropagation(); openExternal(pane); };
  notice.querySelector(".bn-x").onclick = (e) => { e.stopPropagation(); notice.remove(); };
  return notice;
}

function buildWebview(pane, url) {
  const view = document.createElement("webview");
  view.setAttribute("src", url);
  view.setAttribute("partition", "persist:panea-browser");
  view.setAttribute("allowpopups", "false");
  view.addEventListener("did-start-loading", () => setLoading(pane, true));
  view.addEventListener("did-stop-loading", () => { setLoading(pane, false); syncNavState(pane); });
  view.addEventListener("did-navigate", (e) => applyUrl(pane, e.url));
  view.addEventListener("did-navigate-in-page", (e) => { if (e.isMainFrame) applyUrl(pane, e.url); });
  view.addEventListener("page-title-updated", (e) => { if (e.title) setPaneTitle(pane.id, e.title); });
  view.addEventListener("did-fail-load", (e) => {
    if (e.isMainFrame && e.errorCode !== -3) showViewError(pane, e.errorDescription || "Load failed");
  });
  return view;
}

function buildFrame(pane, url) {
  const view = document.createElement("iframe");
  view.className = "browser-frame";
  view.setAttribute("referrerpolicy", "no-referrer");
  view.src = url;
  view.addEventListener("load", () => setLoading(pane, false));
  return view;
}

function setLoading(pane, on) {
  pane.loading = on;
  pane.el.classList.toggle("browser-loading", on);
}

function applyUrl(pane, url) {
  if (!url || url === pane.url) return;
  pane.url = url;
  if (document.activeElement !== pane.addressEl) pane.addressEl.value = url === BLANK_URL ? "" : url;
  if (!pane.customTitle) setPaneTitle(pane.id, hostLabel(url));
  persist();
}

export function navigate(pane, input) {
  if (!isBrowserPane(pane)) return;
  const url = normalizeUrl(input);
  if (!url) { pane.addressEl.value = pane.url; return; }
  clearViewError(pane);
  pane.addressEl.blur();
  if (pane.view.tagName === "WEBVIEW") pane.view.src = url;
  else { setLoading(pane, true); pane.view.src = url; }
  applyUrl(pane, url);
  focusBrowserPane(pane);
}

function goBack(pane) {
  if (pane.view.tagName !== "WEBVIEW") return;
  try { if (pane.view.canGoBack()) pane.view.goBack(); } catch (_) {}
}

function goForward(pane) {
  if (pane.view.tagName !== "WEBVIEW") return;
  try { if (pane.view.canGoForward()) pane.view.goForward(); } catch (_) {}
}

function reload(pane) {
  clearViewError(pane);
  if (pane.view.tagName === "WEBVIEW") { try { pane.view.reload(); } catch (_) {} return; }
  setLoading(pane, true);
  pane.view.src = pane.url;
}

function openExternal(pane) {
  if (!pane.url || pane.url === BLANK_URL) return;
  window.open(pane.url, "_blank", "noopener");
}

function syncNavState(pane) {
  const desktop = pane.view && pane.view.tagName === "WEBVIEW";
  const back = pane.el.querySelector('[data-act="back"]');
  const forward = pane.el.querySelector('[data-act="forward"]');
  if (!desktop) { back.disabled = true; forward.disabled = true; return; }
  try {
    back.disabled = !pane.view.canGoBack();
    forward.disabled = !pane.view.canGoForward();
  } catch (_) {}
}

function showViewError(pane, message) {
  clearViewError(pane);
  const box = document.createElement("div");
  box.className = "browser-error";
  box.textContent = message;
  pane.viewEl.appendChild(box);
}

function clearViewError(pane) {
  const box = pane.viewEl.querySelector(".browser-error");
  if (box) box.remove();
  const hint = pane.viewEl.querySelector(".browser-placeholder");
  if (hint) hint.remove();
}

function showPlaceholder(pane) {
  const hint = document.createElement("div");
  hint.className = "browser-placeholder";
  hint.innerHTML =
    "<strong>Enter a URL above.</strong>" +
    "<span>Local dev servers load here. Most public sites refuse to be framed — " +
    "run <code>panea --app</code> for those.</span>";
  pane.viewEl.appendChild(hint);
}

export function focusBrowserPane(pane) {
  if (!isBrowserPane(pane)) return;
  try { pane.view.focus(); } catch (_) {}
}

export function focusBrowserAddress(pane) {
  if (!isBrowserPane(pane)) return;
  pane.addressEl.focus();
  pane.addressEl.select();
}

export function destroyBrowserPane(pane) {
  if (!isBrowserPane(pane)) return;
  try { pane.view.remove(); } catch (_) {}
  pane.view = null;
}
