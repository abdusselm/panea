const loading = new Map();

export function loadVendor(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!loading.has(src)) {
    loading.set(src, new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve(window[globalName] || null);
      s.onerror = () => { loading.delete(src); s.remove(); resolve(null); };
      document.head.appendChild(s);
    }));
  }
  return loading.get(src);
}
