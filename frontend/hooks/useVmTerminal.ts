'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { apiClient } from '@/lib/api';

interface UseVmTerminalOptions {
    vmId: string;
    containerId?: string | null;
    status: string;
}

interface UseVmTerminalReturn {
    terminalRef: React.RefObject<HTMLDivElement | null>;
    ready: boolean;
    connected: boolean;
    connecting: boolean;
    connect: () => void;
    disconnect: () => void;
    clear: () => void;
}

function getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    // Canonical source: apiClient's token (in-memory, backed by the
    // 'accessToken' sessionStorage key written after login/register/refresh),
    // then legacy storage keys as a fallback
    return (
        apiClient.getToken() ||
        sessionStorage.getItem('accessToken') ||
        localStorage.getItem('accessToken') ||
        localStorage.getItem('token') ||
        sessionStorage.getItem('token') ||
        null
    );
}

export function useVmTerminal({
    vmId,
    containerId,
    status,
}: UseVmTerminalOptions): UseVmTerminalReturn {
    const terminalRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const termRef = useRef<import('@xterm/xterm').Terminal | null>(null);
    const fitAddonRef = useRef<import('@xterm/addon-fit').FitAddon | null>(null);

    const [ready, setReady] = useState(false);
    const [connected, setConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);

    // Initialise xterm.js terminal (once, on mount)
    useEffect(() => {
        if (typeof window === 'undefined') return;

        let cancelled = false;
        let terminal: import('@xterm/xterm').Terminal | null = null;
        let resizeObserver: ResizeObserver | null = null;
        let disposables: Array<{ dispose: () => void }> = [];

        (async () => {
            const { Terminal } = await import('@xterm/xterm');
            const { FitAddon } = await import('@xterm/addon-fit');
            if (cancelled) return;

            terminal = new Terminal({
                cursorBlink: true,
                fontSize: 14,
                fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
                theme: {
                    background: '#0d1117',
                    foreground: '#c9d1d9',
                    cursor: '#58a6ff',
                    cursorAccent: '#0d1117',
                    selectionBackground: '#264f78',
                    black: '#484f58',
                    red: '#ff7b72',
                    green: '#3fb950',
                    yellow: '#d29922',
                    blue: '#58a6ff',
                    magenta: '#bc8cff',
                    cyan: '#39c5cf',
                    white: '#b1bac4',
                    brightBlack: '#6e7681',
                    brightRed: '#ffa198',
                    brightGreen: '#56d364',
                    brightYellow: '#e3b341',
                    brightBlue: '#79c0ff',
                    brightMagenta: '#d2a8ff',
                    brightCyan: '#56d4dd',
                    brightWhite: '#f0f6fc',
                },
                scrollback: 5000,
                allowTransparency: false,
                convertEol: true,
            });

            const fitAddon = new FitAddon();
            terminal.loadAddon(fitAddon);

            if (terminalRef.current) {
                terminal.open(terminalRef.current);
                fitAddon.fit();
                terminal.writeln('\x1b[90mSahary Cloud VM Console — click Connect to start a session\x1b[0m');
                resizeObserver = new ResizeObserver(() => {
                    try {
                        fitAddon.fit();
                    } catch (_) { }
                });
                resizeObserver.observe(terminalRef.current);
            }

            disposables = [
                terminal.onData((data) => {
                    if (socketRef.current?.connected) {
                        socketRef.current.emit('terminal:input', data);
                    }
                }),
                terminal.onResize(({ cols, rows }) => {
                    if (socketRef.current?.connected) {
                        socketRef.current.emit('terminal:resize', { cols, rows });
                    }
                }),
            ];

            termRef.current = terminal;
            fitAddonRef.current = fitAddon;
            setReady(true);
        })();

        return () => {
            cancelled = true;
            setReady(false);
            resizeObserver?.disconnect();
            disposables.forEach((disposable) => disposable.dispose());
            terminal?.dispose();
            termRef.current = null;
            fitAddonRef.current = null;
        };
    }, []);

    // ── Connect ─────────────────────────────────────────────────────────────
    const connect = useCallback(() => {
        if (socketRef.current?.connected || connecting) return;

        const token = getAccessToken();
        if (!token) {
            termRef.current?.writeln('\r\n\x1b[31mError: No access token found. Please log in again.\x1b[0m');
            return;
        }

        setConnecting(true);

        const backendUrl =
            process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

        const socket = io(`${backendUrl}/terminal`, {
            auth: { token },
            transports: ['websocket'],
            reconnection: false,
        });

        socketRef.current = socket;

        const release = () => {
            socket.disconnect();
            if (socketRef.current === socket) socketRef.current = null;
            setConnected(false);
            setConnecting(false);
        };

        socket.on('connect', () => {
            termRef.current?.writeln('\r\n\x1b[32m✓ Connected to VM console\x1b[0m\r\n');

            const cols = termRef.current?.cols ?? 80;
            const rows = termRef.current?.rows ?? 24;

            socket.emit('terminal:start', { vmId, containerId, cols, rows });
        });

        socket.on('terminal:data', (data: string) => {
            termRef.current?.write(data);
        });

        socket.once('terminal:data', () => {
            setConnected(true);
            setConnecting(false);
        });

        socket.on('terminal:error', (msg: string) => {
            termRef.current?.writeln(`\r\n\x1b[31mError: ${msg}\x1b[0m`);
            release();
        });

        socket.on('terminal:closed', () => {
            termRef.current?.writeln('\r\n\x1b[90mSession closed.\x1b[0m');
            release();
        });

        socket.on('connect_error', (err) => {
            termRef.current?.writeln(`\r\n\x1b[31mConnection error: ${err.message}\x1b[0m`);
            release();
        });

        socket.on('disconnect', () => {
            if (socketRef.current === socket) socketRef.current = null;
            setConnected(false);
            setConnecting(false);
        });
    }, [vmId, containerId, connecting]);

    // ── Disconnect ───────────────────────────────────────────────────────────
    const disconnect = useCallback(() => {
        socketRef.current?.disconnect();
        socketRef.current = null;
        setConnected(false);
        setConnecting(false);
        termRef.current?.writeln('\r\n\x1b[90mDisconnected.\x1b[0m');
    }, []);

    // ── Clear ────────────────────────────────────────────────────────────────
    const clear = useCallback(() => {
        termRef.current?.clear();
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            socketRef.current?.disconnect();
            socketRef.current = null;
        };
    }, []);

    return {
        terminalRef,
        ready,
        connected,
        connecting,
        connect,
        disconnect,
        clear,
    };
}
