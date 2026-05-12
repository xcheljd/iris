"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Error boundary that catches rendering errors in the tour components.
 * On error it dismisses the tour so the app continues to function normally.
 */
export class TourErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[TourErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      // Render nothing — the app continues normally
      return null;
    }
    return this.props.children;
  }
}
