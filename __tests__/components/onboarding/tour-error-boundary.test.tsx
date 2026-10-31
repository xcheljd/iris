import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { TourErrorBoundary } from "@/components/onboarding/tour-error-boundary";

// A component that throws on render
function ThrowingComponent(): React.ReactElement {
  throw new Error("Test error in tour component");
}

function GoodComponent(): React.ReactElement {
  return <div data-testid="good">Good component</div>;
}

describe("TourErrorBoundary", () => {
  // Suppress console.error for expected error boundary errors
  const originalConsoleError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalConsoleError;
  });

  it("renders children when no error", () => {
    render(
      <TourErrorBoundary>
        <GoodComponent />
      </TourErrorBoundary>,
    );
    expect(screen.getByTestId("good")).toBeInTheDocument();
  });

  it("renders nothing when child throws", () => {
    const { container } = render(
      <TourErrorBoundary>
        <ThrowingComponent />
      </TourErrorBoundary>,
    );
    // Error boundary catches and renders null
    expect(container.innerHTML).toBe("");
  });

  it("catches error and logs it", () => {
    render(
      <TourErrorBoundary>
        <ThrowingComponent />
      </TourErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalled();
  });
});
