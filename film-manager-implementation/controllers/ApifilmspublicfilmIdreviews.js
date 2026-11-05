'use strict';

var utils = require('../utils/writer.js');
const reviewService = require('../service/ReviewsService.js');
const constants = require('../utils/constants.js');

module.exports.getFilmReviews = function getFilmReviews(req, res, next) {

  //retrieve a list of reviews
  var numOfReviews = 0;
  var next = 0;

  reviewService.getFilmReviewsTotal(req.params.filmId)
    .then(function (response) {

      numOfReviews = response;
      if(numOfReviews == 0){
         return utils.writeJson(res, {
              totalPages: 1,
              currentPage: 1,
              totalItems: 0,
              reviews: [],
            });
      }
      reviewService.getFilmReviews(req.query.pageNo, req.params.filmId)
        .then(function (response) {
          if (req.query.pageNo == null) var pageNo = 1;
          else var pageNo = req.query.pageNo;
          var totalPage = Math.ceil(numOfReviews / constants.ELEMENTS_IN_PAGE);
          next = Number(pageNo) + 1;
          if (pageNo > totalPage || pageNo < 1) {
            utils.writeJson(res, { errors: [{ 'param': 'Server', 'msg': "The page does not exist." }], }, 404);
          } else if (pageNo == totalPage) {
            utils.writeJson(res, {
              totalPages: totalPage,
              currentPage: pageNo,
              totalItems: numOfReviews,
              reviews: response
            });
          } else {
            utils.writeJson(res, {
              totalPages: totalPage,
              currentPage: pageNo,
              totalItems: numOfReviews,
              reviews: response,
              next: "/api/films/public/" + req.params.filmId + "/reviews?pageNo=" + next            });
          }
        })
        .catch(function (response) {
          utils.writeJson(res, { errors: [{ 'param': 'Server', 'msg': response }], }, 500);
        });
    })
    .catch(function (response) {
      utils.writeJson(res, { errors: [{ 'param': 'Server', 'msg': response }], }, 500);
    });

};

