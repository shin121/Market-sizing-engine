import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GlobalSearch, normalizeGlobalSearchResults } from "@/components/shell";

const globalStyles = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("global search suggestions", () => {
  it("exposes a named GET search form with a semantic submit action", () => {
    render(<GlobalSearch />);

    const form = screen.getByRole("search", { name: "전체 데이터 검색" });
    const input = within(form).getByRole("combobox", { name: "전체 데이터 검색" });
    const submit = within(form).getByRole("button", { name: "검색" });

    expect(form).toHaveAttribute("action", "/search");
    expect(form).toHaveAttribute("method", "get");
    expect(input).toHaveAttribute("name", "q");
    expect(input).toHaveAttribute("placeholder", "찾고 싶은 시장, 세그먼트 또는 조건 검색");
    expect(submit).toHaveAttribute("type", "submit");
    expect(submit).not.toHaveAttribute("hidden");
    expect(submit).not.toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the submit action visible in the narrow mobile layout", () => {
    expect(globalStyles).not.toMatch(/\.global-search\s*>\s*button\s*\{[^}]*display:\s*none\s*;/u);
    expect(globalStyles).toMatch(/@media \(max-width:\s*560px\)[\s\S]*?\.global-search\s*>\s*button\s*\{[^}]*display:\s*block\s*;/u);
  });

  it("keeps only complete results with safe local drilldown routes", () => {
    expect(normalizeGlobalSearchResults({
      results: [
        {
          objectType: "domain",
          objectId: "domain-1",
          title: "교육·학습",
          summary: "교육 시장",
          entityUnit: "person",
          routePath: "/explore/education_learning",
        },
        {
          objectType: "saved_segment",
          objectId: "segment-1",
          title: "저장 세그먼트",
          routePath: "//example.test/unsafe",
        },
        { objectType: "archetype", objectId: "ARC-01-001", title: "경로 없음" },
      ],
    })).toEqual([{
      objectType: "domain",
      objectId: "domain-1",
      title: "교육·학습",
      summary: "교육 시장",
      entityUnit: "person",
      routePath: "/explore/education_learning",
    }]);
  });

  it("debounces input and renders typed, focusable direct links from the API contract", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      query: "교육",
      results: [
        {
          objectType: "domain",
          objectId: "domain-1",
          title: "교육·학습",
          summary: "교육 시장",
          entityUnit: "person",
          routePath: "/explore/education_learning",
        },
        {
          objectType: "saved_segment",
          objectId: "segment-1",
          title: "교육 수요 세그먼트",
          summary: "저장된 조건",
          entityUnit: "person",
          routePath: "/builder/segment-1",
        },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<><GlobalSearch /><button type="button">외부 버튼</button></>);
    const input = screen.getByRole("combobox", { name: "전체 데이터 검색" });

    fireEvent.focus(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("status")).toHaveTextContent("검색어를 입력하면");

    fireEvent.change(input, { target: { value: "교육" } });
    expect(screen.getByRole("status")).toHaveTextContent("검색 중");
    expect(fetchMock).not.toHaveBeenCalled();

    const domainLink = await screen.findByRole("link", { name: "DOMAIN 교육·학습 바로 열기" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/search?q=%EA%B5%90%EC%9C%A1&limit=8", expect.objectContaining({
      headers: { Accept: "application/json" },
    }));
    expect(domainLink).toHaveAttribute("href", "/explore/education_learning");
    expect(screen.getByRole("link", { name: "SAVED SEGMENT 교육 수요 세그먼트 바로 열기" }))
      .toHaveAttribute("href", "/builder/segment-1");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(domainLink).toHaveFocus();
    fireEvent.keyDown(domainLink, { key: "Escape" });
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    fireEvent.blur(input, { relatedTarget: screen.getByRole("button", { name: "외부 버튼" }) });
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("announces an empty result without replacing missing evidence with a shortcut", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      query: "미등록",
      results: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    render(<GlobalSearch />);
    const input = screen.getByRole("combobox", { name: "전체 데이터 검색" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "미등록" } });

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("일치하는 결과가 없습니다"));
    expect(screen.getByRole("link", { name: "전체 검색 결과 보기" }))
      .toHaveAttribute("href", "/search?q=%EB%AF%B8%EB%93%B1%EB%A1%9D");
  });
});
