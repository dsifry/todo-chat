import { useState, useEffect, useCallback } from "react";
import type { Todo } from "../types/index.js";

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTodos = useCallback(async () => {
    try {
      const response = await fetch("/api/todos");
      if (!response.ok) throw new Error("Failed to fetch todos");
      const data = (await response.json()) as Todo[];
      setTodos(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTodos();
  }, [fetchTodos]);

  const addTodo = useCallback(async (title: string) => {
    try {
      const response = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) throw new Error("Failed to create todo");
      const newTodo = (await response.json()) as Todo;
      setTodos((prev) => [newTodo, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  const toggleTodo = useCallback(
    async (id: number) => {
      const todo = todos.find((t) => t.id === id);
      if (!todo) return;
      try {
        const response = await fetch(`/api/todos/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed: !todo.completed }),
        });
        if (!response.ok) throw new Error("Failed to update todo");
        const updated = (await response.json()) as Todo;
        setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [todos],
  );

  const updateTodo = useCallback(async (id: number, title: string) => {
    try {
      const response = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) throw new Error("Failed to update todo");
      const updated = (await response.json()) as Todo;
      setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  const deleteTodo = useCallback(async (id: number) => {
    try {
      const response = await fetch(`/api/todos/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete todo");
      setTodos((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  return {
    todos,
    isLoading,
    error,
    addTodo,
    toggleTodo,
    updateTodo,
    deleteTodo,
    setTodos,
  };
}
