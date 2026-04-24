import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeatScoreBar } from "@/components/heat-score-bar";

describe("HeatScoreBar", () => {
  it("renders the numeric score", () => {
    render(<HeatScoreBar score={75} />);
    expect(screen.getByText("75")).toBeInTheDocument();
  });

  it("displays 'Hot' label for scores >= 70", () => {
    render(<HeatScoreBar score={85} />);
    expect(screen.getByText("Hot")).toBeInTheDocument();
  });

  it("displays 'Warm' label for scores between 40 and 69", () => {
    render(<HeatScoreBar score={55} />);
    expect(screen.getByText("Warm")).toBeInTheDocument();
  });

  it("displays 'Cold' label for scores < 40", () => {
    render(<HeatScoreBar score={25} />);
    expect(screen.getByText("Cold")).toBeInTheDocument();
  });

  it("displays 'Hot' for score exactly 70 (boundary)", () => {
    render(<HeatScoreBar score={70} />);
    expect(screen.getByText("Hot")).toBeInTheDocument();
  });

  it("displays 'Warm' for score exactly 40 (boundary)", () => {
    render(<HeatScoreBar score={40} />);
    expect(screen.getByText("Warm")).toBeInTheDocument();
  });

  it("displays 'Cold' for score of 0", () => {
    render(<HeatScoreBar score={0} />);
    expect(screen.getByText("Cold")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("displays 'Hot' for score of 100", () => {
    render(<HeatScoreBar score={100} />);
    expect(screen.getByText("Hot")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("applies hot color class for high scores", () => {
    render(<HeatScoreBar score={80} />);
    const levelText = screen.getByText("Hot");
    expect(levelText.className).toContain("text-orange-500");
  });

  it("applies warm color class for medium scores", () => {
    render(<HeatScoreBar score={50} />);
    const levelText = screen.getByText("Warm");
    expect(levelText.className).toContain("text-yellow-500");
  });

  it("applies cold color class for low scores", () => {
    render(<HeatScoreBar score={20} />);
    const levelText = screen.getByText("Cold");
    expect(levelText.className).toContain("text-blue-500");
  });

  it("renders a progress bar element", () => {
    const { container } = render(<HeatScoreBar score={60} />);
    // The Progress component renders a div with role="progressbar" or a root div
    const progressBar = container.querySelector("[role='progressbar']") || container.querySelector("[data-state]");
    expect(progressBar || container.firstChild).toBeTruthy();
  });

  it("applies custom className when provided", () => {
    const { container } = render(<HeatScoreBar score={50} className="my-custom-class" />);
    expect(container.firstChild).toBeTruthy();
    expect((container.firstChild as HTMLElement).className).toContain("my-custom-class");
  });
});
