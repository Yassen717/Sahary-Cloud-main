'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseVmTerminalOptions {
    vmId: string;
    containerId?: string | null;
    status: string;
}

interface UseVmTerminalReturn {
    terminalRef: React.RefObject<HTMLDivElement>;
    connected: boolean;
    connecting: boolean;
    connect: () => void;
    disconnect: () => void;
    clear: () => void;
}

function getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    // Try localStorage first, then sessionStorage
    return (
        localStorage.getItem('accessToken') ||
        localStorage.getItem('token') ||
        sessionStorage.getItem('accessToken') ||
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
    const resizeObserverRef = useRef<ResizeObserver | null>(null);

    const [connected, setConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);

    // Initialise xterm.js terminal (once, on mount)
    useEffect(() => {
        if (typeof window === 'undefined') return;

        let terminal: import('@xterm/xterm').Terminal;
        let fitAddon: import('@xterm/addon-fit').FitAddon;

        (async () => {
            const { Terminal } = await import('@xterm/xterm');
            const { FitAddon } = await import('@xterm/addon-fit');

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

            fitAddon = new FitAddon();
            terminal.loadAddon(fitAddon);

            if (terminalRef.current) {
                terminal.open(terminalRef.current);
                fitAddon.fit();
                terminal.writeln('\x1b[90mSahary Cloud VM Console — click Connect to start a session\x1b[0m');
            }

            termRef.current = terminal;
            fitAddonRef.current = fitAddon;

            // Resize observer — refit xterm on container size changes
            const ro = new ResizeObserver(() => {
                try {
                    fitAddon?.fit();
                } catch (_) { }
            });
            if (terminalRef.current) ro.observe(terminalRef.current);
            resizeObserverRef.current = ro;
        })();

        return () => {
            resizeObserverRef.current?.disconnect();
            termRef.current?.dispose();
            termRef.current = null;
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

        socket.on('connect', () => {
            termRef.current?.writeln('\r\n\x1b[32m✓ Connected to VM console\x1b[0m\r\n');

            const cols = termRef.current?.cols ?? 80;
            const rows = termRef.current?.rows ?? 24;

            socket.emit('terminal:start', { vmId, containerId, cols, rows });
        });

        socket.on('terminal:data', (data: string) => {
            if (!connected) setConnected(true);
            termRef.current?.write(data);
        });

        socket.on('terminal:error', (msg: string) => {
            termRef.current?.writeln(`\r\n\x1b[31mError: ${msg}\x1b[0m`);
            setConnected(false);
            setConnecting(false);
        });

        socket.on('terminal:closed', () => {
            termRef.current?.writeln('\r\n\x1b[90mSession closed.\x1b[0m');
            setConnected(false);
            setConnecting(false);
        });

        socket.on('connect_error', (err) => {
            termRef.current?.writeln(`\r\n\x1b[31mConnection error: ${err.message}\x1b[0m`);
            setConnected(false);
            setConnecting(false);
        });

        socket.on('disconnect', () => {
            setConnected(false);
            setConnecting(false);
        });

        // Forward keystrokes from xterm → socket
        termRef.current?.onData((data) => {
            if (socket.connected) {
                socket.emit('terminal:input', data);
            }
        });

        // Forward resize events
        termRef.current?.onResize(({ cols, rows }) => {
            if (socket.connected) {
                socket.emit('terminal:resize', { cols, rows });
            }
        });

        // Mark as connected once the first data piece arrives
        socket.once('terminal:data', () => {
            setConnected(true);
            setConnecting(false);
        });
    }, [vmId, containerId, connecting, connected]);

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
        };
    }, []);

    return {
        terminalRef,
        connected,
        connecting,
        connect,
        disconnect,
        clear,
    };
}
