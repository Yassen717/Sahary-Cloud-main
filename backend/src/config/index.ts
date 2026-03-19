import type { AppConfig } from '../types/config';

const config = require('./index.js') as AppConfig;

export type { AppConfig } from '../types/config';
export default config;
