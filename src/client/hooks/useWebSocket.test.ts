import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useWebSocket } from "./useWebSocket";
import type { ServerMessage, ClientMessage } from "../types/index.js";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

type WebSocketListener = (event: { data: string }) => void;
type WebSocketCloseListener = (event: { code?: number; reason?: string }) => void;
type WebSocketOpenListener = () => void;
type WebSocketErrorListener = (event: Event) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  readyState: number;
  onopen: WebSocketOpenListener | null = null;
  onclose: WebSocketCloseListener | null = null;
  onmessage: WebSocketListener | null = null;
  onerror: WebSocketErrorListener | null = null;

  sent: string[] = [];
  closed = false;

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code: 1000, reason: "Normal closure" });
    }
  }

  // --- Test helpers ---

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen();
    }
  }

  simulateMessage(msg: ServerMessage): void {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(msg) });
    }
  }

  simulateClose(code = 1006, reason = ""): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code, reason });
    }
  }

  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event("error"));
    }
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("useWebSocket", () => {
  let originalWebSocket: typeof globalThis.WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    originalWebSocket = globalThis.WebSocket;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.WebSocket = MockWebSocket as any;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.WebSocket = originalWebSocket;
  });

  function latestWs(): MockWebSocket {
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    if (!ws) throw new Error("No MockWebSocket instance created");
    return ws;
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  describe("connection lifecycle", () => {
    it("creates a WebSocket connection on mount with correct URL", () => {
      const onMessage = vi.fn();
      const onStatusChange = vi.fn();

      renderHook(() => useWebSocket({ onMessage, onStatusChange }));

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(latestWs().url).toBe(`ws://${window.location.host}/ws`);
    });

    it("starts with 'connecting' status", () => {
      const onMessage = vi.fn();
      const onStatusChange = vi.fn();

      const { result } = renderHook(() =>
        useWebSocket({ onMessage, onStatusChange }),
      );

      expect(result.current.connectionStatus).toBe("connecting");
    });

    it("transitions to 'connected' when WebSocket opens", () => {
      const onMessage = vi.fn();
      const onStatusChange = vi.fn();

      const { result } = renderHook(() =>
        useWebSocket({ onMessage, onStatusChange }),
      );

      act(() => {
        latestWs().simulateOpen();
      });

      expect(result.current.connectionStatus).toBe("connected");
      expect(onStatusChange).toHaveBeenCalledWith("connected");
    });

    it("transitions to 'disconnected' when WebSocket closes", () => {
      const onMessage = vi.fn();
      const onStatusChange = vi.fn();

      const { result } = renderHook(() =>
        useWebSocket({ onMessage, onStatusChange }),
      );

      act(() => {
        latestWs().simulateOpen();
      });

      act(() => {
        latestWs().simulateClose();
      });

      expect(result.current.connectionStatus).toBe("disconnected");
      expect(onStatusChange).toHaveBeenCalledWith("disconnected");
    });

    it("closes WebSocket on unmount", () => {
      const onMessage = vi.fn();
      const onStatusChange = vi.fn();

      const { unmount } = renderHook(() =>
        useWebSocket({ onMessage, onStatusChange }),
      );

      const ws = latestWs();

      act(() => {
        ws.simulateOpen();
      });

      unmount();

      expect(ws.closed).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Reconnection with exponential backoff
  // ---------------------------------------------------------------------------

  describe("reconnection backoff", () => {
    it("reconnects after 1s on first disconnect", () => {
      const onMessage = vi.fn();
      const onStatusChange = vi.fn();

      renderHook(() => useWebSocket({ onMessage, onStatusChange }));

      act(() => {
        latestWs().simulateOpen();
      });

      act(() => {
        latestWs().simulateClose(1006);
      });

      expect(MockWebSocket.instances).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(MockWebSocket.instances).toHaveLength(2);
    });

    it("uses exponential backoff: 1s, 2s, 4s, 8s", () => {
      const onMessage = vi.fn();
      const onStatusChange = vi.fn();

      renderHook(() => useWebSocket({ onMessage, onStatusChange }));

      // First connection
      act(() => {
        latestWs().simulateOpen();
      });

      // First disconnect -> 1s backoff
      act(() => {
        latestWs().simulateClose(1006);
      });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(MockWebSocket.instances).toHaveLength(2);

      // Second disconnect -> 2s backoff
      act(() => {
        latestWs().simulateClose(1006);
      });
      act(() => {
        vi.advanceTimersByTime(1999);
      });
      expect(MockWebSocket.instances).toHaveLength(2); // not yet
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(MockWebSocket.instances).toHaveLength(3);

      // Third disconnect -> 4s backoff
      act(() => {
        latestWs().simulateClose(1006);
      });
      act(() => {
        vi.advanceTimersByTime(3999);
      });
      expect(MockWebSocket.instances).toHaveLength(3); // not yet
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(MockWebSocket.instances).toHaveLength(4);

      // Fourth disconnect -> 8s backoff
      act(() => {
        latestWs().simulateClose(1006);
      });
      act(() => {
        vi.advanceTimersByTime(7999);
      });
      expect(MockWebSocket.instances).toHaveLength(4); // not yet
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(MockWebSocket.instances).toHaveLength(5);
    });

    it("caps backoff at 30s", () => {
      const onMessage = vi.fn();
      const onStatusChange = vi.fn();

      renderHook(() => useWebSocket({ onMessage, onStatusChange }));

      act(() => {
        latestWs().simulateOpen();
      });

      // Simulate many disconnects to exceed 30s cap
      // 1s, 2s, 4s, 8s, 16s, 32s -> should cap at 30s
      for (let i = 0; i < 5; i++) {
        act(() => {
          latestWs().simulateClose(1006);
        });
        act(() => {
          vi.advanceTimersByTime(30000);
        });
      }

      const countBefore = MockWebSocket.instances.length;

      // Next disconnect should use 30s max
      act(() => {
        latestWs().simulateClose(1006);
      });

      // At 29999ms, should NOT have reconnected
      act(() => {
        vi.advanceTimersByTime(29999);
      });
      expect(MockWebSocket.instances).toHaveLength(countBefore);

      // At 30000ms, SHOULD reconnect
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(MockWebSocket.instances).toHaveLength(countBefore + 1);
    });

    it("resets backoff on successful connection", () => {
      const onMessage = vi.fn();
      const onStatusChange = vi.fn();

      renderHook(() => useWebSocket({ onMessage, onStatusChange }));

      // Connect, disconnect, reconnect after 1s
      act(() => {
        latestWs().simulateOpen();
      });
      act(() => {
        latestWs().simulateClose(1006);
      });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(MockWebSocket.instances).toHaveLength(2);

      // Successfully reconnect
      act(() => {
        latestWs().simulateOpen();
      });

      // Disconnect again -> backoff should be reset to 1s
      act(() => {
        latestWs().simulateClose(1006);
      });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(MockWebSocket.instances).toHaveLength(3);
    });

    it("does not reconnect after normal close (code 1000)", () => {
      const onMessage = vi.fn();
      const onStatusChange = vi.fn();

      renderHook(() => useWebSocket({ onMessage, onStatusChange }));

      act(() => {
        latestWs().simulateOpen();
      });

      // Normal close (e.g., user-initiated disconnect)
      act(() => {
        latestWs().simulateClose(1000, "Normal closure");
      });

      act(() => {
        vi.advanceTimersByTime(60000);
      });

      // Should NOT have created a new WebSocket
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it("does not reconnect after unmount", () => {
      const onMessage = vi.fn();
      const onStatusChange = vi.fn();

      const { unmount } = renderHook(() =>
        useWebSocket({ onMessage, onStatusChange }),
      );

      act(() => {
        latestWs().simulateOpen();
      });

      unmount();

      act(() => {
        vi.advanceTimersByTime(60000);
      });

      // Only the original connection should exist
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------------

  describe("message handling", () => {
    it("calls onMessage when a server message is received", () => {
      const onMessage = vi.fn();
      const onStatusChange = vi.fn();

      renderHook(() => useWebSocket({ onMessage, onStatusChange }));

      act(() => {
        latestWs().simulateOpen();
      });

      const serverMsg: ServerMessage = {
        type: "todo:created",
        tempId: "temp-1",
        data: {
          id: 1,
          title: "New todo",
          completed: false,
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
        },
      };

      act(() => {
        latestWs().simulateMessage(serverMsg);
      });

      expect(onMessage).toHaveBeenCalledWith(serverMsg);
    });

    it("handles malformed JSON gracefully without crashing", () => {
      const onMessage = vi.fn();
      const onStatusChange = vi.fn();

      renderHook(() => useWebSocket({ onMessage, onStatusChange }));

      act(() => {
        latestWs().simulateOpen();
      });

      // Directly trigger onmessage with invalid JSON
      act(() => {
        const ws = latestWs();
        if (ws.onmessage) {
          ws.onmessage({ data: "not-valid-json{{{" });
        }
      });

      expect(onMessage).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // sendMessage
  // ---------------------------------------------------------------------------

  describe("sendMessage", () => {
    it("sends a JSON-serialized message through the WebSocket", () => {
      const onMessage = vi.fn();
      const onStatusChange = vi.fn();

      const { result } = renderHook(() =>
        useWebSocket({ onMessage, onStatusChange }),
      );

      act(() => {
        latestWs().simulateOpen();
      });

      const msg: ClientMessage = {
        type: "todo:create",
        tempId: "temp-1",
        data: { title: "Test" },
      };

      act(() => {
        result.current.sendMessage(msg);
      });

      expect(latestWs().sent).toHaveLength(1);
      expect(JSON.parse(latestWs().sent[0]!)).toEqual(msg);
    });

    it("does not send when WebSocket is not open", () => {
      const onMessage = vi.fn();
      const onStatusChange = vi.fn();

      const { result } = renderHook(() =>
        useWebSocket({ onMessage, onStatusChange }),
      );

      // WebSocket is still CONNECTING (not opened)
      const msg: ClientMessage = {
        type: "todo:create",
        tempId: "temp-1",
        data: { title: "Test" },
      };

      act(() => {
        result.current.sendMessage(msg);
      });

      expect(latestWs().sent).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // disconnect
  // ---------------------------------------------------------------------------

  describe("disconnect", () => {
    it("closes the WebSocket and prevents reconnection", () => {
      const onMessage = vi.fn();
      const onStatusChange = vi.fn();

      const { result } = renderHook(() =>
        useWebSocket({ onMessage, onStatusChange }),
      );

      act(() => {
        latestWs().simulateOpen();
      });

      act(() => {
        result.current.disconnect();
      });

      expect(latestWs().closed).toBe(true);

      // Should NOT reconnect
      act(() => {
        vi.advanceTimersByTime(60000);
      });

      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Status change callback uses latest ref
  // ---------------------------------------------------------------------------

  describe("callback stability", () => {
    it("uses latest onMessage callback without re-creating WebSocket", () => {
      const onMessage1 = vi.fn();
      const onMessage2 = vi.fn();
      const onStatusChange = vi.fn();

      const { rerender } = renderHook(
        ({ onMessage }: { onMessage: (msg: ServerMessage) => void }) =>
          useWebSocket({ onMessage, onStatusChange }),
        { initialProps: { onMessage: onMessage1 } },
      );

      act(() => {
        latestWs().simulateOpen();
      });

      // Re-render with different callback
      rerender({ onMessage: onMessage2 });

      // Should still be the same WebSocket instance
      expect(MockWebSocket.instances).toHaveLength(1);

      const serverMsg: ServerMessage = {
        type: "todo:sync",
        data: [],
      };

      act(() => {
        latestWs().simulateMessage(serverMsg);
      });

      // Should use the latest callback
      expect(onMessage1).not.toHaveBeenCalled();
      expect(onMessage2).toHaveBeenCalledWith(serverMsg);
    });
  });
});
