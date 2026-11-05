'use strict';

const utils = require('../utils/writer.js');
const invitationsService = require('../service/InvitationsService.js');

module.exports.acceptInvitation = function (req, res, next) {

  const filmId = req.params.filmId;
  const reviewerId = req.user.id; 

  invitationsService.acceptInvitation(filmId, reviewerId)
    .then(response => {
      utils.writeJson(res, response, 200);
    })
    .catch(err => {
      if (err === "NO_INVITATION") {
        utils.writeJson(res, { errors: [{ param: 'Server', msg: 'Invitation does not exist.' }] }, 404);
      }
      else if (err === "NOT_PENDING") {
        utils.writeJson(res, { errors: [{ param: 'Server', msg: 'Invitation is not pending.' }] }, 409);
      }
      else {
        utils.writeJson(res, { errors: [{ param: 'Server', msg: err }] }, 500);
      }
    });
};