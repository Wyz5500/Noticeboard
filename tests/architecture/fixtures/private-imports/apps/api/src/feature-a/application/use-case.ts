/** Exercises a same-layer import into another Feature's private application code. */
import type { PrivateUseCase } from '../../feature-b/application/internal-use-case.js';

export type FeatureAUseCase = PrivateUseCase;
