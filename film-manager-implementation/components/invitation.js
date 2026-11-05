'use strict';

class Invitation {
  constructor(filmId, reviewerId, status, expiresAt = null, acceptedAt = null) {
    this.filmId = Number(filmId);
    this.reviewerId = Number(reviewerId);
    this.status = status;
    this.expiresAt = expiresAt;
    this.acceptedAt = acceptedAt;
    this._links = {};
  }
}

module.exports = Invitation;