import { useState, useEffect, useRef, KeyboardEvent } from "react";
import type { Todo } from "../types/index.js";

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: number) => void;
  onUpdate: (id: number, title: string) => void;
  onDelete: (id: number) => void;
}

export function TodoItem({ todo, onToggle, onUpdate, onDelete }: TodoItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [animClass, setAnimClass] = useState("");
  const prevTitleRef = useRef(todo.title);
  const prevCompletedRef = useRef(todo.completed);
  const isInitialMount = useRef(true);

  // Slide-in + sparkle on initial mount
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      setAnimClass("todo-enter");
      const timer = setTimeout(() => setAnimClass(""), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  // Sparkle flash on edit (title or completed change)
  useEffect(() => {
    if (isInitialMount.current) return;
    if (
      todo.title !== prevTitleRef.current ||
      todo.completed !== prevCompletedRef.current
    ) {
      prevTitleRef.current = todo.title;
      prevCompletedRef.current = todo.completed;
      setAnimClass("todo-updated");
      const timer = setTimeout(() => setAnimClass(""), 600);
      return () => clearTimeout(timer);
    }
  }, [todo.title, todo.completed]);

  function handleSave() {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== todo.title) {
      onUpdate(todo.id, trimmed);
    }
    setIsEditing(false);
    setEditTitle(todo.title);
  }

  function handleCancel() {
    setIsEditing(false);
    setEditTitle(todo.title);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  }

  function startEditing() {
    setEditTitle(todo.title);
    setIsEditing(true);
  }

  return (
    <li className={`todo-item flex items-center gap-2 border-b border-gray-100 px-4 py-3 ${animClass}`}>
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => onToggle(todo.id)}
        className="h-4 w-4 rounded border-gray-300"
        aria-label={`Mark "${todo.title}" as ${todo.completed ? "incomplete" : "complete"}`}
      />
      {isEditing ? (
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          autoFocus
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
          aria-label="Edit todo title"
        />
      ) : (
        <span
          className={`flex-1 text-sm ${todo.completed ? "text-gray-400 line-through" : "text-gray-900"}`}
        >
          {todo.title}
        </span>
      )}
      {!isEditing && (
        <>
          <button
            onClick={startEditing}
            className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label={`Edit "${todo.title}"`}
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(todo.id)}
            className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
            aria-label={`Delete "${todo.title}"`}
          >
            Delete
          </button>
        </>
      )}
    </li>
  );
}
