import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientProvider, useClient, type FullClient } from "@/components/client-provider";

const mockClient: FullClient = {
  id: "client-1",
  firstName: "John",
  lastName: "Doe",
  phone: "555-1234",
  email: "john@example.com",
  employeeId: "emp-1",
  dateAdded: "2026-01-01",
  productsOfInterest: [{ model: "MODEL-X", collection: "Collection Y" }],
  notes: null,
  onEmailList: true,
  status: "active",
  source: "Walk-in",
  birthday: "1990-05-15",
  anniversary: null,
  tags: ["VIP", "repeat"],
  heatScore: 75,
  heatLevel: "hot",
  lastOutreachAt: "2026-01-10",
  lastPurchaseAt: "2026-01-05",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-10T00:00:00Z",
  outreach: [],
  timeline: [],
  matches: [],
  allTags: [],
  followUps: [],
};

function ConsumerDisplay() {
  const client = useClient();
  return (
    <div>
      <span data-testid="client-name">{client?.firstName} {client?.lastName}</span>
      <span data-testid="client-id">{client?.id}</span>
    </div>
  );
}

describe("ClientProvider", () => {
  it("provides client data to children via context", () => {
    render(
      <ClientProvider client={mockClient}>
        <ConsumerDisplay />
      </ClientProvider>
    );
    expect(screen.getByTestId("client-name")).toHaveTextContent("John Doe");
    expect(screen.getByTestId("client-id")).toHaveTextContent("client-1");
  });

  it("useClient returns null when used outside of ClientProvider", () => {
    function OutsideConsumer() {
      const client = useClient();
      return <span data-testid="outside-client">{client === null ? "null" : "has-value"}</span>;
    }
    render(<OutsideConsumer />);
    expect(screen.getByTestId("outside-client")).toHaveTextContent("null");
  });

  it("provides the full client object with all fields", () => {
    function FullConsumer() {
      const client = useClient();
      return (
        <div>
          <span data-testid="email">{client?.email}</span>
          <span data-testid="status">{client?.status}</span>
          <span data-testid="heat-score">{client?.heatScore}</span>
          <span data-testid="heat-level">{client?.heatLevel}</span>
          <span data-testid="source">{client?.source}</span>
        </div>
      );
    }
    render(
      <ClientProvider client={mockClient}>
        <FullConsumer />
      </ClientProvider>
    );
    expect(screen.getByTestId("email")).toHaveTextContent("john@example.com");
    expect(screen.getByTestId("status")).toHaveTextContent("active");
    expect(screen.getByTestId("heat-score")).toHaveTextContent("75");
    expect(screen.getByTestId("heat-level")).toHaveTextContent("hot");
    expect(screen.getByTestId("source")).toHaveTextContent("Walk-in");
  });

  it("renders children correctly", () => {
    render(
      <ClientProvider client={mockClient}>
        <div data-testid="child">Hello from child</div>
      </ClientProvider>
    );
    expect(screen.getByTestId("child")).toHaveTextContent("Hello from child");
  });
});
