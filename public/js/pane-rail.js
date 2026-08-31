

export function railLayout(ratio, firstIsRail, secondIsRail) {
  const r = typeof ratio === "number" ? ratio : 0.5;
  return {
    first: firstIsRail ? 0 : secondIsRail ? 1 : r,
    second: secondIsRail ? 0 : firstIsRail ? 1 : 1 - r,
    locked: !!(firstIsRail || secondIsRail),
    packed: !!(firstIsRail && secondIsRail),
  };
}
