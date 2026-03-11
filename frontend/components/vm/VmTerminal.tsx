'use client';

import { useVmTerminal } from '@/hooks/useVmTerminal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Terminal, Wifi, WifiOff, Eraser, Loader2, AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';

// Import xterm CSS — must be done in a client component
import '@xterm/xterm/css/xterm.css';

interface VmTerminalProps {
    vmId: string;
    containerId?: string | null;
    status: string;
}

export default function VmTerminal({ vmId, containerId, status }: VmTerminalProps) {
    const isRunning = status?.toLowerCase() === 'running';
    const { terminalRef, connected, connecting, connect, disconnect, clear } = useVmTerminal({
        vmId,
        containerId,
        status,
    });

    // Auto-connect when the component mounts and VM is running
    useEffect(() => {
        if (isRunning) {
            connect();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRunning]);

    return (
        <div className="flex flex-col gap-3">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-[#161b22] border border-[#30363d]">
                <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-[#58a6ff]" />
                    <span className="text-sm font-mono text-[#c9d1d9]">
                        {vmId ? `vm:${vmId.slice(0, 8)}` : 'console'}
                    </span>
                    <Badge
                        variant="outline"
                        className={`text-xs px-2 py-0 border ${connected
                                ? 'border-[#3fb950] text-[#3fb950]'
                                : connecting
                                    ? 'border-[#d29922] text-[#d29922]'
                                    : 'border-[#6e7681] text-[#6e7681]'
                            }`}
                    >
                        {connected ? 'connected' : connecting ? 'connecting…' : 'disconnected'}
                    </Badge>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={clear}
                        className="h-7 px-2 text-xs text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]"
                    >
                        <Eraser className="h-3.5 w-3.5 mr-1" />
                        Clear
                    </Button>

                    {connected ? (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={disconnect}
                            className="h-7 px-2 text-xs text-[#ff7b72] hover:text-[#ffa198] hover:bg-[#21262d]"
                        >
                            <WifiOff className="h-3.5 w-3.5 mr-1" />
                            Disconnect
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={connect}
                            disabled={!isRunning || connecting}
                            className="h-7 px-2 text-xs text-[#3fb950] hover:text-[#56d364] hover:bg-[#21262d] disabled:opacity-40"
                        >
                            {connecting ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                                <Wifi className="h-3.5 w-3.5 mr-1" />
                            )}
                            Connect
                        </Button>
                    )}
                </div>
            </div>

            {/* Not-running banner */}
            {!isRunning && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-yellow-950/30 border border-yellow-800/50 text-yellow-400 text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>
                        The VM must be <strong>running</strong> to open a console. Start the VM and
                        then open this tab again.
                    </span>
                </div>
            )}

            {/* xterm mount point */}
            <div
                className="rounded-lg overflow-hidden border border-[#30363d] shadow-[0_0_24px_rgba(88,166,255,0.08)]"
                style={{
                    background: '#0d1117',
                    minHeight: '420px',
                }}
            >
                {/* xterm.js renders into this div */}
                <div
                    ref={terminalRef}
                    className="w-full h-full"
                    style={{ minHeight: '420px', padding: '8px' }}
                />
            </div>
        </div>
    );
}
