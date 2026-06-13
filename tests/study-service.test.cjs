'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { createStudyService } = require('../electron/study-service.cjs')

function createTempStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shici-study-test-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return { dir, store: createStudyService({ userDataDir: dir }) }
}

function delayHours(record) {
  return (new Date(record.nextReviewAt).getTime() - Date.now()) / (60 * 60 * 1000)
}

test('viewing a poem does not count as a review', t => {
  const { store } = createTempStore(t)
  store.markViewed('poem-1', 7)
  store.markViewed('poem-1', 7)

  const record = store.getStudyRecord('poem-1')
  assert.equal(record.reviewCount, 0)
  assert.equal(record.nextReviewAt, undefined)
  assert.equal(record.shard, 7)
})

test('four review grades create distinct learning outcomes', t => {
  const { store } = createTempStore(t)
  const again = store.recordReview('again-poem', 'again')
  const hard = store.recordReview('hard-poem', 'hard')
  const good = store.recordReview('good-poem', 'good')
  const easy = store.recordReview('easy-poem', 'easy')

  assert.ok(delayHours(again) > 0.13 && delayHours(again) < 0.2)
  assert.ok(delayHours(hard) > 11 && delayHours(hard) < 13)
  assert.ok(delayHours(good) > 23 && delayHours(good) < 25)
  assert.ok(delayHours(easy) > 167 && delayHours(easy) < 169)
  assert.equal(again.lapseCount, 1)
  assert.equal(hard.masteryLevel, 1)
  assert.equal(good.masteryLevel, 1)
  assert.equal(easy.masteryLevel, 2)
})

test('review state persists when the service is reopened', t => {
  const { dir, store } = createTempStore(t)
  store.markViewed('poem-2', 3)
  store.recordReview('poem-2', 'good')
  store.toggleFavorite('poem-2')

  const reopened = createStudyService({ userDataDir: dir }).getStudyRecord('poem-2')
  assert.equal(reopened.reviewCount, 1)
  assert.equal(reopened.masteryLevel, 1)
  assert.equal(reopened.favorite, true)
  assert.equal(reopened.shard, 3)
})

test('legacy memorized records keep their mastery during SQLite migration', t => {
  let DatabaseSync
  try {
    ;({ DatabaseSync } = require('node:sqlite'))
  } catch {
    t.skip('node:sqlite is unavailable')
    return
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shici-study-legacy-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const db = new DatabaseSync(path.join(dir, 'study.db'))
  db.exec(`
    CREATE TABLE study_records (
      poem_id TEXT PRIMARY KEY,
      shard INTEGER,
      viewed_at TEXT NOT NULL,
      memorized INTEGER NOT NULL DEFAULT 0,
      review_count INTEGER NOT NULL DEFAULT 0,
      favorite INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `)
  db.prepare(`
    INSERT INTO study_records (poem_id, shard, viewed_at, memorized, review_count, favorite, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('legacy-poem', 1, new Date().toISOString(), 1, 2, 0, new Date().toISOString())
  db.close()

  const record = createStudyService({ userDataDir: dir }).getStudyRecord('legacy-poem')
  assert.equal(record.memorized, true)
  assert.equal(record.masteryLevel, 4)
  assert.equal(record.nextReviewAt, undefined)
})
