import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { App } from "./App";

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

describe("App", () => {
  it("renders the app title", () => {
    render(<App />);
    expect(screen.getByText("Todo Chat")).toBeInTheDocument();
  });

  it("renders the todo list panel", () => {
    render(<App />);
    expect(
      screen.getByRole("region", { name: /todo list/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Todos")).toBeInTheDocument();
  });

  it("renders the chat panel", () => {
    render(<App />);
    expect(screen.getByRole("region", { name: /chat/i })).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  it("uses responsive layout classes for two-panel design", () => {
    render(<App />);
    const main = screen.getByRole("main");
    // Stacks vertically by default (flex-col), side-by-side on sm+ (sm:flex-row)
    expect(main).toHaveClass("flex-col");
    expect(main).toHaveClass("sm:flex-row");
  });

  it("renders todo loading state and chat empty state", () => {
    render(<App />);
    expect(screen.getByText("Loading todos...")).toBeInTheDocument();
    expect(
      screen.getByText("Start a conversation to get help with your todos"),
    ).toBeInTheDocument();
  });
});
