import { create } from 'zustand';

export interface CommandEntry {
  id: string;
  timestamp: Date;
  databaseType: 'mysql' | 'redis' | 'postgres' | 'sqlite' | 'memcached';
  command: string;
  duration?: number;
  success?: boolean;
  error?: string;
  result?: string;  // Command execution result
}

interface ConsoleState {
  commands: CommandEntry[];
  addCommand: (entry: Omit<CommandEntry, 'id' | 'timestamp'>) => void;
  clearCommands: () => void;
}

export const useConsoleStore = create<ConsoleState>((set) => ({
  commands: [],
  addCommand: (entry) => set((state) => {
    const newCommand: CommandEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
    };
    // 倒序排列：最新的放在数组最前面，并限制最大数量为 100
    return { commands: [newCommand, ...state.commands].slice(0, 100) };
  }),
  clearCommands: () => set({ commands: [] }),
}));
