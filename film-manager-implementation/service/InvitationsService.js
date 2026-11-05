'use strict';

const db = require('../components/db');
const serviceUtils = require('../utils/serviceUtils.js');
const ExpirationService = require('./ExpirationService');

const ALLOWED_STATUSES = new Set(['PENDING', 'ACCEPTED', 'CANCELLED']);
const DEFAULT_EXPIRES_VALUE = '9999-12-31 23:59:59';

function parseStatuses(statusQuery, { allowCancelled }) {
  if (statusQuery === undefined) return null;

  if (typeof statusQuery !== 'string' || statusQuery.trim() === '') {
    throw new Error('INVALID_STATUS');
  }

  // normalized array of uppercase values
  const statuses = statusQuery
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length > 0);

  if (statuses.length === 0) throw new Error('INVALID_STATUS');

  for (const s of statuses) {
    if (!ALLOWED_STATUSES.has(s)) throw new Error('INVALID_STATUS');
    if (!allowCancelled && s === 'CANCELLED') throw new Error('INVALID_STATUS');
  }

  return statuses;
}

// helper function
function buildInvitationsQuery({ filmId, reviewerId, statuses, expiresAfter, expiresBefore, onlyPending, includeCompleted = false, acceptedAfter, acceptedBefore, cancelledAfter, cancelledBefore }) {
  let sql = `
    SELECT filmId, reviewerId, status, expiresAt, acceptedAt, cancelledAt, completed
    FROM reviews
    WHERE 1=1
  `;
  const params = [];

  if (filmId !== undefined && filmId !== null) {
    sql += ' AND filmId = ?';
    params.push(filmId);
  }

  if (reviewerId !== undefined && reviewerId !== null) {
    sql += ' AND reviewerId = ?';
    params.push(reviewerId);
  }

  if (onlyPending) {
    sql += " AND status = 'PENDING'";
  } else if (statuses && statuses.length) {
    sql += ` AND status IN (${statuses.map(() => '?').join(',')})`;
    params.push(...statuses);
  }

  if (!includeCompleted) {
    sql += ' AND completed = 0';
    }

  if (expiresAfter) {
    sql += ' AND expiresAt IS NOT NULL AND datetime(expiresAt) >= datetime(?)';
    params.push(expiresAfter);
  }
  if (expiresBefore) {
    sql += ' AND expiresAt IS NOT NULL AND datetime(expiresAt) <= datetime(?)';
    params.push(expiresBefore);
  }
  if (acceptedAfter) {
  sql += ' AND acceptedAt IS NOT NULL AND datetime(acceptedAt) >= datetime(?)';
  params.push(acceptedAfter);
  }
  if (acceptedBefore) {
    sql += ' AND acceptedAt IS NOT NULL AND datetime(acceptedAt) <= datetime(?)';
    params.push(acceptedBefore);
  }
  if (cancelledAfter) {
    sql += ' AND cancelledAt IS NOT NULL AND datetime(cancelledAt) >= datetime(?)';
    params.push(cancelledAfter);
  }
  if (cancelledBefore) {
    sql += ' AND cancelledAt IS NOT NULL AND datetime(cancelledAt) <= datetime(?)';
    params.push(cancelledBefore);
  }

  sql += " ORDER BY CASE status WHEN 'PENDING' THEN 0 WHEN 'ACCEPTED' THEN 1 ELSE 2 END, reviewerId";

  return { sql, params };
}


/**
 * OWNER: list invitations for a film (status filter can include CANCELLED)
 */
