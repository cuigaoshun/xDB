export function formatLocalTimestamp(value: Date | number | string, options: { milliseconds?: boolean } = {}): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const timestamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-') + ' ' + [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0')
  ].join(':');

  return options.milliseconds
    ? `${timestamp}.${String(date.getMilliseconds()).padStart(3, '0')}`
    : timestamp;
}

export function formatMysqlDateTime(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const date = new Date(hasTimezone ? normalized : `${normalized}Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return formatLocalTimestamp(date);
}
