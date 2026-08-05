const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { listMyReviews, deleteReview } = require('../controllers/reviews.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/me', listMyReviews);      // GET /api/reviews/me
router.delete('/:id', deleteReview);   // DELETE /api/reviews/:id

module.exports = router;
