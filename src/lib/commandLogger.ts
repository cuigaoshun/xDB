import { addCommandToConsole } from '@/components/ui/CommandConsole';

type DatabaseType = 'mysql' | 'redis' | 'postgres' | 'sqlite' | 'memcached';

/**
 * 封装命令执行并自动记录到控制台
 * 统一处理成功/失败的日志记录
 */
export async function executeWithLogging<T>(
  databaseType: DatabaseType,
  command: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await fn();
    addCommandToConsole({
      databaseType,
      command,
      duration: Date.now() - startTime,
      success: true
    });
    return result;
  } catch (error) {
    addCommandToConsole({
      databaseType,
      command,
      duration: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
