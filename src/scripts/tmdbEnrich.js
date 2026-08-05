const pool = require('../config/db');
const { getMovieDetails } = require('../services/tmdb.service');

async function enrichMovies() {
  const { rows: movies } = await pool.query(`
    SELECT id, tmdb_id
    FROM movies
    WHERE tmdb_id IS NOT NULL
  `);

  for (const movie of movies) {
    console.log(`Procesando ${movie.tmdb_id}`);

    const detail = await getMovieDetails(movie.tmdb_id);

    await pool.query(
      `
      UPDATE movies
      SET
        backdrop_url = $1,
        director = $2,
        trailer_url = $3
      WHERE id = $4
      `,
      [
        detail.backdrop_url,
        detail.director,
        detail.trailerUrl,
        movie.id,
      ]
    );

    console.log(`✓ ${movie.tmdb_id}`);
  }

  return {
    processed: movies.length,
  };
}

module.exports = {
  enrichMovies,
};