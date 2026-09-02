/** Exercises a same-layer import into another Feature's private infrastructure code. */
import { privateAdapter } from '../../feature-b/infrastructure/adapter.js';

export const featureAAdapter = privateAdapter;
