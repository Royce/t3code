import type { ThreadRouteRenderState } from "./threadRoutes";

/**
 * Paths under `/embed` render a single thread without app chrome so other
 * local tools can iframe it. The root shell skips the sidebar and command
 * palette for them.
 */
export function isEmbedPathname(pathname: string): boolean {
  return pathname === "/embed" || pathname.startsWith("/embed/");
}

export type EmbedThreadViewState = "loading" | "chat" | "missing";

/**
 * Like the full thread route, but a missing thread stays on screen as an
 * inline message instead of redirecting the frame into the app.
 */
export function resolveEmbedThreadViewState(input: {
  renderState: ThreadRouteRenderState;
  threadShellExists: boolean;
}): EmbedThreadViewState {
  if (input.renderState === "ready") return "chat";
  if (input.renderState === "missing") return "missing";
  return input.threadShellExists ? "chat" : "loading";
}
