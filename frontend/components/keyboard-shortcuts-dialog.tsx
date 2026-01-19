'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Keyboard } from 'lucide-react';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';

const shortcuts = [
  { keys: ['Ctrl', 'K'], description: 'Open search' },
  { keys: ['Ctrl', 'D'], description: 'Go to dashboard' },
  { keys: ['Ctrl', 'P'], description: 'Go to profile' },
  { keys: ['Shift', '?'], description: 'Show keyboard shortcuts' },
  { keys: ['Esc'], description: 'Close modal/dialog' },
  { keys: ['Tab'], description: 'Navigate forward' },
  { keys: ['Shift', 'Tab'], description: 'Navigate backward' },
  { keys: ['Enter'], description: 'Activate button/link' },
  { keys: ['Space'], description: 'Activate button' },
];

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useKeyboardShortcuts([
    {
      key: '?',
      shift: true,
      callback: () => setOpen(true),
      description: 'Show keyboard shortcuts',
    },
  ]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Show keyboard shortcuts"
        title="Keyboard shortcuts (Shift + ?)"
      >
        <Keyboard className="h-5 w-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby="keyboard-shortcuts-description">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
            <DialogDescription id="keyboard-shortcuts-description">
              Use these keyboard shortcuts to navigate faster
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {shortcuts.map((shortcut, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <span className="text-sm text-muted-foreground">
                  {shortcut.description}
                </span>
                <div className="flex gap-1">
                  {shortcut.keys.map((key, keyIndex) => (
                    <kbd
                      key={keyIndex}
                      className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500"
                    >
                      {key}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
