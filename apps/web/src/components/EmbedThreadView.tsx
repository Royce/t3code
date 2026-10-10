import type { ScopedThreadRef } from "@t3tools/contracts";

import ChatView from "./ChatView";
import { resolveEmbedThreadViewState } from "../embedRoute";
import { useThreadShell } from "../state/entities";
import { useEnvironmentQuery } from "../state/query";
import { environmentShell } from "../state/shell";
import { resolveThreadRouteRenderState } from "../threadRoutes";

/**
 * The `/embed/$environmentId/$threadId` surface: one server thread's
 * timeline and composer with no app chrome. It never navigates, so an
 * iframe embedding it stays on this thread.
 */
export function EmbedThreadView({ threadRef }: { threadRef: ScopedThreadRef }) {
  const shell = useEnvironmentQuery(environmentShell.stateAtom(threadRef.environmentId));
  const bootstrapComplete = shell.data?.snapshot._tag === "Some";
  const threadShell = useThreadShell(threadRef);
  const viewState = resolveEmbedThreadViewState({
    renderState: resolveThreadRouteRenderState({
      bootstrapComplete,
      serverThreadExists: threadShell !== null,
      serverThreadDeleted: threadShell?.deletedAt != null,
      draftThreadExists: false,
    }),
    threadShellExists: threadShell !== null,
  });

  return (
    <main className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden overscroll-y-none bg-background">
      {viewState === "chat" ? (
        <ChatView
          environmentId={threadRef.environmentId}
          threadId={threadRef.threadId}
          routeKind="server"
          chrome="minimal"
          reserveTitleBarControlInset={false}
        />
      ) : viewState === "missing" ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="flex max-w-sm flex-col gap-2 text-center">
            <h1 className="text-lg font-medium text-foreground">Thread not found</h1>
            <p className="text-sm text-muted-foreground">
              This thread doesn't exist on this server or has been deleted.
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
