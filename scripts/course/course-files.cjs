'use strict';
const fs = require('node:fs');
const path = require('node:path');
function assertPlainDirectories(target) {
  const absolute = path.resolve(target);
  const parent = path.dirname(absolute);
  if (parent !== absolute) assertPlainDirectories(parent);
  const stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
  if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) {
    throw new Error('Output path must contain only real directories (no links or junctions): ' + absolute);
  }
}

module.exports = { assertPlainDirectories };
