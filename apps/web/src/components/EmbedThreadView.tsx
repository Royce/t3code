import type { ScopedThreadRef } from "@t3tools/contracts";

import ChatView from "./ChatView";
import { resolveEmbedThreadViewState } from "../embedRoute";
import {
  resolveThreadDetailRef,
  useThreadDetail,
  useThreadShell,
  useThreadStatus,
} from "../state/entities";
import { useEnvironmentQuery } from "../state/query";
import { environmentShell } from "../state/shell";
import { resolveThreadRouteRenderState } from "../threadRoutes";
import { resolveThreadSyncPhase } from "../threadSync";

/**
 * The `/embed/$environmentId/$threadId` surface: one server thread's
 * timeline and composer with no app chrome. It never navigates, so an
 * iframe embedding it stays on this thread.
 */
export function EmbedThreadView({ threadRef }: { threadRef: ScopedThreadRef }) {
  const shell = useEnvironmentQuery(environmentShell.stateAtom(threadRef.environmentId));
  const bootstrapComplete = shell.data?.snapshot._tag === "Some";
  const threadShell = useThreadShell(threadRef);
  // Once bootstrap shows no shell the thread is missing; dropping the detail
  // subscription stops it retrying the 404. A shell arriving later resubscribes.
  const detailRef = resolveThreadDetailRef(threadRef, {
    shellExists: threadShell !== null,
    waitForShell: bootstrapComplete,
  });
  const threadDetail = useThreadDetail(detailRef);
  const threadStatus = useThreadStatus(detailRef);
  const viewState = resolveEmbedThreadViewState({
    renderState: resolveThreadRouteRenderState({
      bootstrapComplete,
      serverThreadShellExists: threadShell !== null,
      serverThreadDetailExists: threadDetail !== null,
      serverThreadDetailDeleted: threadStatus === "deleted",
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
          threadSyncPhase={resolveThreadSyncPhase({
            detailExists: threadDetail !== null,
            shellExists: threadShell !== null,
            status: threadStatus,
          })}
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
