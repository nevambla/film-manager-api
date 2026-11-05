'use strict';

const db = require('../components/db');

exports.cancelExpiredInvitations = function () {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE reviews
      SET status = 'CANCELLED',
          cancelledAt = datetime('now')
      WHERE status = 'PENDING'
        AND completed = 0
        AND expiresAt IS NOT NULL
        AND datetime(expiresAt) <= datetime('now')
    `;
    db.run(sql, [], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
};