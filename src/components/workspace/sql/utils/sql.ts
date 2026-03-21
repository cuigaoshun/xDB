export function splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let currentStatement = '';
    let inString: string | null = null;
    let inBlockComment = false;
    let inLineComment = false;
    let escape = false;

    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];
        const nextChar = sql[i + 1] || '';

        if (escape) {
            currentStatement += char;
            escape = false;
            continue;
        }

        if (inLineComment) {
            currentStatement += char;
            if (char === '\n') {
                inLineComment = false;
            }
            continue;
        }

        if (inBlockComment) {
            currentStatement += char;
            if (char === '*' && nextChar === '/') {
                currentStatement += nextChar;
                inBlockComment = false;
                i++;
            }
            continue;
        }

        if (inString) {
            currentStatement += char;
            if (char === '\\') {
                escape = true;
            } else if (char === inString) { // Reached the end quote
                inString = null;
            }
            continue;
        }

        // We are exclusively outside of comments and strings here

        if (char === '-' && nextChar === '-') {
            inLineComment = true;
            currentStatement += char;
            continue;
        }

        if (char === '#' && (i === 0 || sql[i - 1] === '\n')) {
            inLineComment = true;
            currentStatement += char;
            continue;
        }

        if (char === '/' && nextChar === '*') {
            inBlockComment = true;
            currentStatement += char;
            continue;
        }

        if (char === "'" || char === '"' || char === '`') {
            inString = char;
            currentStatement += char;
            continue;
        }

        if (char === ';') {
            if (currentStatement.trim().length > 0) {
                statements.push(currentStatement.trim());
            }
            currentStatement = '';
            continue;
        }

        currentStatement += char;
    }

    if (currentStatement.trim().length > 0) {
        statements.push(currentStatement.trim());
    }

    return statements;
}
