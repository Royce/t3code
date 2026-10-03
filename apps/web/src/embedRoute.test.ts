import { describe, expect, it } from "vite-plus/test";

import { isEmbedPathname, resolveEmbedThreadViewState } from "./embedRoute";

describe("isEmbedPathname", () => {
  it("matches the embed route and its children", () => {
    expect(isEmbedPathname("/embed")).toBe(true);
    expect(isEmbedPathname("/embed/env-1/thread-1")).toBe(true);
  });

  it("does not match app routes that merely start with the same letters", () => {
    expect(isEmbedPathname("/")).toBe(false);
    expect(isEmbedPathname("/env-1/thread-1")).toBe(false);
    expect(isEmbedPathname("/embedded")).toBe(false);
    expect(isEmbedPathname("/env-1/embed")).toBe(false);
  });
});

describe("resolveEmbedThreadViewState", () => {
  it("shows the chat once the thread detail is ready", () => {
    expect(resolveEmbedThreadViewState({ renderState: "ready", threadShellExists: true })).toBe(
      "chat",
    );
  });

  it("shows the chat while detail loads if the thread shell is known", () => {
    expect(resolveEmbedThreadViewState({ renderState: "loading", threadShellExists: true })).toBe(
      "chat",
    );
  });

  it("waits while nothing about the thread is known yet", () => {
    expect(resolveEmbedThreadViewState({ renderState: "loading", threadShellExists: false })).toBe(
      "loading",
    );
  });

  it("reports unknown or deleted threads inline", () => {
    expect(resolveEmbedThreadViewState({ renderState: "missing", threadShellExists: false })).toBe(
      "missing",
    );
  });
});
