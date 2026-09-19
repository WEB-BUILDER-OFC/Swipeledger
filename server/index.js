'use strict';

// Load .env first (no-op in production where env vars are set externally)
require('dotenv').config();

// Validate all required environment variables before anything else
const { validateEnv } = require('./config/env');
validateEnv();

const mongoose = require('mongoose');
const connectDB = require('./config/db');
const app = require('./app');
const logger = require('./utils/logger');

// Models are loaded when app.js is required above. We reference them here
// for the startup index migration and the one-time dedup migration.
const Account = require('./models/Account');
const Session = require('./models/Session');
const Device  = require('./models/Device');

let server;

// ── One-time dedup migration ──────────────────────────────────────────────────
/**
 * Remove duplicate mobileNumber Account records so the unique index can be built.
 *
 * WHEN IT RUNS
 *   Only when the environment variable DEDUP_MOBILE_MIGRATION=1 is set.
 *   Set this in the Render dashboard → Environment, save (auto-redeploys),
 *   then remove it after the cleanup succeeds and re-save to redeploy cleanly.
 *
 * WHAT IT DOES
 *   For every non-null mobileNumber that appears in more than one Account:
 *     • Keeps the newest document (highest createdAt).
 *     • Deletes all older duplicates.
 *     • Also deletes those accounts' Device and Session records (orphaned).
 *   Accounts with mobileNumber: null are never touched.
 *
 * SAFETY
 *   • Opt-in only — never runs without the explicit env var.
 *   • Idempotent — safe to run again once duplicates are gone (no-op).
 *   • Non-fatal — if it fails, logs clearly and continues; migrateIndexes()
 *     will then also fail and log that uniqueness is absent.
 *   • Throws to signal failure so the caller can log appropriately.
 *
 * ACCIDENTAL EXECUTION PREVENTION
 *   process.env.DEDUP_MOBILE_MIGRATION must be exactly the string '1'.
 *   Any other value (missing, 'true', 'yes', '0') is ignored.
 */
