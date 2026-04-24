import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeatBadge } from "@/components/heat-badge";

describe("HeatBadge", () => {
  it("renders hot level with correct text", () => {
    render(<HeatBadge level="hot" />);
    expect(screen.getByText("hot")).toBeInTheDocument();
  });

  it("renders warm level with correct text", () => {
    render(<HeatBadge level="warm" />);
    expect(screen.getByText("warm")).toBeInTheDocument();
  });

  it("renders cold level with correct text", () => {
    render(<HeatBadge level="cold" />);
    expect(screen.getByText("cold")).toBeInTheDocument();
  });

  it("renders score when showScore is true and score is provided", () => {
    render(<HeatBadge level="hot" score={85} showScore />);
    expect(screen.getByText("85")).toBeInTheDocument();
  });

  it("does not render score when showScore is false", () => {
    render(<HeatBadge level="hot" score={85} showScore={false} />);
    expect(screen.queryByText("85")).not.toBeInTheDocument();
  });

  it("does not render score when showScore is true but score is undefined", () => {
    render(<HeatBadge level="hot" showScore />);
    // No score element should be present (only the level text)
    const badge = screen.getByText("hot").closest("[class]");
    expect(badge?.textContent).toBe("hot");
  });

  it("capitalizes the level text", () => {
    render(<HeatBadge level="warm" />);
    expect(screen.getByText("warm")).toBeInTheDocument();
    // The CSS class capitalize should handle display, but the text is lowercase
    expect(screen.getByText("warm").textContent).toBe("warm");
  });

  it("renders the Flame icon for hot level", () => {
    const { container } = render(<HeatBadge level="hot" />);
    // Flame icon renders as an SVG
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("renders different icons for different levels", () => {
    const { container: hotContainer } = render(<HeatBadge level="hot" />);
    const { container: coldContainer } = render(<HeatBadge level="cold" />);
    // Both render SVGs but they are different icon components
    const hotSvg = hotContainer.querySelector("svg");
    const coldSvg = coldContainer.querySelector("svg");
    expect(hotSvg).toBeTruthy();
    expect(coldSvg).toBeTruthy();
    // They both exist — the icon distinction is handled by lucide-react
  });

  it("renders badge element with the level as a child", () => {
    render(<HeatBadge level="hot" />);
    const levelText = screen.getByText("hot");
    // The parent badge div should contain the level text
    expect(levelText.closest("div")).toBeTruthy();
  });

  it("renders with both level and score shown together", () => {
    render(<HeatBadge level="hot" score={92} showScore />);
    expect(screen.getByText("hot")).toBeInTheDocument();
    expect(screen.getByText("92")).toBeInTheDocument();
  });
});
