/**
 * Global console initialization
 * Import this file early in your application to enable enhanced console logging
 */

import { initializeConsole } from '@/lib/utils/console';
import '@/lib/console-config'; // Apply file-specific logging rules

// Initialize the enhanced console functionality
initializeConsole();

export * from '@/lib/utils/console';
export * from '@/lib/console-config';