exports.getInvitationsForOwner = function (filmId, ownerId, opts = {}) {
  const { status, pageNo, includeCompleted, expiresAfter, expiresBefore, acceptedAfter, acceptedBefore, cancelledAfter, cancelledBefore } = opts;

  return new Promise((resolve, reject) => {
    const sqlCheck = 'SELECT owner, private FROM films WHERE id = ?';
    db.get(sqlCheck, [filmId], (err, film) => {
      if (err) return reject(err);
      if (!film) return reject('NO_FILMS');
      if (film.private === 1) return reject('NO_PUBLIC_FILM');
      if (Number(film.owner) !== Number(ownerId)) return reject('USER_NOT_OWNER');

      let statuses = null;
      if (status !== undefined) {
        try {
          statuses = parseStatuses(status, { allowCancelled: true });
        } catch (e) {
          return reject(e.message);
        }
      }

      ExpirationService.cancelExpiredInvitations()
        .then(() => {
        const includeCompletedBool = (includeCompleted === true || includeCompleted === 'true');

        let { sql, params } = buildInvitationsQuery({
            filmId,
            statuses,
            onlyPending: false,
            includeCompleted: includeCompletedBool,
            expiresAfter,
            expiresBefore,
            acceptedAfter,
            acceptedBefore,
            cancelledAfter,
            cancelledBefore
        });

        const countSql = `SELECT COUNT(*) AS total FROM (${sql})`;
        db.get(countSql, params, (err, row) => {
            if (err) return reject(err);

            const totalItems = row.total;

            const currentPage = Number.parseInt(pageNo, 10) || 1;
            const limits = serviceUtils.getFilmPagination(currentPage);
            const pageSize = limits[1];
            const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

            if (currentPage < 1 || currentPage > totalPages) {
            return resolve({
                pagination: { currentPage, pageSize, totalItems, totalPages },
                invitations: [],
                _links: {
                self: { href: `/api/films/public/${filmId}/invitations?pageNo=${currentPage}` }
                }
            });
            }

            const pagedSql = sql + ' LIMIT ?,?';
            const pagedParams = [...params, limits[0], limits[1]];

            db.all(pagedSql, pagedParams, (err, rows) => {
            if (err) return reject(err);

            const items = rows.map(r =>
                serviceUtils.addInvitationLinks(serviceUtils.createInvitation(r))
            );

            const baseQS = new URLSearchParams();
            if (status) baseQS.set('status', status);
            baseQS.set('includeCompleted', String(includeCompletedBool));

            const mkHref = (p) => {
                const qs = new URLSearchParams(baseQS);
                qs.set('pageNo', String(p));
                return `/api/films/public/${filmId}/invitations?${qs.toString()}`;
            };

            const links = { self: { href: mkHref(currentPage) } };
            if (currentPage > 1) links.prev = { href: mkHref(currentPage - 1) };
            if (currentPage < totalPages) links.next = { href: mkHref(currentPage + 1) };

            resolve({
                pagination: { currentPage, pageSize, totalItems, totalPages },
                invitations: items,
                _links: links
            });
            });
        });
        })
        .catch(reject);
    });
  });
};

/**
 * INVITED USER: list my pending invitations, with optional filters by filmId and expiry window.
 * Default: only PENDING (per spec).
 */
exports.getAllMyInvitations = function (reviewerId, { status, filmId, expiresAfter, expiresBefore, pageNo }) {
  return new Promise((resolve, reject) => {
    ExpirationService.cancelExpiredInvitations()
      .then(() => {

        // parse status filter
        let statuses;
        if (status !== undefined && status !== null && status !== '') {
          try {
            statuses = parseStatuses(status, { allowCancelled: false });
          } catch (e) {
            return reject("INVALID_STATUS");
          }
        } else {
          statuses = ['PENDING', 'ACCEPTED'];
        }

        // validate filmId if provided
        const filmIdNum = (filmId !== undefined && filmId !== null && filmId !== '')
          ? Number(filmId)
          : undefined;
        if (filmIdNum !== undefined && Number.isNaN(filmIdNum)) {
          return reject("INVALID_FILMID");
        }

        let { sql, params } = buildInvitationsQuery({
          reviewerId,
          filmId: filmIdNum,
          statuses,
          expiresAfter,
          expiresBefore,
          onlyPending: false,
          includeCompleted: false
        });

        // pagination params
        const pageSize = 2; 
        const currentPage = (!pageNo || Number(pageNo) < 1) ? 1 : Number(pageNo);
        const offset = (currentPage - 1) * pageSize;

        const countSql = `
          SELECT COUNT(*) AS total
          FROM (${sql}) q
        `;

        db.get(countSql, params, (errCount, rowCount) => {
          if (errCount) return reject(errCount);
          const totalItems = rowCount.total;

          sql += ' LIMIT ?,?';
          const paginatedParams = params.concat([offset, pageSize]);

          db.all(sql, paginatedParams, (err, rows) => {
            if (err) return reject(err);

            const items = rows.map(r =>
              serviceUtils.addInvitationLinks(serviceUtils.createInvitation(r))
            );

            resolve({ items, totalItems, currentPage, pageSize });
          });
        });
      })
      .catch(reject);
  });
};

