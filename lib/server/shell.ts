/**
 * Quotes a value so a POSIX shell treats it as one literal argument.
 *
 * Wrapping text in double quotes is not enough: `$(...)`, backticks and a trailing backslash are still
 * interpreted. Inside single quotes nothing is, except the single quote itself, which is closed, escaped and reopened.
 */
export function shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Console commands are sent one at a time, a line break would start a second command.
 */
export function isSingleLineCommand(value: string): boolean {
    return !/[\r\n\0]/.test(value);
}
