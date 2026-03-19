type EnvValidationModule = {
  validateEnv: () => Record<string, unknown>;
  printEnvSummary: () => void;
  envSchema: unknown;
};

const envValidation = require('./env.validation.js') as EnvValidationModule;

export const validateEnv = envValidation.validateEnv;
export const printEnvSummary = envValidation.printEnvSummary;
export const envSchema = envValidation.envSchema;

export default envValidation;
