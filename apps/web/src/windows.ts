// 別の画面を別ウィンドウで開き、スクリーンの左右 / 四隅に並べる(サブウィンドウのスナップ配置。HANDOFF.md §10)。
// 使うのは標準の window.open(url, name, features) だけなので、ブラウザ単体(MemoryTransport)でも WebView2 でも同じコードが動く。
//   ブラウザ: 本物のポップアップが開く(click などユーザー操作の中で呼ぶこと。外ではポップアップブロックの対象)
//   WebView2: VB の BridgeWindows が NewWindowRequested で受け、ブリッジ付きの新しいウィンドウを features の位置・大きさに置く
// 固まったら client のサブパス(@ishibashi0112/webview2-bridge-client/windows)に切り出す

export type ScreenSlot = "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "full";

/** スクリーン上の矩形(CSS px) */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OpenScreenOptions {
  /** 置く場所。省くと位置・大きさを指定しない(WebView2 では開いた側と同じ大きさで少しずらす) */
  slot?: ScreenSlot | undefined;
  /** ウィンドウ名。同じ名前なら同じウィンドウに出る(window.open の仕様)。省くと毎回新しいウィンドウ */
  name?: string | undefined;
}

/**
 * 今のモニタの作業領域(タスクバーを除く)。Chromium(WebView2 を含む)は開いた側の画面の値を返す。
 * availLeft / availTop は標準外だが Chromium / Firefox にある(無ければ 0)
 */
export function currentScreenArea(): ScreenRect {
  const s = window.screen as Screen & { availLeft?: number; availTop?: number };
  return { left: s.availLeft ?? 0, top: s.availTop ?? 0, width: s.availWidth, height: s.availHeight };
}

/** 作業領域を 2 分割 / 4 分割した slot の矩形。割り切れない 1px は右・下の窓に寄せる */
export function slotRect(slot: ScreenSlot, area: ScreenRect): ScreenRect {
  const halfW = Math.floor(area.width / 2);
  const halfH = Math.floor(area.height / 2);
  const col = (right: boolean) => (right ? { left: area.left + halfW, width: area.width - halfW } : { left: area.left, width: halfW });
  const row = (bottom: boolean) => (bottom ? { top: area.top + halfH, height: area.height - halfH } : { top: area.top, height: halfH });
  const full = { top: area.top, height: area.height };
  switch (slot) {
    case "left":
      return { ...col(false), ...full };
    case "right":
      return { ...col(true), ...full };
    case "top-left":
      return { ...col(false), ...row(false) };
    case "top-right":
      return { ...col(true), ...row(false) };
    case "bottom-left":
      return { ...col(false), ...row(true) };
    case "bottom-right":
      return { ...col(true), ...row(true) };
    case "full":
      return { ...area };
  }
}

/**
 * window.open の features。WebView2(BridgeWindows)は width / height を枠込みの外形として扱うので、隣の窓とぴったり並ぶ。
 * ブラウザは中身の大きさとして扱うので、窓の枠の分だけ大きく出る(開発用なので割り切る)
 */
export function windowFeatures(rect: ScreenRect): string {
  const r = (n: number) => Math.round(n);
  return `popup,left=${r(rect.left)},top=${r(rect.top)},width=${r(rect.width)},height=${r(rect.height)}`;
}

/**
 * route(今の画面からの相対 URL。"#/screens/parts" など)を別ウィンドウで開く。click などユーザー操作の中で呼ぶ。
 * 戻り値の WindowProxy で close() できる(ポップアップがブロックされたら null)
 */
export function openScreen(route: string, options: OpenScreenOptions = {}): Window | null {
  const url = new URL(route, window.location.href).href;
  const features = options.slot === undefined ? "popup" : windowFeatures(slotRect(options.slot, currentScreenArea()));
  return window.open(url, options.name ?? "_blank", features);
}
