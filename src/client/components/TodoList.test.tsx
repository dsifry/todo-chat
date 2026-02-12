import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { AddTodo } from "./AddTodo";
import { TodoItem } from "./TodoItem";
import { TodoList } from "./TodoList";
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

// ---------------------------------------------------------------------------
// AddTodo
// ---------------------------------------------------------------------------
describe("AddTodo", () => {
  it("renders input and button", () => {
    render(<AddTodo onAdd={vi.fn()} />);
    expect(screen.getByLabelText("New todo title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("calls onAdd with trimmed title on Enter key", () => {
    const onAdd = vi.fn();
    render(<AddTodo onAdd={onAdd} />);
    const input = screen.getByLabelText("New todo title");
    fireEvent.change(input, { target: { value: "  Buy milk  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith("Buy milk");
  });

  it("clears input on Escape key", () => {
    render(<AddTodo onAdd={vi.fn()} />);
    const input = screen.getByLabelText("New todo title") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Some text" } });
    expect(input.value).toBe("Some text");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
  });

  it("does not submit when input is empty", () => {
    const onAdd = vi.fn();
    render(<AddTodo onAdd={onAdd} />);
    const input = screen.getByLabelText("New todo title");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("does not submit when input is only whitespace", () => {
    const onAdd = vi.fn();
    render(<AddTodo onAdd={onAdd} />);
    const input = screen.getByLabelText("New todo title");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("clears input after successful submission", () => {
    render(<AddTodo onAdd={vi.fn()} />);
    const input = screen.getByLabelText("New todo title") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "New task" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("");
  });

  it("disables Add button when input is empty", () => {
    render(<AddTodo onAdd={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Add" });
    expect(button).toBeDisabled();
  });

  it("enables Add button when input has text", () => {
    render(<AddTodo onAdd={vi.fn()} />);
    const input = screen.getByLabelText("New todo title");
    fireEvent.change(input, { target: { value: "Something" } });
    const button = screen.getByRole("button", { name: "Add" });
    expect(button).toBeEnabled();
  });

  it("submits on Add button click", () => {
    const onAdd = vi.fn();
    render(<AddTodo onAdd={onAdd} />);
    const input = screen.getByLabelText("New todo title");
    fireEvent.change(input, { target: { value: "Click task" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenCalledWith("Click task");
  });
});

// ---------------------------------------------------------------------------
// TodoItem
// ---------------------------------------------------------------------------
describe("TodoItem", () => {
  it("renders todo title", () => {
    const todo = makeTodo({ title: "Buy groceries" });
    render(
      <TodoItem
        todo={todo}
        onToggle={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Buy groceries")).toBeInTheDocument();
  });

  it("renders checkbox reflecting completed state (unchecked)", () => {
    const todo = makeTodo({ completed: false });
    render(
      <TodoItem
        todo={todo}
        onToggle={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
  });

  it("renders checkbox reflecting completed state (checked)", () => {
    const todo = makeTodo({ completed: true });
    render(
      <TodoItem
        todo={todo}
        onToggle={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
  });

  it("calls onToggle when checkbox clicked", () => {
    const onToggle = vi.fn();
    const todo = makeTodo({ id: 42 });
    render(
      <TodoItem
        todo={todo}
        onToggle={onToggle}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith(42);
  });

  it("calls onDelete when delete button clicked", () => {
    const onDelete = vi.fn();
    const todo = makeTodo({ id: 7, title: "Remove me" });
    render(
      <TodoItem
        todo={todo}
        onToggle={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByLabelText('Delete "Remove me"'));
    expect(onDelete).toHaveBeenCalledWith(7);
  });

  it("enters edit mode on Edit button click", () => {
    const todo = makeTodo({ title: "Edit me" });
    render(
      <TodoItem
        todo={todo}
        onToggle={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Edit "Edit me"'));
    expect(screen.getByLabelText("Edit todo title")).toBeInTheDocument();
    expect(screen.getByLabelText("Edit todo title")).toHaveValue("Edit me");
  });

  it("saves edit on Enter key", () => {
    const onUpdate = vi.fn();
    const todo = makeTodo({ id: 5, title: "Old title" });
    render(
      <TodoItem
        todo={todo}
        onToggle={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Edit "Old title"'));
    const editInput = screen.getByLabelText("Edit todo title");
    fireEvent.change(editInput, { target: { value: "New title" } });
    fireEvent.keyDown(editInput, { key: "Enter" });
    expect(onUpdate).toHaveBeenCalledWith(5, "New title");
  });

  it("cancels edit on Escape key", () => {
    const onUpdate = vi.fn();
    const todo = makeTodo({ title: "Keep me" });
    render(
      <TodoItem
        todo={todo}
        onToggle={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Edit "Keep me"'));
    const editInput = screen.getByLabelText("Edit todo title");
    fireEvent.change(editInput, { target: { value: "Changed" } });
    fireEvent.keyDown(editInput, { key: "Escape" });
    // Should exit edit mode and show original title
    expect(screen.getByText("Keep me")).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("does not call onUpdate if title unchanged", () => {
    const onUpdate = vi.fn();
    const todo = makeTodo({ id: 3, title: "Same title" });
    render(
      <TodoItem
        todo={todo}
        onToggle={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Edit "Same title"'));
    const editInput = screen.getByLabelText("Edit todo title");
    // Don't change the value, just press Enter
    fireEvent.keyDown(editInput, { key: "Enter" });
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("applies line-through styling when completed", () => {
    const todo = makeTodo({ completed: true, title: "Done task" });
    render(
      <TodoItem
        todo={todo}
        onToggle={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const titleSpan = screen.getByText("Done task");
    expect(titleSpan).toHaveClass("line-through");
  });

  it("hides Edit and Delete buttons while editing", () => {
    const todo = makeTodo({ title: "Editing" });
    render(
      <TodoItem
        todo={todo}
        onToggle={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Edit "Editing"'));
    expect(screen.queryByLabelText('Edit "Editing"')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Delete "Editing"'),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TodoList
// ---------------------------------------------------------------------------
describe("TodoList", () => {
  it("renders loading state", () => {
    render(
      <TodoList
        todos={[]}
        onAdd={vi.fn()}
        onToggle={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        isLoading={true}
      />,
    );
    expect(screen.getByText("Loading todos...")).toBeInTheDocument();
  });

  it("renders empty state when no todos", () => {
    render(
      <TodoList
        todos={[]}
        onAdd={vi.fn()}
        onToggle={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        isLoading={false}
      />,
    );
    expect(
      screen.getByText("No todos yet. Add one above!"),
    ).toBeInTheDocument();
  });

  it("renders list of todos", () => {
    const todos = [
      makeTodo({ id: 1, title: "First" }),
      makeTodo({ id: 2, title: "Second" }),
      makeTodo({ id: 3, title: "Third" }),
    ];
    render(
      <TodoList
        todos={todos}
        onAdd={vi.fn()}
        onToggle={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        isLoading={false}
      />,
    );
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("Third")).toBeInTheDocument();
  });

  it("passes correct props through to TodoItem", () => {
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    const todo = makeTodo({ id: 99, title: "Pass props" });
    render(
      <TodoList
        todos={[todo]}
        onAdd={vi.fn()}
        onToggle={onToggle}
        onUpdate={vi.fn()}
        onDelete={onDelete}
        isLoading={false}
      />,
    );
    // Verify toggle is wired through
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith(99);
    // Verify delete is wired through
    fireEvent.click(screen.getByLabelText('Delete "Pass props"'));
    expect(onDelete).toHaveBeenCalledWith(99);
  });

  it("renders AddTodo component when not loading", () => {
    render(
      <TodoList
        todos={[]}
        onAdd={vi.fn()}
        onToggle={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        isLoading={false}
      />,
    );
    expect(screen.getByLabelText("New todo title")).toBeInTheDocument();
  });

  it("does not render AddTodo when loading", () => {
    render(
      <TodoList
        todos={[]}
        onAdd={vi.fn()}
        onToggle={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        isLoading={true}
      />,
    );
    expect(screen.queryByLabelText("New todo title")).not.toBeInTheDocument();
  });

  it("passes onAdd through to AddTodo", () => {
    const onAdd = vi.fn();
    render(
      <TodoList
        todos={[]}
        onAdd={onAdd}
        onToggle={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        isLoading={false}
      />,
    );
    const input = screen.getByLabelText("New todo title");
    fireEvent.change(input, { target: { value: "New via list" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith("New via list");
  });
});
