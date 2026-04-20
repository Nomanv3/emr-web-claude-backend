'use strict';
// state.cjs — Read/write _state.json progress log

const fs   = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', '_state.json');

function readState() {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * recordTable(name, { mongoCount, mysqlCount, ok, lastRun })
 * Merges the result for one table into _state.json.
 */
function recordTable(name, info) {
  const state = readState();
  state[name] = { ...info };
  writeState(state);
}

/**
 * getTable(name) → { mongoCount, mysqlCount, ok, lastRun } | undefined
 */
function getTable(name) {
  return readState()[name];
}

module.exports = { recordTable, getTable, readState };
