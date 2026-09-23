const EARLY_MAX = 50;

let listener = null;
const early = [];

export function noteFeatureUsed(featureId) {
  if (listener) listener(featureId);
  else if (early.length < EARLY_MAX) early.push(featureId);
}

export function onFeatureUsed(fn) {
  listener = fn;
  for (const featureId of early.splice(0)) fn(featureId);
}
