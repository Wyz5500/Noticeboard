/** Exercises a forbidden dependency from shared common code back into a Feature. */
import type { FeatureContract } from '../../feature-b/public/contract.js';

export type SharedContract = FeatureContract;
