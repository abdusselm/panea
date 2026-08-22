// Long-lived top-level DOM references. Module scripts run after the document is
// parsed, so these elements exist at import time.

export const workspace = document.getElementById("workspace");
export const tablistEl = document.getElementById("tablist");
export const emptyEl = document.getElementById("empty");
