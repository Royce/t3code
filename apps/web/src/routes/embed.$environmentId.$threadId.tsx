import { createFileRoute, useRouter } from "@tanstack/react-router";

import { PairingRouteSurface } from "../components/auth/PairingRouteSurface";
import { EmbedThreadView } from "../components/EmbedThreadView";
import { resolveThreadRouteRef } from "../threadRoutes";

function EmbedThreadRouteView() {
  const router = useRouter();
  const { authGateState } = Route.useRouteContext();
  const threadRef = Route.useParams({ select: (params) => resolveThreadRouteRef(params) });

  // Unpaired frames pair in place: redirecting to /pair would land on `/`
  // afterwards. `#token=` pairing already ran in the root beforeLoad, so this
  // only shows when the token was absent or rejected.
  if (authGateState.status === "requires-auth") {
    // Re-running the root beforeLoad picks up the new session and renders the
    // thread on this same URL.
    return (
      <PairingRouteSurface
        auth={authGateState.auth}
        onAuthenticated={() => {
          void router.invalidate();
        }}
        {...(authGateState.errorMessage ? { initialErrorMessage: authGateState.errorMessage } : {})}
      />
    );
  }
  return threadRef ? <EmbedThreadView threadRef={threadRef} /> : null;
}

export const Route = createFileRoute("/embed/$environmentId/$threadId")({
  component: EmbedThreadRouteView,
});
