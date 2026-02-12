import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useTodos } from "./useTodos";
import type { Todo } from "../types/index.js";

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 1,
    title: "Test todo",
    completed: false,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function mockFetchSuccess(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  });
}

function mockFetchFailure() {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ error: { code: "INTERNAL_ERROR", message: "fail" } }),
  });
}

describe("useTodos", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ---------------------------------------------------------------------------
  // Initial fetch
  // ---------------------------------------------------------------------------
  it("fetches todos on mount and sets them in state", async () => {
    const todos = [makeTodo({ id: 1 }), makeTodo({ id: 2, title: "Second" })];
    globalThis.fetch = mockFetchSuccess(todos);

    const { result } = renderHook(() => useTodos());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.todos).toEqual(todos);
    expect(result.current.error).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/todos");
  });

  it("sets isLoading to true initially", () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useTodos());
    expect(result.current.isLoading).toBe(true);
  });

  it("sets error when initial fetch fails", async () => {
    globalThis.fetch = mockFetchFailure();

    const { result } = renderHook(() => useTodos());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Failed to fetch todos");
    expect(result.current.todos).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // addTodo
  // ---------------------------------------------------------------------------
  it("addTodo posts and prepends to the list", async () => {
    const existingTodo = makeTodo({ id: 1, title: "Existing" });
    const newTodo = makeTodo({ id: 2, title: "New task" });

    globalThis.fetch = mockFetchSuccess([existingTodo]);
    const { result } = renderHook(() => useTodos());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    globalThis.fetch = mockFetchSuccess(newTodo);

    await act(async () => {
      await result.current.addTodo("New task");
    });

    expect(result.current.todos[0]).toEqual(newTodo);
    expect(result.current.todos).toHaveLength(2);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New task" }),
    });
  });

  it("addTodo sets error on failure", async () => {
    globalThis.fetch = mockFetchSuccess([]);
    const { result } = renderHook(() => useTodos());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    globalThis.fetch = mockFetchFailure();

    await act(async () => {
      await result.current.addTodo("Will fail");
    });

    expect(result.current.error).toBe("Failed to create todo");
  });

  // ---------------------------------------------------------------------------
  // toggleTodo
  // ---------------------------------------------------------------------------
  it("toggleTodo sends PATCH with flipped completed and updates state", async () => {
    const todo = makeTodo({ id: 1, completed: false });
    const toggled = makeTodo({ id: 1, completed: true });

    globalThis.fetch = mockFetchSuccess([todo]);
    const { result } = renderHook(() => useTodos());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    globalThis.fetch = mockFetchSuccess(toggled);

    await act(async () => {
      await result.current.toggleTodo(1);
    });

    expect(result.current.todos[0]!.completed).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/todos/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
  });

  it("toggleTodo does nothing for non-existent id", async () => {
    globalThis.fetch = mockFetchSuccess([makeTodo({ id: 1 })]);
    const { result } = renderHook(() => useTodos());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    globalThis.fetch = vi.fn();

    await act(async () => {
      await result.current.toggleTodo(999);
    });

    // fetch should not have been called since the id doesn't exist
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("toggleTodo sets error on failure", async () => {
    globalThis.fetch = mockFetchSuccess([makeTodo({ id: 1 })]);
    const { result } = renderHook(() => useTodos());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    globalThis.fetch = mockFetchFailure();

    await act(async () => {
      await result.current.toggleTodo(1);
    });

    expect(result.current.error).toBe("Failed to update todo");
  });

  // ---------------------------------------------------------------------------
  // updateTodo
  // ---------------------------------------------------------------------------
  it("updateTodo sends PATCH with new title and updates state", async () => {
    const todo = makeTodo({ id: 1, title: "Old" });
    const updated = makeTodo({ id: 1, title: "New" });

    globalThis.fetch = mockFetchSuccess([todo]);
    const { result } = renderHook(() => useTodos());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    globalThis.fetch = mockFetchSuccess(updated);

    await act(async () => {
      await result.current.updateTodo(1, "New");
    });

    expect(result.current.todos[0]!.title).toBe("New");
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/todos/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New" }),
    });
  });

  it("updateTodo sets error on failure", async () => {
    globalThis.fetch = mockFetchSuccess([makeTodo({ id: 1 })]);
    const { result } = renderHook(() => useTodos());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    globalThis.fetch = mockFetchFailure();

    await act(async () => {
      await result.current.updateTodo(1, "Will fail");
    });

    expect(result.current.error).toBe("Failed to update todo");
  });

  // ---------------------------------------------------------------------------
  // deleteTodo
  // ---------------------------------------------------------------------------
  it("deleteTodo sends DELETE and removes from state", async () => {
    const todos = [makeTodo({ id: 1 }), makeTodo({ id: 2, title: "Keep" })];

    globalThis.fetch = mockFetchSuccess(todos);
    const { result } = renderHook(() => useTodos());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    globalThis.fetch = mockFetchSuccess(undefined);

    await act(async () => {
      await result.current.deleteTodo(1);
    });

    expect(result.current.todos).toHaveLength(1);
    expect(result.current.todos[0]!.id).toBe(2);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/todos/1", {
      method: "DELETE",
    });
  });

  it("deleteTodo sets error on failure", async () => {
    globalThis.fetch = mockFetchSuccess([makeTodo({ id: 1 })]);
    const { result } = renderHook(() => useTodos());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    globalThis.fetch = mockFetchFailure();

    await act(async () => {
      await result.current.deleteTodo(1);
    });

    expect(result.current.error).toBe("Failed to delete todo");
  });

  // ---------------------------------------------------------------------------
  // setTodos
  // ---------------------------------------------------------------------------
  it("exposes setTodos for external state updates", async () => {
    globalThis.fetch = mockFetchSuccess([]);
    const { result } = renderHook(() => useTodos());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const newTodos = [makeTodo({ id: 10, title: "Injected" })];

    act(() => {
      result.current.setTodos(newTodos);
    });

    expect(result.current.todos).toEqual(newTodos);
  });
});
