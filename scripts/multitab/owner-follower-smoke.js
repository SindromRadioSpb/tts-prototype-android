// Compatibility entry point: the former owner/follower architecture has been retired.
'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const script of ['operation-lease-smoke.js', 'studio-surfaces-smoke.js']) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) { process.exitCode = 1; break; }
}
