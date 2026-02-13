import type { TodoListProps } from "../types/index.js";
import { TodoItem } from "./TodoItem.js";
import { AddTodo } from "./AddTodo.js";

export function TodoList({
  todos,
  onAdd,
  onToggle,
  onUpdate,
  onDelete,
  isLoading,
}: TodoListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">Loading todos...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AddTodo onAdd={onAdd} />
      {todos.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-gray-400">No todos yet. Add one above!</p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {todos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={onToggle}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
