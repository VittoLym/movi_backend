const express = require('express');
const { softAuth } = require('../middleware/softAuth.middleware');
const { requireAuth } = require('../middleware/auth.middleware');

const {
  getRandomMovie,
  getMovieById,
  listMovies,
  createMovie,
  getSimilarMovies,
} = require('../controllers/movies.controller');

const {
  listReviewsForMovie,
  upsertReview,
} = require('../controllers/reviews.controller');

const router = express.Router();

// Público, pero se personaliza si viene un JWT válido (softAuth)
router.get('/random', softAuth, getRandomMovie);
router.get('/', listMovies);
router.get('/:id', getMovieById);
router.get('/:id/similar', getSimilarMovies);
// Carga de catálogo (hoy sin rol admin; ver README para el TODO)
router.post('/', createMovie);

// Reviews de una película puntual
router.get('/:movieId/reviews', listReviewsForMovie);
router.post('/:movieId/reviews', requireAuth, upsertReview);

module.exports = router;
