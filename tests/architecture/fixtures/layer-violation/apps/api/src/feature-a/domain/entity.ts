/** Exercises the existing reverse dependency from Domain to Application. */
import { applicationValue } from '../application/use-case.js';

export const domainValue = applicationValue;
