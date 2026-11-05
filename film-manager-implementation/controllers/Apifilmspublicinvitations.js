'use strict';

var utils = require('../utils/writer.js');
const invitationsService = require('../service/InvitationsService.js');

module.exports.getAllMyInvitations = function (req, res, next) {
  invitationsService.getAllMyInvitations(req.user.id, {
    filmId: req.query.filmId,
    status: req.query.status,
    expiresAfter: req.query.expiresAfter,
    expiresBefore: req.query.expiresBefore,
    pageNo: req.query.pageNo
  })
  .then(({ items, totalItems, currentPage, pageSize }) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  //url filters
  const baseQS = new URLSearchParams();
  if (req.query.filmId) baseQS.set('filmId', req.query.filmId);
  if (req.query.expiresAfter) baseQS.set('expiresAfter', req.query.expiresAfter);
  if (req.query.expiresBefore) baseQS.set('expiresBefore', req.query.expiresBefore);
  if (req.query.status) baseQS.set('status', req.query.status);

  const mkUrl = (p) => {
    const qs = new URLSearchParams(baseQS);
    qs.set('pageNo', String(p));
    return `/api/films/public/invitations?${qs.toString()}`;
  };

  const links = { self: { href: mkUrl(currentPage) } };
  if (currentPage > 1) links.prev = { href: mkUrl(currentPage - 1) };
  if (currentPage < totalPages) links.next = { href: mkUrl(currentPage + 1) };

  utils.writeJson(res, {
    pagination: { currentPage, pageSize, totalItems, totalPages },
    invitations: items,
    _links: links
  });
})
  .catch((err) => utils.writeJson(res, { errors: [{ param: 'Server', msg: err.message ?? err }] }, 500));
};

