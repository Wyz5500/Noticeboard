/** Exercises forbidden direct root access to private Feature implementation. */
import { privateAdapter } from './feature-b/infrastructure/adapter.js';

export const applicationAdapter = privateAdapter;
