/**
 * System Health Check
 */
const fs = require('fs');
const path = require('path');

async function checkHealth() {
  console.log('='.repeat(60));
  console.log('SYSTEM HEALTH CHECK');
  console.log('='.repeat(60));

  const checks = [];

  // Check 1: Required directories exist
  const requiredDirs = [
    'agents', 'skills', 'knowledge-bank', 'config', 'src', 'tests', 'logs'
  ];
  
  for (const dir of requiredDirs) {
    const exists = fs.existsSync(path.join(process.cwd(), dir));
    checks.push({ name: `Directory: ${dir}`, status: exists ? 'OK' : 'MISSING' });
  }

  // Check 2: Required files exist
  const requiredFiles = [
    'package.json', '.env', 'agents/agent-base.js', 'agents/orchestrator.js'
  ];
  
  for (const file of requiredFiles) {
    const exists = fs.existsSync(path.join(process.cwd(), file));
    checks.push({ name: `File: ${file}`, status: exists ? 'OK' : 'MISSING' });
  }

  // Check 3: Node modules
  const hasModules = fs.existsSync(path.join(process.cwd(), 'node_modules'));
  checks.push({ name: 'Node modules', status: hasModules ? 'OK' : 'RUN npm install' });

  // Print results
  let healthy = true;
  for (const check of checks) {
    const icon = check.status === 'OK' ? '✓' : '✗';
    console.log(`${icon} ${check.name}: ${check.status}`);
    if (check.status !== 'OK') healthy = false;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`HEALTH STATUS: ${healthy ? 'HEALTHY' : 'ISSUES DETECTED'}`);
  console.log('='.repeat(60));

  return healthy;
}

checkHealth();
