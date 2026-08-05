require('dotenv').config();
const { syncGenresFromTMDB, syncProvidersFromTMDB, importPopularMovies, getMovieDetails } = require('../services/tmdb.service.js');
const { enrichMovies } = require('./tmdbEnrich.js');

async function run() {
  console.log('Sincronizando géneros...');
  console.log(await syncGenresFromTMDB());

  console.log('Sincronizando plataformas...');
  console.log(await syncProvidersFromTMDB());

  const pages = parseInt(process.argv[2] || '1', 10);
  console.log(`Importando películas populares (${pages} página(s) de TMDB)...`);
  console.log(await importPopularMovies({ pages }));
  const enrich = enrichMovies()

  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Error en tmdbSync:', err.message);
  process.exit(1);
});