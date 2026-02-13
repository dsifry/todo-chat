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

  it("applies min-h-0 to both panels for independent scrolling", () => {
    render(<App />);
    const todoPanel = screen.getByRole("region", { name: /todo list/i });
    const chatPanel = screen.getByRole("region", { name: /chat/i });
    expect(todoPanel).toHaveClass("min-h-0");
    expect(chatPanel).toHaveClass("min-h-0");
  });

  it("renders Clear button in the chat section header", () => {
    render(<App />);
    const chatSection = screen.getByRole("region", { name: /chat/i });
    const clearButton = chatSection.querySelector("button");
    expect(clearButton).toBeInTheDocument();
    expect(clearButton).toHaveTextContent("Clear");
  });

  it("renders todo loading state and chat empty state", () => {
    render(<App />);
    expect(screen.getByText("Loading todos...")).toBeInTheDocument();
    expect(
      screen.getByText("Start a conversation to get help with your todos"),
    ).toBeInTheDocument();
  });
});
