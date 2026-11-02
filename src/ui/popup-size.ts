/** Chrome measures an action popup's document to determine its initial viewport.
 * Using that viewport (vw/vh or percentages through an auto-sized root) to size
 * the document creates a feedback loop and can collapse it to a tiny box.
 */
export function popupDimensions(
  extension: boolean,
  available: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  if (extension)
    return {
      width: Math.max(280, Math.min(384, available.width - 32 || 384)),
      height: Math.max(280, Math.min(560, available.height - 180 || 560)),
    };
  return {
    width: Math.max(160, Math.min(384, viewport.width)),
    height: Math.max(160, Math.min(560, viewport.height)),
  };
}
export function applyPopupDimensions(extension: boolean) {
  const size = popupDimensions(
    extension,
    { width: screen.availWidth, height: screen.availHeight },
    { width: innerWidth, height: innerHeight },
  );
  document.documentElement.style.setProperty('--popup-width', `${size.width}px`);
  document.documentElement.style.setProperty('--popup-height', `${size.height}px`);
}
