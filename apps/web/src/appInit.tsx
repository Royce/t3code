import {
  scopedProjectKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import type {
  EnvironmentId,
  ProjectId,
  ScopedProjectRef,
  ScopedThreadRef,
} from "@t3tools/contracts";
import type { ClientSettings } from "@t3tools/contracts/settings";
import { createBrowserHistory, createHashHistory } from "@tanstack/react-router";
import { Atom } from "effect/reactivity";
import * as Schema from "effect/Schema";

import { applyAppearanceContrast } from "./appearanceContrast";
import { applyAppearanceFontVariables, TYPOGRAPHY_ADVANCED_STORAGE_KEY } from "./appearanceFonts";
import { startElectronBrowserHost } from "./browser/ElectronBrowserHost";
import { startBrowserProfileReporting } from "./browser/BrowserProfileReporter";
import { startPreviewTitleRecording } from "./browserHistoryStore";
import { retainThreadOverlaysForThread } from "./components/chat/threadOverlayRetention";
import { startBackgroundThreadAnnouncements } from "./components/BackgroundThreadAnnouncer";
import { startSshPasswordPromptQueue } from "./components/desktop/SshPasswordPromptDialog";
import { startHostFreezeToasts } from "./components/HostFreezeToastCoordinator";
import { startKeybindingsUpdateToasts } from "./components/KeybindingsUpdateToast";
import { startLegacyThreadMigrationToast } from "./components/LegacyThreadMigrationToast";
import { startPermissionUpdateNotices } from "./components/PermissionUpdateNotice";
import { startAgentOpenedPreviews } from "./components/preview/agentOpenedPreviews";
import { startMainAppLocationTracking } from "./components/sidebar/mainAppLocation";
import { startDesktopUpdateLaunchNotice } from "./components/sidebar/updateEverythingRun";
import { startSlowRpcRequestToasts } from "./components/SlowRpcRequestToastCoordinator";
import { startThreadNotifications } from "./components/ThreadNotificationCoordinator";
import { startGuideRunNotifications } from "./components/pullRequest/guide/PullRequestGuideRunCoordinator";
import { APP_BASE_NAME, APP_DISPLAY_NAME, APP_STAGE_LABEL } from "./branding";
import { formatDocumentTitle, resolveServerBackedAppDisplayName } from "./branding.logic";
import { isElectron } from "./env";
import {
  subscribeComposerDraftModelReconciliation,
  subscribeDraftThreadPromotion,
  useComposerDraftStore,
} from "./composerDraftStore";
import { startDefaultThemeAdoption } from "./hooks/useDefaultTheme";
import { startEnvironmentThemeRepaint } from "./hooks/useEnvironmentTheme";
import { readLocalStorageValue, subscribeLocalStorageKey } from "./hooks/useLocalStorage";
import { startHostEnvironmentLookup } from "./state/primaryEnvironment";
import {
  getClientSettings,
  startModelPreferencesMigration,
  subscribeClientSettings,
} from "./hooks/useSettings";
import { syncBrowserChromeTheme } from "./hooks/useTheme";
import { startThreadVisitedMigration } from "./hooks/useThreadVisitedMigration";
import { installDesktopPasteAsText } from "./lib/desktopPasteAsText";
import {
  syncDocumentElectronPlatformClasses,
  syncDocumentWindowControlsOverlayClass,
} from "./lib/windowControlsOverlay";
import { startProviderAuthDelivery } from "./providerAuthDelivery";
import {
  PULL_REQUESTS_PANEL_REF,
  selectThreadRightPanelState,
  useRightPanelStore,
  type PullRequestSurface,
} from "./rightPanelStore";
import { getRouter, type AppRouter } from "./router";
import { appAtomRegistry } from "./rpc/atomRegistry";
import { environmentProjects } from "./state/projects";
import { primaryServerConfigAtom } from "./state/server";
import { environmentShell } from "./state/shell";
import { installChatRouteCommands } from "./shortcuts/chatRouteCommands";
import { startWorkspaceFocus } from "./lib/workspaceFocus";
import { installCommandPaletteCommands } from "./shortcuts/commandPaletteCommands";
import { registerOpenFavoriteEditorCommand } from "./components/chat/OpenInPickerShortcut";
import { environmentThreadShells, threadEnvironment } from "./state/threads";
import { resolveThreadRouteTarget } from "./threadRoutes";

/** Writes appearance settings onto the document, touching only the groups that changed. */
function startClientAppearance(): void {
  const root = document.documentElement;
  let applied: ClientSettings | null = null;
  let appliedSeparateFonts: boolean | null = null;
  const apply = () => {
    const settings = getClientSettings();
    const previous = applied;
    applied = settings;
    const separateFonts = readLocalStorageValue(
      TYPOGRAPHY_ADVANCED_STORAGE_KEY,
      false,
      Schema.Boolean,
    );
    const previousSeparateFonts = appliedSeparateFonts;
    appliedSeparateFonts = separateFonts;
    if (previous?.diffColorScheme !== settings.diffColorScheme) {
      root.dataset.diffColorScheme = settings.diffColorScheme;
    }
    if (previous?.chatWidth !== settings.chatWidth) {
      root.dataset.chatWidth = settings.chatWidth;
    }
    if (previous?.appearanceContrast !== settings.appearanceContrast) {
      applyAppearanceContrast(root, settings.appearanceContrast);
    }
    if (previous?.glassOpacity !== settings.glassOpacity) {
      root.style.setProperty("--glass-opacity", `${settings.glassOpacity}%`);
      if (settings.glassOpacity === 100) {
        root.style.setProperty("--glass-blur", "0px");
      } else {
        root.style.removeProperty("--glass-blur");
      }
    }
    if (
      previous?.fontFamilySans !== settings.fontFamilySans ||
      previous.fontFamilyCode !== settings.fontFamilyCode ||
      previous.fontFamilyComposer !== settings.fontFamilyComposer ||
      previous.fontSizeInterface !== settings.fontSizeInterface ||
      previous.fontSizePrompt !== settings.fontSizePrompt ||
      previous.fontSizeCode !== settings.fontSizeCode ||
      previous.fontSmoothing !== settings.fontSmoothing ||
      previousSeparateFonts !== separateFonts
    ) {
      applyAppearanceFontVariables(root, {
        sans: settings.fontFamilySans,
        code: settings.fontFamilyCode,
        composer: settings.fontFamilyComposer,
        sizeInterface: settings.fontSizeInterface,
        sizePrompt: settings.fontSizePrompt,
        sizeCode: settings.fontSizeCode,
        smoothing: settings.fontSmoothing,
        separate: separateFonts,
      });
    }
  };
  subscribeClientSettings(apply);
  subscribeLocalStorageKey(TYPOGRAPHY_ADVANCED_STORAGE_KEY, apply);
  apply();
}

interface DocumentTitleTarget {
  readonly threadRef: ScopedThreadRef | null;
  readonly draftProjectRef: ScopedProjectRef | null;
  readonly pullRequest: PullRequestSurface | null;
}

const documentTitleTargetAtom = Atom.make<DocumentTitleTarget>({
  threadRef: null,
  draftProjectRef: null,
  pullRequest: null,
}).pipe(Atom.keepAlive, Atom.withLabel("web-document-title-target"));

/** "project / thread" or "project / PR #n", so the desktop window names the work; else the app name. */
const documentTitleAtom = Atom.make((get) => {
  const appDisplayName = resolveServerBackedAppDisplayName({
    baseName: APP_BASE_NAME,
    fallbackDisplayName: APP_DISPLAY_NAME,
    fallbackStageLabel: APP_STAGE_LABEL,
    primaryServerVersion: get(primaryServerConfigAtom)?.environment.serverVersion ?? null,
  });
  const { threadRef, draftProjectRef, pullRequest } = get(documentTitleTargetAtom);
  if (pullRequest) {
    const project = pullRequest.environmentId
      ? get(
          environmentProjects.projectAtom(
            scopeProjectRef(
              pullRequest.environmentId as EnvironmentId,
              pullRequest.projectId as ProjectId,
            ),
          ),
        )
      : null;
    return formatDocumentTitle({
      appDisplayName,
      projectTitle: project?.title ?? pullRequest.repository,
      threadTitle: `PR #${pullRequest.number}`,
    });
  }
  const threadShell = threadRef
    ? get(environmentThreadShells.quietThreadShellAtom(threadRef))
    : null;
  const projectRef = threadShell
    ? scopeProjectRef(threadShell.environmentId, threadShell.projectId)
    : draftProjectRef;
  const project = projectRef ? get(environmentProjects.projectAtom(projectRef)) : null;
  return formatDocumentTitle({
    appDisplayName,
    projectTitle: project?.title ?? null,
    threadTitle: threadShell?.title ?? (draftProjectRef ? "New thread" : null),
  });
}).pipe(Atom.withLabel("web-document-title"));

function startDocumentTitle(router: AppRouter): void {
  let currentKey = "";
  const syncTarget = () => {
    const target = resolveThreadRouteTarget(router.state.matches.at(-1)?.params ?? {});
    const draftSession =
      target?.kind === "draft"
        ? useComposerDraftStore.getState().getDraftSession(target.draftId)
        : null;
    const threadRef =
      target?.kind === "server" ? target.threadRef : (draftSession?.promotedTo ?? null);
    const draftProjectRef = draftSession
      ? scopeProjectRef(draftSession.environmentId, draftSession.projectId)
      : null;
    const panel =
      router.state.matches.at(-1)?.routeId === "/_chat/pull-requests"
        ? selectThreadRightPanelState(
            useRightPanelStore.getState().byThreadKey,
            PULL_REQUESTS_PANEL_REF,
          )
        : null;
    const surface = panel?.isOpen
      ? panel.surfaces.find((candidate) => candidate.id === panel.activeSurfaceId)
      : undefined;
    const pullRequest = surface?.kind === "pull-request" ? surface : null;
    const key = `${threadRef ? scopedThreadKey(threadRef) : ""}|${draftProjectRef ? scopedProjectKey(draftProjectRef) : ""}|${pullRequest?.id ?? ""}:${pullRequest?.environmentId ?? ""}`;
    if (key === currentKey) return;
    currentKey = key;
    appAtomRegistry.set(documentTitleTargetAtom, { threadRef, draftProjectRef, pullRequest });
  };
  router.subscribe("onResolved", syncTarget);
  useComposerDraftStore.subscribe(syncTarget);
  useRightPanelStore.subscribe(syncTarget);
  syncTarget();

  appAtomRegistry.subscribe(
    documentTitleAtom,
    (title) => {
      document.title = title;
    },
    { immediate: true },
  );
}

/**
 * Each route paints its own surface, which the browser chrome samples once it is on screen.
 * onRendered only fires for a new href; onResolved also covers `router.invalidate()`, which
 * can swap the root between the bare outlet and the shell at the same address.
 */
function startBrowserChromeThemeSync(router: AppRouter): void {
  const resync = () => window.requestAnimationFrame(syncBrowserChromeTheme);
  router.subscribe("onRendered", resync);
  router.subscribe("onResolved", resync);
}

/** Chat overlays belong to the thread they were opened in, so leaving its route drops them. */
function startThreadOverlayRetention(router: AppRouter): void {
  router.subscribe("onResolved", () => {
    const target = resolveThreadRouteTarget(router.state.matches.at(-1)?.params ?? {});
    const draftSession =
      target?.kind === "draft"
        ? useComposerDraftStore.getState().getDraftSession(target.draftId)
        : null;
    const threadRef =
      target?.kind === "server"
        ? target.threadRef
        : draftSession
          ? scopeThreadRef(draftSession.environmentId, draftSession.threadId)
          : null;
    retainThreadOverlaysForThread(threadRef ? scopedThreadKey(threadRef) : null);
  });
}

/**
 * Starts every app-lifetime service once, before the first render, and returns the router.
 * They run for the life of the page, so their disposers are dropped here.
 */
export function startAppServices(): AppRouter {
  // Ahead of the history: the provider auth code must leave the address before anything reads it.
  startProviderAuthDelivery();

  // Electron loads the app from a file-backed shell, so hash history avoids path resolution issues.
  const router = getRouter(isElectron ? createHashHistory() : createBrowserHistory());

  if (isElectron) {
    syncDocumentElectronPlatformClasses(navigator.platform);
    syncDocumentWindowControlsOverlayClass();
  }

  installDesktopPasteAsText(window.desktopBridge, window);

  startClientAppearance();
  startDocumentTitle(router);
  startHostEnvironmentLookup();
  startEnvironmentThemeRepaint();
  startBrowserChromeThemeSync(router);
  startDefaultThemeAdoption();
  startModelPreferencesMigration();
  startAgentOpenedPreviews();
  if (isElectron) startElectronBrowserHost();
  startPreviewTitleRecording();
  startBrowserProfileReporting();
  installChatRouteCommands(router);
  installCommandPaletteCommands(router);
  registerOpenFavoriteEditorCommand();
  startThreadOverlayRetention(router);
  // Drafts promote as their server threads arrive, wherever the user is.
  subscribeDraftThreadPromotion({
    registry: appAtomRegistry,
    threadShellAtom: environmentThreadShells.quietThreadShellAtom,
    threadRefsAtom: environmentThreadShells.threadRefsAtom,
  });
  subscribeComposerDraftModelReconciliation({
    registry: appAtomRegistry,
    threadShellAtom: environmentThreadShells.threadShellAtom,
    threadRefsAtom: environmentThreadShells.threadRefsAtom,
    shellStateAtom: environmentShell.stateAtom,
    pendingThreadIdsAtom: threadEnvironment.pendingThreadIdsAtom,
  });
  startMainAppLocationTracking(router);
  startWorkspaceFocus(router);
  startBackgroundThreadAnnouncements(appAtomRegistry, router);
  startThreadVisitedMigration(appAtomRegistry);
  startSshPasswordPromptQueue();

  startKeybindingsUpdateToasts();
  startSlowRpcRequestToasts();
  startHostFreezeToasts();
  startLegacyThreadMigrationToast();
  startPermissionUpdateNotices(router);
  startThreadNotifications(appAtomRegistry, router);
  startGuideRunNotifications(appAtomRegistry, router);
  if (isElectron) startDesktopUpdateLaunchNotice();

  return router;
}
