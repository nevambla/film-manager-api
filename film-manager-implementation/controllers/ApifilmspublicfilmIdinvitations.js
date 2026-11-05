'use strict';

var utils = require('../utils/writer.js');
const invitationsService = require('../service/InvitationsService.js');

module.exports.getFilmInvitationsOwner = function (req, res, next) {
  const filmId = req.params.filmId;
  const ownerId = req.user.id;
  const status = req.query.status;
  const includeCompleted = (req.query.includeCompleted === 'true');

  invitationsService.getInvitationsForOwner(filmId, ownerId, {
    status,
    pageNo: req.query.pageNo,
    includeCompleted,
    expiresAfter: req.query.expiresAfter,
    expiresBefore: req.query.expiresBefore,
    acceptedAfter: req.query.acceptedAfter,
    acceptedBefore: req.query.acceptedBefore,
    cancelledAfter: req.query.cancelledAfter,
    cancelledBefore: req.query.cancelledBefore
  })
    .then((result) => utils.writeJson(res, result))
    .catch((err) => {
      if (err === "NO_FILMS") { 
        utils.writeJson(res, { errors: [{ param: 'Server', msg: 'The film does not exist.' }] }, 404);
      } else if (err === "NO_PUBLIC_FILM") {
        utils.writeJson(res, { errors: [{ param: 'Server', msg: 'The film is not public.' }] }, 404);
      } else if (err === "USER_NOT_OWNER") {
        utils.writeJson(res, { errors: [{ param: 'Server', msg: 'The user is not the owner of the film.' }] }, 403);
      } else if (err === "INVALID_STATUS") {
        utils.writeJson(res, { errors: [{ param: 'Server', msg: 'Invalid status.' }] }, 400);
      } else {
        utils.writeJson(res, { errors: [{ param: 'Server', msg: err.message ?? err }] }, 500);
      }
    });
}

module.exports.issueInvitations = function issueInvitations(req, res, next) {
  const filmId = req.params.filmId;
  const ownerId = req.user.id;

  const invitations = req.body;

  if (!Array.isArray(invitations) || invitations.length === 0) {
    utils.writeJson(res, { errors: [{ param: 'body', msg: 'Body must be a non-empty array.' }] }, 400);
    return;
  }

  invitationsService.issueInvitationsForFilm(filmId, ownerId, invitations)
    .then((created) => utils.writeJson(res, { invitations: created }, 201))
    .catch((err) => {
      if (err === "NO_FILMS") {
        utils.writeJson(res, { errors: [{ param: 'Server', msg: 'The film does not exist.' }] }, 404);
      } else if (err === "NO_PUBLIC_FILM") {
        utils.writeJson(res, { errors: [{ param: 'Server', msg: 'The film is not public.' }] }, 404);
      } else if (err === "USER_NOT_OWNER") {
        utils.writeJson(res, { errors: [{ param: 'Server', msg: 'The user is not the owner of the film.' }] }, 403);
      } else if (err === "INVALID_BODY") {
        utils.writeJson(res, { errors: [{ param: 'body', msg: 'Invalid invitation list.' }] }, 400);
        } else if (err === "INVALID_EXPIRES_AT") {
        utils.writeJson(res, { errors: [{ param: 'expiresAt', msg: 'Invalid date-time format.' }] }, 400);
      } else if (err === "EXPIRES_AT_IN_PAST") {
        utils.writeJson(res, { errors: [{ param: 'expiresAt', msg: 'expiresAt must be in the future.' }] }, 400);
      } else if (err === "DUPLICATE_INVITATION") {
        utils.writeJson(res, { errors: [{ param: 'Server', msg: 'One or more invitations already exist.' }] }, 409);
      } else if (err === "OWNER_CANNOT_INVITE_SELF") {
        utils.writeJson(res, { errors: [{ param: 'reviewerId', msg: 'The film owner cannot invite himself.' }] }, 409);
      } else {
        utils.writeJson(res, { errors: [{ param: 'Server', msg: err.message ?? err }] }, 500);
      }
    });
};