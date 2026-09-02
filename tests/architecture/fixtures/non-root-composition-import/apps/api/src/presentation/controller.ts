/** Exercises composition access from nested code outside the direct API root. */
import { persistenceEntries } from '../feature-b/public/composition/persistence.js';

export const controllerEntries = persistenceEntries;
