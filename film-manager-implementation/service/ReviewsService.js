'use strict';
const serviceUtils = require('../utils/serviceUtils.js');
const db = require('../components/db');
const Review = require('../components/review');

// to check for expired invitations
const ExpirationService = require('./ExpirationService');

/**
 * Retrieve the list of all the reviews that have been issued/completed for a public film
 * All the reviews that have been issued/completed for the public film with ID filmId are retrieved. A pagination mechanism is used to limit the size of messages. This operation does not require authentication. 
 *
 * filmId Long ID of the film whose reviews must be retrieved
 * pageNo Integer ID of the requested page (if absent, the first page is returned)' (optional)
 * returns Reviews
 **/
exports.getFilmReviews = function (pageNo, filmId) {
  return new Promise((resolve, reject) => {
    var sql = `
          SELECT
            r.filmId as fid,
            r.reviewerId as rid,
            r.completed,
            r.reviewDate,
            r.rating,
            r.review,
            c.total_rows
          FROM reviews r,
            (SELECT count(*) total_rows
            FROM reviews l
            WHERE l.filmId = ?
              AND l.completed = 1) c
          WHERE r.filmId = ?
            AND r.completed = 1
          ORDER BY datetime(r.reviewDate) DESC
        `;
    var params = serviceUtils.getReviewPagination(pageNo, filmId);
    if (params.length != 2) sql = sql + " LIMIT ?,?";
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        let reviews = rows.map((row) => serviceUtils.createReview(row));
        resolve(reviews);
      }
    });
  });
}

/**
* Retrieve the number of reviews of the film with ID filmId
* 
* Input: 
* - filmId: the ID of the film whose reviews need to be retrieved
* Output:
* - total number of reviews of the film with ID filmId
* 
**/
exports.getFilmReviewsTotal = function (filmId) {
  return new Promise((resolve, reject) => {
    // only completed reviews are counted
    var sqlNumOfReviews = "SELECT count(*) total FROM reviews WHERE filmId = ? AND completed = 1";
    db.get(sqlNumOfReviews, [filmId], (err, size) => {
      if (err) {
        reject(err);
      } else {
        resolve(size.total);
      }
    });
  });
}

/**
 * Retrieve a review that has been issued/completed for a film
 * The review of the film with ID filmID issued to the user with ID reviewerId is retrieved. This operation does not require authentication. 
 *
 * filmId Long ID of the film whose reviews must be retrieved
 * reviewerId Long ID of the user to whom the review has been issued
 * returns Review
 **/
exports.getSingleReview = function (filmId, reviewerId) {
  return new Promise((resolve, reject) => {
    // only completed reviews are visible
    const sql = "SELECT filmId as fid, reviewerId as rid, completed, status, reviewDate, rating, review FROM reviews WHERE filmId = ? AND reviewerId = ? AND completed = 1";
    db.all(sql, [filmId, reviewerId], (err, rows) => {
      if (err)
        reject(err);
      else if (rows.length === 0)
        reject("NO_REVIEWS");
      else {
        var review = serviceUtils.createReview(rows[0]);
        resolve(review);
      }
    });
  });
}

