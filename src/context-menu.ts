/** Electron's context-menu coordinates are in the embedder's viewport DIPs,
 * including the webview's offset. SiYuan menus expect host CSS pixels instead.
 * Reader-mode DOM events already supply host CSS pixels. Neither path needs
 * the guest's zoom factor, the display scale factor or a webview offset.
 */
export function contextMenuPosition(
  context: { x?: number; y?: number; hostContext?: boolean },
  hostZoom: number,
): { x: number; y: number } {
  const scale =
    context.hostContext || !Number.isFinite(hostZoom) || hostZoom <= 0
      ? 1
      : hostZoom;
  return {
    x: (Number.isFinite(context.x) ? context.x! : 0) / scale,
    y: (Number.isFinite(context.y) ? context.y! : 0) / scale,
  };
}
