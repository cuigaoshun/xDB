import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal, Send, ChevronUp, ChevronDown, TerminalSquare } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useConsoleStore, CommandEntry } from '@/store/useConsoleStore';
import { useAppStore } from '@/store/useAppStore';
import { invoke } from '@tauri-apps/api/core';

interface CommandConsoleProps {
  className?: string;
  style?: React.CSSProperties;
}

interface RedisResult {
  output: any;
}

export function CommandConsole({ className = '', style }: CommandConsoleProps) {
  const { t } = useTranslation();
  const { commands, clearCommands, addCommand } = useConsoleStore();
  const [maxHeight, setMaxHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showInput, setShowInput] = useState(false);

  // Get current active tab info
  const tabs = useAppStore(state => state.tabs);
  const activeTabId = useAppStore(state => state.activeTabId);
  const connections = useAppStore(state => state.connections);

  const activeTab = activeTabId ? tabs.find(t => t.id === activeTabId) : null;
  const activeConnection = activeTab ? connections.find(c => c.id === activeTab.connectionId) : null;

  // Determine db for Redis
  const redisDb = activeTab?.redisDbInfo?.db ?? 0;

  // Copy command to clipboard
  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
  };

  // Auto scroll to bottom when new command is added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [commands]);

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

  const executeCommand = useCallback(async () => {
    if (!inputValue.trim() || isExecuting) return;

    const commandStr = inputValue.trim();
    setInputValue('');
    setHistoryIndex(-1);

    // Add to history
    setCommandHistory(prev => {
      const newHistory = [commandStr, ...prev.filter(h => h !== commandStr)].slice(0, 50);
      return newHistory;
    });

    // Check if we have an active Redis connection
    if (!activeConnection || activeConnection.db_type !== 'redis') {
      addCommand({
        databaseType: 'redis',
        command: commandStr,
        success: false,
        error: t('console.noRedisConnection', 'No active Redis connection. Please select a Redis tab first.')
      });
      return;
    }

    const startTime = Date.now();
    setIsExecuting(true);

    try {
      // Parse the command
      const parts = commandStr.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      if (parts.length === 0) return;

      const command = parts[0].toUpperCase();
      const args = parts.slice(1).map(p => p.replace(/^"|"$/g, '')); // Remove quotes

      const result = await invoke<RedisResult>('execute_redis_command', {
        connectionId: activeConnection.id,
        command,
        args,
        db: redisDb,
      });

      // Format the result for display
      let resultStr: string;
      if (result.output === null) {
        resultStr = '(nil)';
      } else if (typeof result.output === 'object') {
        resultStr = JSON.stringify(result.output, null, 2);
      } else {
        resultStr = String(result.output);
      }

      addCommand({
        databaseType: 'redis',
        command: commandStr,
        duration: Date.now() - startTime,
        success: true,
        result: resultStr
      });
    } catch (error) {
      addCommand({
        databaseType: 'redis',
        command: commandStr,
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsExecuting(false);
      inputRef.current?.focus();
    }
  }, [inputValue, isExecuting, activeConnection, redisDb, addCommand, t]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      executeCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputValue('');
      }
    }
  };

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
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }) + '.' + d.getMilliseconds().toString().padStart(3, '0');
  };

  return (
    <div className={`h-full bg-background border text-foreground font-mono text-xs flex flex-col ${className}`} style={style}>
      {/* Resize handle */}
      <div
        className="h-1 bg-border cursor-ns-resize hover:bg-primary transition-colors shrink-0"
        onMouseDown={() => setIsResizing(true)}
      />

      {/* Console header */}
      <div className="flex items-center justify-between px-3 py-1 border-b bg-muted shrink-0">
        <div className="flex items-center gap-2">
          {activeConnection && activeConnection.db_type === 'redis' && (
            <Button
              variant="ghost"
              size="icon"
              className={`h-5 w-5 ${showInput ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={() => setShowInput(!showInput)}
              title={t('console.toggleInput', 'Toggle command input')}
            >
              <TerminalSquare className="h-3 w-3" />
            </Button>
          )}
          <Terminal className="w-3 h-3 text-primary" />
          <span className="text-foreground font-medium">{t('common.terminal', 'Command Console')}</span>
          <span className="text-muted-foreground">
            [{commands.length}]
          </span>
          {activeConnection && activeConnection.db_type === 'redis' && (
            <span className="text-xs text-green-600 dark:text-green-400">
              {activeConnection.name} (DB {redisDb})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearCommands}
            className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10 rounded transition-colors"
          >
            {t('common.clear', 'Clear')}
          </button>
        </div>
      </div>

      {/* Console content */}
      <ScrollArea
        className="flex-1 bg-background min-h-0"
        style={{
          height: showInput && activeConnection && activeConnection.db_type === 'redis'
            ? `${maxHeight - 70}px`
            : `${maxHeight - 30}px`,
          maxHeight: showInput && activeConnection && activeConnection.db_type === 'redis'
            ? `${maxHeight - 70}px`
            : `${maxHeight - 30}px`
        }}
      >
        <div ref={scrollRef} className="p-2 space-y-1">
          {commands.length === 0 ? (
            <div className="text-muted-foreground text-sm py-2">
              {t('common.noCommands', 'No commands executed yet...')}
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
                    {t('common.copy', 'Copy')}
                  </button>
                </div>
                <div className="text-foreground break-all">
                  $ {cmd.command}
                </div>
                {cmd.result && (
                  <div className="text-green-600 dark:text-green-400 text-xs mt-1 whitespace-pre-wrap break-all">
                    {cmd.result}
                  </div>
                )}
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

      {/* Command input - only show for Redis connections when toggled */}
      {showInput && activeConnection && activeConnection.db_type === 'redis' && (
        <div className="flex items-center gap-2 p-2 border-t bg-muted/30 shrink-0">
          <span className="text-muted-foreground">$</span>
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('console.enterRedisCommand', 'Enter Redis command... (e.g., GET key, SET key value)')}
            className="flex-1 h-7 text-xs font-mono bg-background"
            disabled={isExecuting}
          />
          <div className="flex items-center gap-1 text-muted-foreground">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
                  const newIndex = historyIndex + 1;
                  setHistoryIndex(newIndex);
                  setInputValue(commandHistory[newIndex]);
                }
              }}
              disabled={commandHistory.length === 0}
              title={t('console.previousCommand', 'Previous command')}
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                if (historyIndex > 0) {
                  const newIndex = historyIndex - 1;
                  setHistoryIndex(newIndex);
                  setInputValue(commandHistory[newIndex]);
                } else if (historyIndex === 0) {
                  setHistoryIndex(-1);
                  setInputValue('');
                }
              }}
              disabled={historyIndex < 0}
              title={t('console.nextCommand', 'Next command')}
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>
          <Button
            size="sm"
            className="h-7 px-3 gap-1"
            onClick={executeCommand}
            disabled={isExecuting || !inputValue.trim()}
          >
            <Send className="h-3 w-3" />
            {isExecuting ? t('console.executing', 'Executing...') : t('console.execute', 'Execute')}
          </Button>
        </div>
      )}
    </div>
  );
}

// Global helper function
export const addCommandToConsole = (entry: Omit<CommandEntry, 'id' | 'timestamp'>) => {
  useConsoleStore.getState().addCommand(entry);
};
