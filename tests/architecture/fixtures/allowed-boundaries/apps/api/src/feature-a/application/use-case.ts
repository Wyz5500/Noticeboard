/** Uses another Feature only through public API and common through its shared contract. */
import type { SharedContract } from '../../common/application/shared.js';
import type { FeatureContract } from '../../feature-b/public/contract.js';

export interface FeatureAResult extends SharedContract, FeatureContract {}