// helper function to get all the rows in the reviews table 
exports.getReviewRowForUpdate = function (filmId, reviewerId) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT filmId, reviewerId, completed, status, expiresAt, acceptedAt, cancelledAt
      FROM reviews
      WHERE filmId = ? AND reviewerId = ?
    `;
    db.get(sql, [filmId, reviewerId], (err, row) => {
      if (err) return reject(err);
      if (!row) return reject("NO_REVIEWS");
      resolve(row);
    });
  });
};


/**
 * Complete a review
 * The review of the film with ID filmId and issued to the user with ID reviewerId is completed. This operation only allows setting the \"completed\" property to the \"true\" value, and changing the values of the \"reviewDate\", \"rating\", and \"review\" properties. This operation can be performed only by the invited reviewer.
 *
 * body Review The updated Review object (optional)
 * filmId Long ID of the film whose review must be completed
 * reviewerId Long ID of the user to whom the review has been issued
 * no response value expected for this operation
 **/

exports.updateSingleReview = function (review, filmId, reviewerId, requesterId) {
  return new Promise((resolve, reject) => {

    // check that the requester is the reviewer
    if (Number(requesterId) !== Number(reviewerId)) {
      return reject("USER_NOT_REVIEWER");
    }

    if (review.completed !== true && review.completed !== 1) {
      return reject("INVALID_COMPLETED");
    }

    const sqlFilm = `SELECT owner FROM films WHERE id = ?`;
    db.get(sqlFilm, [filmId], (errFilm, filmRow) => {
      if (errFilm) return reject(errFilm);
      if (!filmRow) return reject("NO_FILMS");

      // owner cannot review own film
      if (Number(filmRow.owner) === Number(requesterId)) {
        return reject("OWNER_CANNOT_REVIEW_OWN_FILM");
      }

      const sqlSelect = `
        SELECT reviewerId, completed, status
        FROM reviews
        WHERE filmId = ? AND reviewerId = ?
      `;
      db.get(sqlSelect, [filmId, reviewerId], (err, row) => {
        if (err) return reject(err);

        if (!row) return reject("NO_REVIEWS");

        if (row.status !== "ACCEPTED") return reject("NOT_ACCEPTED");

        let sql2 = 'UPDATE reviews SET completed = 1';
        const parameters = [];

        if (review.reviewDate !== undefined) { sql2 += ', reviewDate = ?'; parameters.push(review.reviewDate); }
        if (review.rating !== undefined)     { sql2 += ', rating = ?';     parameters.push(review.rating); }
        if (review.review !== undefined)     { sql2 += ', review = ?';     parameters.push(review.review); }

        sql2 += ' WHERE filmId = ? AND reviewerId = ?';
        parameters.push(filmId, reviewerId);

        db.run(sql2, parameters, function (err2) {
          if (err2) return reject(err2);
          resolve(null);
        });
      });
    });
  });
};


exports.getFilmInvitationsOwner = function (filmId, ownerId, status) {
  return new Promise((resolve, reject) => {
    const allowed = new Set(["PENDING", "ACCEPTED", "CANCELLED"]);

    let statuses = null;
    if (status !== undefined) {
      if (typeof status !== "string" || status.trim() === "") return reject("INVALID_STATUS");

      // normalized array of uppercase values
      statuses = status
        .split(",")
        .map(s => s.trim().toUpperCase())
        .filter(s => s.length > 0);

      if (statuses.length === 0) return reject("INVALID_STATUS");
      // check all values are allowed
      if (statuses.some(s => !allowed.has(s))) return reject("INVALID_STATUS");
    }

    const sqlCheck = "SELECT owner, private FROM films WHERE id = ?";
    db.get(sqlCheck, [filmId], (err, film) => {
      if (err) return reject(err);
      if (!film) return reject("NO_FILMS");
      if (film.private === 1) return reject("NO_PUBLIC_FILM");
      if (Number(film.owner) !== Number(ownerId)) return reject("USER_NOT_OWNER");

      ExpirationService.cancelExpiredInvitations()
        .then(() => {
          let sql = `
            SELECT filmId, reviewerId, status, expiresAt, acceptedAt, completed
            FROM reviews
            WHERE filmId = ?
          `;
          const params = [filmId];

          // Apply status filter if provided
          if (statuses) {
            sql += ` AND status IN (${statuses.map(() => "?").join(",")}) `;
            params.push(...statuses);
          }

          sql += " ORDER BY CASE status WHEN 'PENDING' THEN 0 WHEN 'ACCEPTED' THEN 1 ELSE 2 END, reviewerId";

          db.all(sql, params, (err, rows) => {
            if (err) return reject(err);

            resolve(rows.map(r => ({
              filmId: r.filmId,
              reviewerId: r.reviewerId,
              status: r.status,
              expiresAt: r.expiresAt ?? null,
              acceptedAt: r.acceptedAt ?? null,
              completed: r.completed === 1
            })));
          });
        })
        .catch(reject);
    });
  });
};