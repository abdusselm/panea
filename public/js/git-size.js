

export const MIN_BOX_W = 560;
export const MIN_BOX_H = 320;
export const MIN_FILES_W = 190;
export const MIN_DIFF_W = 300;

export function clampGitBox(box, viewportW, viewportH) {
  const maxW = Math.max(280, viewportW - 32);
  const maxH = Math.max(220, viewportH - 56);
  const minW = Math.min(MIN_BOX_W, maxW);
  const minH = Math.min(MIN_BOX_H, maxH);
  return {
    w: Math.round(Math.min(maxW, Math.max(minW, box.w))),
    h: Math.round(Math.min(maxH, Math.max(minH, box.h))),
  };
}

export function defaultGitBox(viewportW, viewportH) {
  return clampGitBox({ w: Math.min(1500, viewportW - 56), h: viewportH * 0.86 }, viewportW, viewportH);
}

export function clampFilesWidth(width, boxW) {
  const max = Math.max(MIN_FILES_W, boxW - MIN_DIFF_W);
  return Math.round(Math.min(max, Math.max(MIN_FILES_W, width)));
}

export function defaultFilesWidth(boxW) {
  return clampFilesWidth(Math.max(340, boxW * 0.26), boxW);
}
