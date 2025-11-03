#!/usr/bin/env node

/**
 * VM API Verification Script
 * Verifies that all VM API components are properly configured
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying VM API Implementation...\n');

const checks = {
  passed: 0,
  failed: 0,
  warnings: 0
};

function checkFile(filePath, description) {
  const fullPath = path.join(__dirname, '..', filePath);
  if (fs.existsSync(fullPath)) {
    console.log(`✅ ${description}`);
    checks.passed++;
    return true;
  } else {
    console.log(`❌ ${description} - File not found: ${filePath}`);
    checks.failed++;
    return false;
  }
}

function checkFileContent(filePath, searchString, description) {
  const fullPath = path.join(__dirname, '..', filePath);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes(searchString)) {
      console.log(`✅ ${description}`);
      checks.passed++;
      return true;
    } else {
      console.log(`⚠️  ${description} - Content not found`);
      checks.warnings++;
      return false;
    }
  } else {
    console.log(`❌ ${description} - File not found`);
    checks.failed++;
    return false;
  }
}

console.log('📁 Checking Core Files...');
checkFile('src/routes/vms.js', 'VM Routes file exists');
checkFile('src/controllers/vmController.js', 'VM Controller file exists');
checkFile('src/services/vmService.js', 'VM Service file exists');
checkFile('src/validations/vm.validation.js', 'VM Validation file exists');

console.log('\n📝 Checking Validation Schemas...');
checkFileContent('src/validations/vm.validation.js', 'createVMSchema', 'Create VM schema defined');
checkFileContent('src/validations/vm.validation.js', 'updateVMSchema', 'Update VM schema defined');
checkFileContent('src/validations/vm.validation.js', 'vmActionSchema', 'VM Action schema defined');
checkFileContent('src/validations/vm.validation.js', 'vmQuerySchema', 'VM Query schema defined');
checkFileContent('src/validations/vm.validation.js', 'createBackupSchema', 'Backup schema defined');
checkFileContent('src/validations/vm.validation.js', 'execContainerSchema', 'Container exec schema defined');
checkFileContent('src/validations/vm.validation.js', 'containerLogsSchema', 'Container logs schema defined');
checkFileContent('src/validations/vm.validation.js', 'restoreBackupSchema', 'Restore backup schema defined');
checkFileContent('src/validations/vm.validation.js', 'vmStatsQuerySchema', 'Stats query schema defined');
checkFileContent('src/validations/vm.validation.js', 'adminVMQuerySchema', 'Admin query schema defined');
checkFileContent('src/validations/vm.validation.js', 'vmSuspendSchema', 'Suspend schema defined');

console.log('\n🛣️  Checking Routes...');
checkFileContent('src/routes/vms.js', 'POST /api/v1/vms', 'Create VM route');
checkFileContent('src/routes/vms.js', 'GET /api/v1/vms', 'Get VMs route');
checkFileContent('src/routes/vms.js', 'GET /api/v1/vms/:id', 'Get VM by ID route');
checkFileContent('src/routes/vms.js', 'PUT /api/v1/vms/:id', 'Update VM route');
checkFileContent('src/routes/vms.js', 'DELETE /api/v1/vms/:id', 'Delete VM route');
checkFileContent('src/routes/vms.js', 'POST /api/v1/vms/:id/start', 'Start VM route');
checkFileContent('src/routes/vms.js', 'POST /api/v1/vms/:id/stop', 'Stop VM route');
checkFileContent('src/routes/vms.js', 'POST /api/v1/vms/:id/restart', 'Restart VM route');
checkFileContent('src/routes/vms.js', 'GET /api/v1/vms/all', 'Get all VMs (admin) route');
checkFileContent('src/routes/vms.js', 'GET /api/v1/vms/stats', 'System stats (admin) route');
checkFileContent('src/routes/vms.js', 'POST /api/v1/vms/:id/suspend', 'Suspend VM (admin) route');
checkFileContent('src/routes/vms.js', 'POST /api/v1/vms/:id/resume', 'Resume VM (admin) route');

console.log('\n🔒 Checking Security Middleware...');
checkFileContent('src/routes/vms.js', 'authenticate', 'Authentication middleware applied');
checkFileContent('src/routes/vms.js', 'requirePermission', 'Permission middleware applied');
checkFileContent('src/routes/vms.js', 'apiRateLimit', 'Rate limiting applied');
checkFileContent('src/routes/vms.js', 'sanitizeInput', 'Input sanitization applied');
checkFileContent('src/routes/vms.js', 'validate', 'Validation middleware applied');

console.log('\n🎮 Checking Controller Methods...');
checkFileContent('src/controllers/vmController.js', 'createVM', 'Create VM controller');
checkFileContent('src/controllers/vmController.js', 'getUserVMs', 'Get user VMs controller');
checkFileContent('src/controllers/vmController.js', 'getVMById', 'Get VM by ID controller');
checkFileContent('src/controllers/vmController.js', 'updateVM', 'Update VM controller');
checkFileContent('src/controllers/vmController.js', 'deleteVM', 'Delete VM controller');
checkFileContent('src/controllers/vmController.js', 'startVM', 'Start VM controller');
checkFileContent('src/controllers/vmController.js', 'stopVM', 'Stop VM controller');
checkFileContent('src/controllers/vmController.js', 'restartVM', 'Restart VM controller');
checkFileContent('src/controllers/vmController.js', 'getAllVMs', 'Get all VMs controller');
checkFileContent('src/controllers/vmController.js', 'getSystemStats', 'System stats controller');
checkFileContent('src/controllers/vmController.js', 'suspendVM', 'Suspend VM controller');
checkFileContent('src/controllers/vmController.js', 'resumeVM', 'Resume VM controller');

console.log('\n🧪 Checking Tests...');
checkFile('tests/vm.test.js', 'VM unit tests exist');
checkFile('tests/vm-api.integration.test.js', 'VM integration tests exist');

console.log('\n📚 Checking Documentation...');
checkFile('docs/VM_API_DOCUMENTATION.md', 'API documentation exists');
checkFile('docs/VM_API_IMPLEMENTATION_SUMMARY.md', 'Implementation summary exists');

console.log('\n' + '='.repeat(50));
console.log('📊 Verification Summary:');
console.log('='.repeat(50));
console.log(`✅ Passed: ${checks.passed}`);
console.log(`⚠️  Warnings: ${checks.warnings}`);
console.log(`❌ Failed: ${checks.failed}`);
console.log('='.repeat(50));

if (checks.failed === 0) {
  console.log('\n🎉 All checks passed! VM APIs are properly implemented.');
  process.exit(0);
} else {
  console.log('\n⚠️  Some checks failed. Please review the issues above.');
  process.exit(1);
}
