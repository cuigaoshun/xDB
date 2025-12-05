import { useState, useEffect } from 'react';
import { Terminal } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useConsoleStore, CommandEntry } from '@/store/useConsoleStore';

interface CommandConsoleProps {
  className?: string;
  style?: React.CSSProperties;
}

export function CommandConsole({ className = '', style }: CommandConsoleProps) {
  const { commands, clearCommands } = useConsoleStore();
  const [maxHeight, setMaxHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);

  // Copy command to clipboard
  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
  };

  // Handle resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const newHeight = window.innerHeight - e.clientY;
      setMaxHeight(Math.max(200, Math.min(600, newHeight)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const getDatabaseColor = (type: string) => {
    switch (type) {
      case 'mysql': return 'bg-blue-500/20 text-blue-600 border-blue-500/30 dark:bg-blue-400/20 dark:text-blue-400 dark:border-blue-400/30';
      case 'redis': return 'bg-red-500/20 text-red-600 border-red-500/30 dark:bg-red-400/20 dark:text-red-400 dark:border-red-400/30';
      case 'postgres': return 'bg-indigo-500/20 text-indigo-600 border-indigo-500/30 dark:bg-indigo-400/20 dark:text-indigo-400 dark:border-indigo-400/30';
      case 'sqlite': return 'bg-green-500/20 text-green-600 border-green-500/30 dark:bg-green-400/20 dark:text-green-400 dark:border-green-400/30';
      case 'memcached': return 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30 dark:bg-yellow-400/20 dark:text-yellow-400 dark:border-yellow-400/30';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const formatTimestamp = (date: Date) => {
    // date might be a string if rehydrated from JSON, ensure it is Date
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString('zh-CN', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }) + '.' + d.getMilliseconds().toString().padStart(3, '0');
  };

  return (
    <div className={`h-full bg-background border text-foreground font-mono text-xs ${className}`} style={style}>
      {/* Resize handle */}
      <div 
        className="h-1 bg-border cursor-ns-resize hover:bg-primary transition-colors"
        onMouseDown={() => setIsResizing(true)}
      />
      
      {/* Console header */}
      <div className="flex items-center justify-between px-3 py-1 border-b bg-muted">
        <div className="flex items-center gap-2">
          <Terminal className="w-3 h-3 text-primary" />
          <span className="text-foreground font-medium">Command Console</span>
          <span className="text-muted-foreground">
            [{commands.length}]
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearCommands}
            className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10 rounded transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Console content */}
      <ScrollArea 
        className="h-full bg-background" 
        style={{ height: `${maxHeight - 30}px`, maxHeight: `${maxHeight - 30}px` }}
      >
        <div className="p-2 space-y-1">
          {commands.length === 0 ? (
            <div className="text-muted-foreground text-sm py-2">
              No commands executed yet...
            </div>
          ) : (
            commands.map((cmd) => (
              <div key={cmd.id} className="border-b border-border pb-1">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className={`px-1 py-0.5 rounded text-[10px] ${getDatabaseColor(cmd.databaseType)}`}>
                      {cmd.databaseType.toUpperCase()}
                    </span>
                    <span>
                      [{formatTimestamp(cmd.timestamp)}]
                    </span>
                    {cmd.duration && (
                      <span>
                        {cmd.duration}ms
                      </span>
                    )}
                    {cmd.success === false && (
                      <span className="text-destructive">
                        ERROR
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => copyCommand(cmd.command)}
                    className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <div className="text-foreground break-all">
                  $ {cmd.command}
                </div>
                {cmd.error && (
                  <div className="text-destructive text-xs mt-1 italic">
                    Error: {cmd.error}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Global helper function
export const addCommandToConsole = (entry: Omit<CommandEntry, 'id' | 'timestamp'>) => {
  useConsoleStore.getState().addCommand(entry);
};
