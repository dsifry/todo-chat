import { useState, useEffect, useRef, useCallback } from "react";
import type {
  ConnectionStatus,
  ClientMessage,
  ServerMessage,
} from "../types/index.js";

export interface UseWebSocketOptions {
  onMessage: (msg: ServerMessage) => void;
  onStatusChange: (status: ConnectionStatus) => void;
  /** When false, the hook is inert (no connection). Defaults to true. */
  enabled?: boolean;
}

export interface UseWebSocketReturn {
  sendMessage: (msg: ClientMessage) => void;
  connectionStatus: ConnectionStatus;
  disconnect: () => void;
}

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const BACKOFF_MULTIPLIER = 2;
const NORMAL_CLOSE_CODE = 1000;

export function useWebSocket({
  onMessage,
  onStatusChange,
  enabled = true,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>(enabled ? "connecting" : "disconnected");
  const enabledRef = useRef(enabled);

  // Refs to keep latest callbacks without re-triggering effects
  const onMessageRef = useRef(onMessage);
  const onStatusChangeRef = useRef(onStatusChange);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  const intentionalCloseRef = useRef(false);

  // Keep refs up to date
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const updateStatus = useCallback((status: ConnectionStatus) => {
    setConnectionStatus(status);
    onStatusChangeRef.current(status);
  }, []);

  const connect = useCallback(() => {
    if (unmountedRef.current || !enabledRef.current) return;

    const url = `ws://${window.location.host}/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    updateStatus("connecting");

    ws.onopen = () => {
      if (unmountedRef.current) return;
      backoffRef.current = INITIAL_BACKOFF_MS;
      updateStatus("connected");
    };

    ws.onmessage = (event: MessageEvent | { data: string }) => {
      try {
        const data = JSON.parse(
          typeof event === "object" && "data" in event
            ? (event.data as string)
            : "",
        ) as ServerMessage;
        onMessageRef.current(data);
      } catch {
        // Malformed JSON — silently ignore
      }
    };

    ws.onclose = (
      event: CloseEvent | { code?: number; reason?: string },
    ) => {
      if (unmountedRef.current) return;

      updateStatus("disconnected");

      const code = "code" in event ? event.code : undefined;

      // Do not reconnect on normal closure or intentional disconnect
      if (code === NORMAL_CLOSE_CODE || intentionalCloseRef.current) {
        return;
      }

      // Schedule reconnect with exponential backoff
      const delay = backoffRef.current;
      backoffRef.current = Math.min(
        delay * BACKOFF_MULTIPLIER,
        MAX_BACKOFF_MS,
      );

      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = () => {
      // Error handling is done in onclose which fires after onerror
    };
  }, [updateStatus]);

  // Initial connection on mount (only when enabled)
  useEffect(() => {
    unmountedRef.current = false;
    intentionalCloseRef.current = false;
    if (enabled) {
      connect();
    }

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, enabled]);

  const sendMessage = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
  }, []);

  return { sendMessage, connectionStatus, disconnect };
}