async function runDedupMigration() {
  logger.info('[dedup] Starting one-time mobileNumber dedup — triggered by DEDUP_MOBILE_MIGRATION=1');

  // Find every non-null mobileNumber that appears more than once
  const groups = await Account.aggregate([
    { $match: { mobileNumber: { $type: 'string' } } },
    {
      $group: {
        _id:   '$mobileNumber',
        count: { $sum: 1 },
        docs:  { $push: { id: '$_id', businessName: '$businessName', accountCode: '$accountCode', createdAt: '$createdAt' } },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort:  { count: -1 } },
  ]);

  if (groups.length === 0) {
    logger.info('[dedup] No duplicate mobileNumber records found — nothing to delete.');
    return;
  }

  logger.info('[dedup] Duplicate mobileNumber groups found', { count: groups.length });

  const toDelete = [];
  for (const group of groups) {
    const sorted = [...group.docs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const keep   = sorted[0];
    const remove = sorted.slice(1);

    logger.info('[dedup] KEEP',   { mobileNumber: group._id, accountId: keep.id,   businessName: keep.businessName,   accountCode: keep.accountCode });
    for (const doc of remove) {
      logger.info('[dedup] DELETE', { mobileNumber: group._id, accountId: doc.id,    businessName: doc.businessName,    accountCode: doc.accountCode });
      toDelete.push(doc.id);
    }
  }

  // Delete accounts + their orphaned Device and Session records atomically per model
  const [accountDel, deviceDel, sessionDel] = await Promise.all([
    Account.deleteMany({ _id:       { $in: toDelete } }),
    Device .deleteMany({ accountId: { $in: toDelete } }),
    Session.deleteMany({ accountId: { $in: toDelete } }),
  ]);

  logger.info('[dedup] Deleted', {
    accounts: accountDel.deletedCount,
    devices:  deviceDel .deletedCount,
    sessions: sessionDel.deletedCount,
  });

  // Verify zero duplicates remain — throw if any are still present
  const remaining = await Account.aggregate([
    { $match: { mobileNumber: { $type: 'string' } } },
    { $group: { _id: '$mobileNumber', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  if (remaining.length > 0) {
    throw new Error(
      `[dedup] FAILED: ${remaining.length} duplicate group(s) still present after cleanup. ` +
      'Manual investigation required before the unique index can be created.',
    );
  }

  logger.info('[dedup] Verified: zero duplicate non-null mobileNumber records remain.');
  logger.info('[dedup] Next: migrateIndexes() will now create the unique mobileNumber_1 index.');
}

// ── Index migration ───────────────────────────────────────────────────────────
/**
 * Ensure the mobileNumber_1 index has the correct uniqueness constraint.
 *
 * ROOT CAUSE (F-2 production failure):
 *   Changing a Mongoose schema index definition does NOT automatically update an
 *   existing MongoDB index. When we added `unique: true` and `partialFilterExpression`
 *   to the schema, Mongoose called createIndex() on startup — but MongoDB rejected it
 *   because an index named `mobileNumber_1` already existed with different options
 *   (sparse: true, no unique). Mongoose swallowed the error and the old non-unique
 *   index survived untouched, allowing duplicate mobile numbers.
 *
 * Fix:
 *   Explicitly drop the old index if it exists without unique:true, then call
 *   Account.createIndexes() so Mongoose creates the correct one from the schema.
 *   This function is idempotent — subsequent runs find the correct index and exit
 *   immediately without making any changes.
 */
async function migrateIndexes() {
  try {
    const existing  = await Account.collection.indexes().catch(() => []);
    const mobileIdx = existing.find((idx) => idx.name === 'mobileNumber_1');

    if (mobileIdx && !mobileIdx.unique) {
      await Account.collection.dropIndex('mobileNumber_1');
      logger.info('[startup] Dropped stale non-unique mobileNumber_1 index — will recreate');
    }
  } catch (err) {
    logger.warn('[startup] mobileNumber index migration warning', { message: err.message });
  }

  let indexesOk = true;

  await Account.createIndexes().catch((err) => {
    indexesOk = false;
    logger.error(
      '[startup] Account.createIndexes() FAILED — mobileNumber uniqueness is NOT enforced',
      {
        message: err.message,
        action:  'Set DEDUP_MOBILE_MIGRATION=1 in Render env vars, save (redeploys), then remove it.',
      },
    );
  });

  if (indexesOk) {
    logger.info('[startup] Account indexes verified');
  } else {
    logger.error(
      '[startup] CRITICAL: mobileNumber unique index absent. ' +
      'Duplicate mobile registrations will succeed until DEDUP_MOBILE_MIGRATION=1 is set and the server redeployed.',
    );
  }
}

// ── Server startup ────────────────────────────────────────────────────────────
async function start() {
  try {
    await connectDB();

    // One-time dedup: only when DEDUP_MOBILE_MIGRATION=1 is set in the environment.
    // Set this in Render dashboard → Environment → Add DEDUP_MOBILE_MIGRATION=1 → Save.
    // After the cleanup succeeds, remove the var and save again (triggers a clean redeploy).
    let dedupOk = true;

    if (process.env.DEDUP_MOBILE_MIGRATION === '1') {
      await runDedupMigration().catch((err) => {
        dedupOk = false;
        logger.error('[dedup] Dedup migration failed — migrateIndexes() will be skipped', {
          message: err.message,
          action:  'Investigate the failure, resolve the duplicates, and redeploy.',
        });
      });
    }

    // Only run migrateIndexes() when dedup either was not needed or succeeded.
    // If dedup failed, duplicates still exist; createIndexes() would fail again with
    // E11000 and produce a misleading second error. Skip it and log the real cause.
    if (dedupOk) {
      await migrateIndexes();
    } else {
      logger.error(
        '[startup] Index migration skipped — dedup failed. ' +
        'Unique mobileNumber constraint is absent. Resolve the dedup failure and redeploy.',
      );
    }

    const PORT = parseInt(process.env.PORT || '10000', 10);
    server = app.listen(PORT, () => {
      logger.info('SwipeLedger API running', {
        port: PORT,
        env:  process.env.NODE_ENV,
        pid:  process.pid,
      });
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

/**
 * Graceful shutdown.
 * Render (and most PaaS hosts) send SIGTERM before killing the process.
 * Stop accepting new connections, wait for in-flight requests to complete,
 * then close the MongoDB connection before exiting.
 */
function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');
      try {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
      } catch (err) {
        logger.error('Error closing MongoDB connection', { error: err.message });
      }
      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long (10 s)
    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Handle unhandled rejections — log and exit cleanly
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
  process.exit(1);
});

start();
