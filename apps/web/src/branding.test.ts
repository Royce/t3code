import { describe, expect, it } from "vite-plus/test";
import { formatDocumentTitle } from "./branding.logic";

describe("formatDocumentTitle", () => {
  it("names the open thread as project / thread", () => {
    expect(
      formatDocumentTitle({
        appDisplayName: "T3 Code",
        projectTitle: "t3code",
        threadTitle: "Window title shows thread",
      }),
    ).toBe("t3code / Window title shows thread");
  });

  it("falls back to the app name until both project and thread resolve", () => {
    expect(
      formatDocumentTitle({ appDisplayName: "T3 Code", projectTitle: null, threadTitle: null }),
    ).toBe("T3 Code");
    expect(
      formatDocumentTitle({ appDisplayName: "T3 Code", projectTitle: "t3code", threadTitle: null }),
    ).toBe("T3 Code");
  });
});
