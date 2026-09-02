

const ERROR_MS = 5000;

let el = null;
let labelEl = null;
let fillEl = null;
let clearTimer = null;

function mount() {
  if (el) return el;
  el = document.createElement("div");
  el.id = "update-status";
  const dot = document.createElement("span");
  dot.className = "dot";
  labelEl = document.createElement("span");
  labelEl.className = "label";
  const bar = document.createElement("span");
  bar.className = "bar";
  fillEl = document.createElement("span");
  fillEl.className = "fill";
  bar.appendChild(fillEl);
  el.append(dot, labelEl, bar);
  const list = document.getElementById("tablist");
  if (list && list.parentNode) list.parentNode.insertBefore(el, list);
  else document.body.appendChild(el);
  return el;
}

function show(kind) {
  mount();
  el.dataset.kind = kind;
  el.classList.add("show");
}

function hide() {
  if (el) el.classList.remove("show");
}

export function applyUpdateStatus(msg) {
  clearTimeout(clearTimer);
  clearTimer = null;

  switch (msg.state) {
    case "downloading": {
      show("downloading");
      labelEl.textContent = `panea ${msg.version} indiriliyor…`;
      const known = typeof msg.percent === "number";
      el.classList.toggle("indeterminate", !known);
      fillEl.style.width = known ? `${msg.percent}%` : "";
      break;
    }
    case "ready": {
      show("ready");
      el.classList.remove("indeterminate");
      fillEl.style.width = "100%";
      labelEl.textContent = `panea ${msg.version} hazır — kullanmak için yeniden başlatın`;
      break;
    }
    case "error": {
      show("error");
      el.classList.remove("indeterminate");
      labelEl.textContent = "panea güncellemesi başarısız oldu";
      clearTimer = setTimeout(() => { clearTimer = null; hide(); }, ERROR_MS);
      break;
    }
    default:
      hide();
  }
}
