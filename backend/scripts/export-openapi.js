const fs = require('fs');
const path = require('path');

// Skip strict env validation when exporting API contracts for tooling/CI.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const swaggerSpec = require('../src/config/swagger');

const outputDir = path.resolve(__dirname, '../openapi');
const outputFile = path.resolve(outputDir, 'openapi.json');

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(swaggerSpec, null, 2));

console.log(`OpenAPI spec exported to ${outputFile}`);
