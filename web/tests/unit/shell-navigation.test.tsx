import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkbenchShell } from "@/components/shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
}));

function matchMedia(matches: boolean): MediaQueryList {
  return {
    matches,
    media: "",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => { items.delete(key); },
    setItem: (key, value) => { items.set(key, String(value)); },
  };
}

describe("mobile shell navigation", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => matchMedia(false)));
    vi.stubGlobal("localStorage", memoryStorage());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps the Explorer destination and starts its mobile detail menu collapsed", () => {
    render(
      <WorkbenchShell
        domains={[{ code: "education_learning", name: "교육·학습", unit: "person" }]}
        savedSegments={[{ id: "segment-1", name: "교육 수요 세그먼트", status: "saved" }]}
        researchJobs={[]}
        dataVersion="v1"
        dataAsOf="2026-08"
      >
        <p>본문</p>
      </WorkbenchShell>,
    );

    const primaryNavigation = screen.getByRole("navigation", { name: "주요 메뉴" });
    const explorerLink = primaryNavigation.querySelector<HTMLAnchorElement>('.navigation-item > a[aria-label="세그먼트 탐색"]');
    expect(explorerLink).toHaveAttribute("href", "/explore");

    fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
    const toggle = screen.getByRole("button", { name: "세그먼트 탐색 세부 메뉴 열기" });
    const panelId = toggle.getAttribute("aria-controls");
    const panel = panelId ? document.getElementById(panelId) : null;

    expect(panelId).toBe("mobile-explorer-flyout");
    expect(panel).not.toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");
    expect(panel?.querySelector('a[href="/explore/education_learning"]')).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName("세그먼트 탐색 세부 메뉴 닫기");
    expect(panel).not.toHaveAttribute("aria-hidden");
    expect(panel).not.toHaveAttribute("inert");

    const closeButton = primaryNavigation.closest("aside")?.querySelector<HTMLButtonElement>(".mobile-nav-close");
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton!);
    fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
    expect(screen.getByRole("button", { name: "세그먼트 탐색 세부 메뉴 열기" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("aria-hidden", "true");
  });
});
