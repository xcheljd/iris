import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { stub } = vi.hoisted(() => ({ stub: (name: string) => () => name }));
vi.mock("@/components/topbar", () => ({ Topbar: () => null }));
vi.mock("@/app/(app)/settings/profile-tab", () => ({ ProfileTab: stub("profile") }));
vi.mock("@/app/(app)/settings/employees-tab", () => ({ EmployeesTab: stub("employees") }));
vi.mock("@/app/(app)/settings/tags-tab", () => ({ SettingsTagsTab: stub("tags") }));
vi.mock("@/app/(app)/settings/deleted-tab", () => ({ DeletedTab: stub("deleted") }));
vi.mock("@/app/(app)/settings/backup-tab", () => ({ BackupTab: stub("backup") }));
vi.mock("@/components/onboarding/onboarding-settings-tab", () => ({ OnboardingSettingsTab: stub("onboarding") }));

import { SettingsContent } from "@/app/(app)/settings/settings-content";

const renderAs = (role: string) =>
  render(<SettingsContent employees={[]} tags={[]} brands={[]} deletedClients={[]} currentUserRole={role} currentUserId="u1" onboardingState={null} />);

describe("Settings Backup tab", () => {
  it("is shown to managers", () => {
    renderAs("manager");
    expect(screen.getByRole("tab", { name: /Backup/ })).toBeInTheDocument();
  });

  it("is hidden from associates", () => {
    renderAs("associate");
    expect(screen.queryByRole("tab", { name: /Backup/ })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Tags/ })).toBeInTheDocument();
  });
});

describe("Settings Templates tab", () => {
  it("is gone (templates were retired)", () => {
    renderAs("manager");
    expect(screen.queryByRole("tab", { name: /Templates/ })).not.toBeInTheDocument();
  });
});
