/**
 * The auth middleware's matcher decides which paths reach the login gate.
 * `unstable_doesMiddlewareMatch` evaluates `config.matcher` with Next's own
 * matching, so this pins the real routing without running the middleware.
 */
import { describe, it, expect } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "@/middleware";

const gated = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("middleware matcher", () => {
  // Regression (B20): only favicon.ico was excluded, so the other app icons
  // redirected signed-out visitors to /login and the login tab icon broke.
  it.each(["/favicon.ico", "/favicon.svg", "/icon.svg", "/icon.png"])("lets %s through without auth", (url) => {
    expect(gated(url)).toBe(false);
  });

  it.each(["/login", "/api/auth/session", "/_next/static/chunk.js"])("still skips %s", (url) => {
    expect(gated(url)).toBe(false);
  });

  it.each(["/", "/clients", "/api/clients", "/icons", "/icon.svg/secret", "/favicon.svgx"])("still gates %s", (url) => {
    expect(gated(url)).toBe(true);
  });
});
