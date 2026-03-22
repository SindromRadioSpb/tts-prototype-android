#!/usr/bin/env node
/**
 * db/backfill-hebrew-norm.js
 * Backfill he_norm column for existing sentences
 * Run after migration 009_hebrew_norm.sql
 * 
 * Usage: node db/backfill-hebrew-norm.js
 */

"use strict";

const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { normalizeHebrew } = require("./hebrewNorm");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "app.db");

function runQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function runUpdate(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

async function main() {
  console.log("[backfill-hebrew-norm] Starting...");
  console.log("[backfill-hebrew-norm] DB:", DB_PATH);
  
  const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE);
  
  try {
    // Get sentences without he_norm
    const rows = await runQuery(db, `
      SELECT id, he_plain, he_niqqud 
      FROM sentences 
      WHERE he_norm IS NULL
    `);
    
    console.log(`[backfill-hebrew-norm] Found ${rows.length} sentences to process`);
    
    if (rows.length === 0) {
      console.log("[backfill-hebrew-norm] Nothing to do");
      return;
    }
    
    let processed = 0;
    let errors = 0;
    
    for (const row of rows) {
      try {
        // Prefer he_niqqud (has vowel points), fallback to he_plain
        const source = row.he_niqqud || row.he_plain || "";
        const normalized = normalizeHebrew(source);
        
        await runUpdate(db, `UPDATE sentences SET he_norm = ? WHERE id = ?`, [normalized, row.id]);
        processed++;
        
        if (processed % 100 === 0) {
          console.log(`[backfill-hebrew-norm] Processed ${processed}/${rows.length}`);
        }
      } catch (e) {
        console.error(`[backfill-hebrew-norm] Error on ${row.id}:`, e.message);
        errors++;
      }
    }
    
    console.log(`[backfill-hebrew-norm] Done: ${processed} updated, ${errors} errors`);
  } finally {
    db.close();
  }
}

main().catch(e => {
  console.error("[backfill-hebrew-norm] Fatal error:", e);
  process.exit(1);
});
