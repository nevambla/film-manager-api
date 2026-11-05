'use strict';

var utils = require('../utils/writer.js');
const invitationsService = require('../service/InvitationsService.js');

module.exports.acceptAllMyPendingInvitations = function (req, res, next) {
  invitationsService.acceptAllMyPendingInvitations(req.user.id, {
    filmId: req.query.filmId,
    expiresAfter: req.query.expiresAfter,
    expiresBefore: req.query.expiresBefore
  })
  .then((result) => utils.writeJson(res, result))
  .catch((err) => utils.writeJson(res, { errors: [{ param: 'Server', msg: err.message ?? err }] }, 500));
};