exports.acceptInvitation = function (filmId, reviewerId) {

  return new Promise((resolve, reject) => {
    ExpirationService.cancelExpiredInvitations()
      .then(() => {

    const sqlSelect = `
      SELECT completed, status
      FROM reviews
      WHERE filmId = ? AND reviewerId = ?
    `;

    db.get(sqlSelect, [filmId, reviewerId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      if (!row) {
        reject("NO_INVITATION");
        return;
      }
      if (row.completed === 1 || row.status !== "PENDING") {
        reject("NOT_PENDING");
        return;
      }

      const sqlUpdate = `
        UPDATE reviews
        SET status = 'ACCEPTED',
            acceptedAt = DATETIME('now'),
            expiresAt = NULL
        WHERE filmId = ? AND reviewerId = ?
      `;

      db.run(sqlUpdate, [filmId, reviewerId], function (err) {
        if (err) {
          reject(err);
          return;
        }

        const sqlReturn = `
              SELECT filmId, reviewerId, status, expiresAt, acceptedAt, cancelledAt, completed
              FROM reviews
              WHERE filmId = ? AND reviewerId = ?
            `;

        db.get(sqlReturn, [filmId, reviewerId], (err3, row2) => {
          if (err3) return reject(err3);
          if (!row2) return reject("NO_INVITATION");

          const invitation = serviceUtils.createInvitation(row2);
            const withLinks = serviceUtils.addInvitationLinks(invitation);

          resolve(withLinks);
      });
          });
        });
      })
      .catch(reject);
  });
};

/**
 * INVITED USER: accept all my pending invitations (single operation),
 * with optional filters by filmId and expiry window.
 */
exports.acceptAllMyPendingInvitations = function (reviewerId) {
  return new Promise((resolve, reject) => {
    ExpirationService.cancelExpiredInvitations()
      .then(() => {
        const sqlUpdate = `
          UPDATE reviews
          SET status = 'ACCEPTED',
              acceptedAt = datetime('now'),
              expiresAt = NULL
          WHERE reviewerId = ?
            AND completed = 0
            AND status = 'PENDING'
        `;

        db.run(sqlUpdate, [reviewerId], function (err) {
          if (err) return reject(err);

          const bulkAcceptedCount = this.changes;

          const sqlSelect = `
            SELECT filmId, reviewerId, status, acceptedAt
            FROM reviews
            WHERE reviewerId = ?
              AND completed = 0
              AND status = 'ACCEPTED'
            ORDER BY acceptedAt DESC
          `;
          db.all(sqlSelect, [reviewerId], (err2, rows) => {
            if (err2) return reject(err2);

            resolve({
              bulkAcceptedCount: bulkAcceptedCount,
              myCurrentAcceptedInvitations: rows.map(r => serviceUtils.addInvitationLinks(serviceUtils.createInvitation(r)))
            });
          });
        });
      })
      .catch(reject);
  });
};


