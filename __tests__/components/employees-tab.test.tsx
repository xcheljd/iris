import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { EmployeesTab } from "@/app/(app)/settings/employees-tab";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions", () => ({
  createEmployee: vi.fn(),
  resetEmployeePassword: vi.fn(),
  updateEmployeeRole: vi.fn(),
  toggleEmployeeActive: vi.fn(),
  updateEmployee: vi.fn(),
  deactivateEmployee: vi.fn(),
  reorderEmployee: vi.fn(),
  deleteEmployee: vi.fn(),
}));

// The row actions live behind a Radix dropdown that only mounts its content
// once opened. Render the menu inline so each item's `disabled` state is
// assertable without driving pointer events through jsdom.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

const CURRENT_USER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206"; // Test Manager (__tests__/setup.ts)
const OTHER_MANAGER_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23"; // Test Associate (__tests__/setup.ts)

const employees = [
  {
    id: CURRENT_USER_ID,
    firstName: "Marcus",
    lastName: "Self",
    username: "marcus",
    role: "manager",
    active: true,
    sortOrder: 0,
    activeClientCount: 3,
  },
  {
    id: OTHER_MANAGER_ID,
    firstName: "Jordan",
    lastName: "Other",
    username: "jordan",
    role: "manager",
    active: true,
    sortOrder: 1,
    activeClientCount: 2,
  },
];

function renderTab() {
  render(<EmployeesTab employees={employees} currentUserId={CURRENT_USER_ID} />);
  return {
    selfRow: screen.getByRole("row", { name: /Marcus Self/ }),
    otherRow: screen.getByRole("row", { name: /Jordan Other/ }),
  };
}

describe("EmployeesTab self-row guards", () => {
  it("disables the status switch on the current user's row only", () => {
    const { selfRow, otherRow } = renderTab();
    expect(within(selfRow).getByRole("switch")).toBeDisabled();
    expect(within(otherRow).getByRole("switch")).toBeEnabled();
  });

  it("disables Deactivate on the current user's row only", () => {
    const { selfRow, otherRow } = renderTab();
    expect(within(selfRow).getByRole("button", { name: "Deactivate" })).toBeDisabled();
    expect(within(otherRow).getByRole("button", { name: "Deactivate" })).toBeEnabled();
  });

  it("disables 'Demote to Associate' on the current user's row only", () => {
    const { selfRow, otherRow } = renderTab();
    expect(within(selfRow).getByRole("button", { name: "Demote to Associate" })).toBeDisabled();
    expect(within(otherRow).getByRole("button", { name: "Demote to Associate" })).toBeEnabled();
  });
});
