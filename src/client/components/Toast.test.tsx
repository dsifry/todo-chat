import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { renderHook } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Toast component tests
// ---------------------------------------------------------------------------
describe("ToastContainer", () => {
  let ToastModule: typeof import("./Toast.js");

  beforeEach(async () => {
    vi.useFakeTimers();
    ToastModule = await import("./Toast.js");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders toasts", () => {
    const { ToastContainer } = ToastModule;
    const toasts = [
      { id: "1", type: "success" as const, message: "Connected to server" },
      { id: "2", type: "error" as const, message: "Connection lost" },
    ];
    render(<ToastContainer toasts={toasts} onDismiss={vi.fn()} />);
    expect(screen.getByText("Connected to server")).toBeInTheDocument();
    expect(screen.getByText("Connection lost")).toBeInTheDocument();
  });

  it("renders success toast with green background", () => {
    const { ToastContainer } = ToastModule;
    const toasts = [
      { id: "1", type: "success" as const, message: "Success!" },
    ];
    const { container } = render(
      <ToastContainer toasts={toasts} onDismiss={vi.fn()} />,
    );
    const toast = container.querySelector("[class*='bg-green-600']");
    expect(toast).toBeInTheDocument();
  });

  it("renders error toast with red background", () => {
    const { ToastContainer } = ToastModule;
    const toasts = [
      { id: "1", type: "error" as const, message: "Error!" },
    ];
    const { container } = render(
      <ToastContainer toasts={toasts} onDismiss={vi.fn()} />,
    );
    const toast = container.querySelector("[class*='bg-red-600']");
    expect(toast).toBeInTheDocument();
  });

  it("renders info toast with blue background", () => {
    const { ToastContainer } = ToastModule;
    const toasts = [
      { id: "1", type: "info" as const, message: "Info!" },
    ];
    const { container } = render(
      <ToastContainer toasts={toasts} onDismiss={vi.fn()} />,
    );
    const toast = container.querySelector("[class*='bg-blue-600']");
    expect(toast).toBeInTheDocument();
  });

  it("auto-dismisses toast after 3 seconds", () => {
    const { ToastContainer } = ToastModule;
    const onDismiss = vi.fn();
    const toasts = [
      { id: "1", type: "info" as const, message: "Will dismiss" },
    ];
    render(<ToastContainer toasts={toasts} onDismiss={onDismiss} />);

    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onDismiss).toHaveBeenCalledWith("1");
  });

  it("does not dismiss before 3 seconds", () => {
    const { ToastContainer } = ToastModule;
    const onDismiss = vi.fn();
    const toasts = [
      { id: "1", type: "info" as const, message: "Not yet" },
    ];
    render(<ToastContainer toasts={toasts} onDismiss={onDismiss} />);

    act(() => {
      vi.advanceTimersByTime(2999);
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("calls onDismiss when dismiss button is clicked", () => {
    const { ToastContainer } = ToastModule;
    const onDismiss = vi.fn();
    const toasts = [
      { id: "1", type: "success" as const, message: "Dismiss me" },
    ];
    render(<ToastContainer toasts={toasts} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(onDismiss).toHaveBeenCalledWith("1");
  });

  it("renders with aria-live polite for accessibility", () => {
    const { ToastContainer } = ToastModule;
    const { container } = render(
      <ToastContainer toasts={[]} onDismiss={vi.fn()} />,
    );
    const liveRegion = container.querySelector("[aria-live='polite']");
    expect(liveRegion).toBeInTheDocument();
  });

  it("renders each toast with role alert", () => {
    const { ToastContainer } = ToastModule;
    const toasts = [
      { id: "1", type: "success" as const, message: "Alert toast" },
    ];
    render(<ToastContainer toasts={toasts} onDismiss={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// useToasts hook tests
// ---------------------------------------------------------------------------
describe("useToasts", () => {
  let ToastModule: typeof import("./Toast.js");

  beforeEach(async () => {
    ToastModule = await import("./Toast.js");
    // Mock crypto.randomUUID for deterministic IDs
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValue("test-uuid-123"),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with empty toasts array", () => {
    const { useToasts } = ToastModule;
    const { result } = renderHook(() => useToasts());
    expect(result.current.toasts).toEqual([]);
  });

  it("addToast adds a toast", () => {
    const { useToasts } = ToastModule;
    const { result } = renderHook(() => useToasts());

    act(() => {
      result.current.addToast("success", "Added!");
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toEqual({
      id: "test-uuid-123",
      type: "success",
      message: "Added!",
    });
  });

  it("dismissToast removes a toast by id", () => {
    const { useToasts } = ToastModule;
    let callCount = 0;
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockImplementation(() => {
        callCount++;
        return `uuid-${callCount}`;
      }),
    });

    const { result } = renderHook(() => useToasts());

    act(() => {
      result.current.addToast("success", "First");
      result.current.addToast("error", "Second");
    });

    expect(result.current.toasts).toHaveLength(2);

    act(() => {
      result.current.dismissToast("uuid-1");
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]?.message).toBe("Second");
  });
});

// ---------------------------------------------------------------------------
// ErrorBoundary tests
// ---------------------------------------------------------------------------
describe("ErrorBoundary", () => {
  let ErrorBoundaryModule: typeof import("./ErrorBoundary.js");

  beforeEach(async () => {
    ErrorBoundaryModule = await import("./ErrorBoundary.js");
    // Suppress console.error from React error boundary
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when there is no error", () => {
    const { ErrorBoundary } = ErrorBoundaryModule;
    render(
      <ErrorBoundary>
        <div>Hello World</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("catches errors and shows fallback UI", () => {
    const { ErrorBoundary } = ErrorBoundaryModule;

    function ThrowingComponent(): JSX.Element {
      throw new Error("Test error");
    }

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The application encountered an unexpected error. Please refresh the page to try again.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a Refresh Page button in fallback UI", () => {
    const { ErrorBoundary } = ErrorBoundaryModule;

    function ThrowingComponent(): JSX.Element {
      throw new Error("Test error");
    }

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );

    const refreshButton = screen.getByRole("button", {
      name: "Refresh Page",
    });
    expect(refreshButton).toBeInTheDocument();
  });

  it("calls window.location.reload when Refresh Page is clicked", () => {
    const { ErrorBoundary } = ErrorBoundaryModule;

    function ThrowingComponent(): JSX.Element {
      throw new Error("Test error");
    }

    // Mock window.location.reload
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload: reloadMock },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh Page" }));
    expect(reloadMock).toHaveBeenCalled();
  });
});
