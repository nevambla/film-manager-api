'use strict';

const db = require('../components/db');

var utils = require('../utils/writer.js');
const reviewService = require('../service/ReviewsService.js');

module.exports.getSingleReview = function getSingleReview (req, res, next) {

    reviewService.getSingleReview(req.params.filmId, req.params.reviewerId)
        .then(function(response) {
            utils.writeJson(res, response);
        })
        .catch(function(response) {
            if (response == "NO_REVIEWS"){
                utils.writeJson(res, { errors: [{ 'param': 'Server', 'msg': 'The review does not exist.' }], }, 404);
            }
            else {
                utils.writeJson(res, { errors: [{ 'param': 'Server', 'msg': response }], }, 500);
            }
        });
};

module.exports.updateSingleReview = function updateSingleReview (req, res, next) {
  
  if(req.params.reviewerId != req.user.id)
  {
    utils.writeJson(res, { errors: [{ 'param': 'Server', 'msg': 'The reviewerId is not equal the id of the requesting user.' }], }, 403);
  }
  else if(req.body.completed == undefined) {
    utils.writeJson(res, { errors: [{ 'param': 'Server', 'msg': 'The completed property is absent.' }], }, 400);
  }
  else if(req.body.completed == false) {
    utils.writeJson(res, { errors: [{ 'param': 'Server', 'msg': 'The completed property is false, but it should be set to true.' }], }, 409);
  }

  else {
    const filmId = req.params.filmId;
    const reviewerId = req.params.reviewerId;
    const userId = req.user.id;

    // check user is not owner of the film
    const sqlOwner = `SELECT owner FROM films WHERE id = ?`;
    db.get(sqlOwner, [filmId], (err, row) => {
      if (err) {
        utils.writeJson(res, { errors: [{ param: 'Server', msg: err.message ?? err }] }, 500);
        return;
      }
      if (!row) {
        utils.writeJson(res, { errors: [{ param: 'Server', msg: 'The film does not exist.' }] }, 404);
        return;
      }
      if (Number(row.owner) === Number(userId)) {
        utils.writeJson(res, { errors: [{ param: 'Server', msg: 'The owner cannot review his own film.' }] }, 403);
        return;
      }

      reviewService.getReviewRowForUpdate(filmId, reviewerId)
        .then(function (review) {

          // if not accepted, cannot update
          if (review.status !== "ACCEPTED") {
            utils.writeJson(
              res,
              { errors: [{ param: 'Server', msg: 'The invitation has not been accepted yet.' }] },
              403
            );
            return;
          }

          // OK so update
          reviewService.updateSingleReview(req.body, filmId, reviewerId, userId)
            .then(function (response) {
              utils.writeJson(res, response, 204);
            })
            .catch(function (response) {
              if (response === "USER_NOT_REVIEWER") {
                utils.writeJson(res, { errors: [{ param: 'Server', msg: 'The user is not a reviewer of the film' }] }, 403);
              } else if (response === "NO_REVIEWS") {
                utils.writeJson(res, { errors: [{ param: 'Server', msg: 'The review does not exist.' }] }, 404);
              } else if (response === "ALREADY_COMPLETED") {
                utils.writeJson(res, { errors: [{ param: 'Server', msg: 'ALREADY_COMPLETED' }] }, 409);
              } else {
                utils.writeJson(res, { errors: [{ param: 'Server', msg: response }] }, 500);
              }
            });

        })
        .catch(function () {
          utils.writeJson(res, { errors: [{ param: 'Server', msg: 'The review does not exist.' }] }, 404);
        });
    });
  }
}
;