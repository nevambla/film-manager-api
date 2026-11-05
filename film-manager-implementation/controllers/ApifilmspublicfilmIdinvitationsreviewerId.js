'use strict';

var utils = require('../utils/writer.js');
const reviewService = require('../service/InvitationsService.js');

module.exports.deleteSingleInvitation = function deleteSingleInvitation (req, res, next) {

  reviewService.deleteSingleInvitation(req.params.filmId, req.params.reviewerId, req.user.id)
    .then(function (response) {
      utils.writeJson(res, response, 204);
    })
    .catch(function (response) {
      if(response == "USER_NOT_OWNER"){
        utils.writeJson(res, { errors: [{ 'param': 'Server', 'msg': 'The user is not the owner of the film' }], }, 403);
      }
      else if(response == "ALREADY_COMPLETED"){
        utils.writeJson(res, { errors: [{ 'param': 'Server', 'msg': 'The review has been already completed, so the invitation cannot be deleted anymore.' }], }, 409);
      }
      else if (response == "NO_REVIEWS"){
        utils.writeJson(res, { errors: [{ 'param': 'Server', 'msg': 'The review does not exist.' }], }, 404);
      }
      else {
        utils.writeJson(res, {errors: [{ 'param': 'Server', 'msg': response }],}, 500);
      }
    });
};