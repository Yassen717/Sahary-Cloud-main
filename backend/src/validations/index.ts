import type { ValidationRegistry } from '../types/validation';

const validations = require('./index.js') as ValidationRegistry;

export type { ValidationRegistry } from '../types/validation';
export default validations;