exports.issueInvitationsForFilm = function (filmId, ownerId, invitationList) {
  return new Promise((resolve, reject) => {

    ExpirationService.cancelExpiredInvitations()
      .then(() => {

    // body validation
    if (!Array.isArray(invitationList) || invitationList.length === 0) {
      return reject("INVALID_BODY");
    }
    for (const it of invitationList) {
      if (!it || it.reviewerId === undefined || it.reviewerId === null || isNaN(Number(it.reviewerId))) {
        return reject("INVALID_BODY");
      }
      if (it.expiresAt !== undefined && it.expiresAt !== null && typeof it.expiresAt !== 'string') {
        return reject("INVALID_BODY");
      }
    }

    // check film exists, is public, and owner is correct
    const sqlCheck = 'SELECT owner, private FROM films WHERE id = ?';
    db.get(sqlCheck, [filmId], (err, film) => {
      if (err) return reject(err);
      if (!film) return reject("NO_FILMS");
      if (film.private === 1) return reject("NO_PUBLIC_FILM");
      if (Number(film.owner) !== Number(ownerId)) return reject("USER_NOT_OWNER");
      // owner cannot invite himself
      for (const it of invitationList) {
        if (Number(it.reviewerId) === Number(film.owner)) {
          return reject("OWNER_CANNOT_INVITE_SELF");
        }
      }

      // every invited reviewer must exist
      const reviewerIds = [...new Set(invitationList.map(it => Number(it.reviewerId)))];
      const sqlUsers = `SELECT id FROM users WHERE id IN (${reviewerIds.map(() => '?').join(',')})`;
      db.all(sqlUsers, reviewerIds, (errUsers, userRows) => {
      if (errUsers) return reject(errUsers);
      const existingIds = new Set(userRows.map(u => u.id));
      const missingIds = reviewerIds.filter(id => !existingIds.has(id));
      if (missingIds.length > 0) {
        return reject({ code: "REVIEWER_NOT_FOUND", reviewerIds: missingIds });
      }

      // insert invitations one by one 
      const created = [];
      const insertOne = (idx) => {
        if (idx >= invitationList.length) {
          return resolve(created);
        }

        const reviewerId = Number(invitationList[idx].reviewerId);
        const expiresAt = invitationList[idx].expiresAt;

        const finalExpiresAt = (expiresAt === undefined || expiresAt === null || expiresAt === '') ? DEFAULT_EXPIRES_VALUE : expiresAt;
        validateExpiresAtNotPast(finalExpiresAt)
          .then(() => {
        const sqlExisting = `
          SELECT status, completed
          FROM reviews
          WHERE filmId = ? AND reviewerId = ?
        `;
        db.get(sqlExisting, [filmId, reviewerId], (errSel, existing) => {
          if (errSel) return reject(errSel);

          if(!existing) {
            const sqlInsert = `
              INSERT INTO reviews(filmId, reviewerId, completed, status, expiresAt)
              VALUES(?, ?, 0, 'PENDING', ?)
            `;
            db.run(sqlInsert, [filmId, reviewerId, finalExpiresAt], function (errIns) {
              if (errIns) {
                if (String(errIns.message || errIns).includes('SQLITE_CONSTRAINT')) {
                  return reject("DUPLICATE_INVITATION");
                }
                return reject(errIns);
              }
              
              const out = {
                filmId: Number(filmId),
                reviewerId,
                status: "PENDING",
                expiresAt: finalExpiresAt,
                acceptedAt: null,
                cancelledAt: null,
                completed: 0
              };
              created.push(serviceUtils.addInvitationLinks(serviceUtils.createInvitation(out)));
              return insertOne(idx + 1);
            });
          } else {
            // a previous invitation exists and is CANCELLED and not completed, update it to PENDING
            if (existing.completed === 0 && existing.status === "CANCELLED") {
              const sqlUpdate = `
                UPDATE reviews
                SET status = 'PENDING',
                    expiresAt = ?,
                    acceptedAt = NULL,
                    cancelledAt = NULL
                WHERE filmId = ? AND reviewerId = ?
              `;
              db.run(sqlUpdate, [finalExpiresAt, filmId, reviewerId], function (errUpd) {
                if (errUpd) return reject(errUpd);

                const out = {
                  filmId: Number(filmId),
                  reviewerId,
                  status: "PENDING",
                  expiresAt: finalExpiresAt,
                  acceptedAt: null,
                  cancelledAt: null,
                  completed: 0
                };
                created.push(serviceUtils.addInvitationLinks(serviceUtils.createInvitation(out)));
                return insertOne(idx + 1);
              });
            } else {
              return reject("DUPLICATE_INVITATION");
            } 
          }
        });
      })
      .catch(reject);
      };
      insertOne(0);
      });
    });
  })
  .catch(reject);
  });
};

/**
 * Delete a review invitation
 * The review of the film with ID filmId and issued to the user with ID reviewerId is deleted. This operation can only be performed by the owner, and only if the review has not yet been completed by the reviewer.
 *
 * filmId Long ID of the film whose review invitation must be deleted
 * reviewerId Long ID of the user to whom the review has been issued
 * no response value expected for this operation
 **/
exports.deleteSingleInvitation = function (filmId, reviewerId, owner) {
  return new Promise((resolve, reject) => {
    const sql1 = "SELECT f.owner, r.completed FROM films f, reviews r WHERE f.id = r.filmId AND f.id = ? AND r.reviewerId = ?";
    db.all(sql1, [filmId, reviewerId], (err, rows) => {
      if (err)
        reject(err);
      else if (rows.length === 0)
        reject("NO_REVIEWS");
      else if (owner != rows[0].owner) {
        reject("USER_NOT_OWNER");
      }
      else if (rows[0].completed == 1) {
        reject("ALREADY_COMPLETED");
      }
      else {
        const sql2 = 'DELETE FROM reviews WHERE filmId = ? AND reviewerId = ?';
        db.run(sql2, [filmId, reviewerId], (err) => {
          if (err)
            reject(err);
          else
            resolve(null);
        })
      }
    });
  });

}

//helper function
function validateExpiresAtNotPast(expiresAt) {
  return new Promise((resolve, reject) => {
    if (expiresAt === DEFAULT_EXPIRES_VALUE) return resolve();

    const sql = `
      SELECT
        datetime(?) AS parsed,
        CASE WHEN datetime(?) <= datetime('now') THEN 1 ELSE 0 END AS isPast
    `;

    db.get(sql, [expiresAt, expiresAt], (err, row) => {
      if (err) return reject(err);

      if (!row || row.parsed === null) return reject("INVALID_EXPIRESAT");

      if (row.isPast === 1) return reject("EXPIRES_IN_PAST");

      resolve();
    });
  });
}