'use strict';

const fs = require('fs');

/**
 * oracle-eth cursor: returns 'latest' when there is no usable file, otherwise the saved
 * block minus 50 so a restart re-reads a small overlap.
 */
function loadEthBlock(file) {
  let block_number = 'latest';
  if (fs.existsSync(file)) {
    const file_contents = fs.readFileSync(file);
    if (file_contents) {
      block_number = parseInt(file_contents);
      if (isNaN(block_number)) {
        block_number = 'latest';
      } else {
        // for fresh start go back 50 blocks
        block_number -= 50;
      }
    }
  }
  return block_number;
}

function saveEthBlock(file, block_num) {
  fs.writeFileSync(file, block_num.toString());
}

/** Block range for the next oracle-eth log query. */
function nextWindow(from_block, latest_block) {
  return {
    to_block: Math.min(from_block + 100, latest_block),
    up_to_date: from_block >= latest_block,
  };
}

/** oracle-eos WAX cursor: persists every block, skipping no-ops and swallowing write errors. */
function createWaxCursor(file, logError = console.error) {
  let lastSaved = 0;

  const load = () => {
    try {
      if (!fs.existsSync(file)) return null;
      const n = parseInt(fs.readFileSync(file, 'utf8').trim(), 10);
      return Number.isFinite(n) && !isNaN(n) ? n : null;
    } catch (_) {
      return null;
    }
  };

  const save = (block_num) => {
    if (!block_num || block_num === lastSaved) return;
    lastSaved = block_num;
    try {
      fs.writeFileSync(file, String(block_num));
    } catch (e) {
      logError(`Failed to save WAX cursor ${block_num}: ${e.message}`);
    }
  };

  return { load, save };
}

/** Where oracle-eos restarts from, given a saved cursor (small rewind for reorg safety). */
function rewindWaxStart(saved) {
  return Math.max(1, saved - 50);
}

module.exports = { loadEthBlock, saveEthBlock, nextWindow, createWaxCursor, rewindWaxStart };
