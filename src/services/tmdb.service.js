/**
 * tmdb.service.js
 * ----------------
 * Punto único de integración con TMDB (o JustWatch) para cuando pasemos de
 * "solo guardar lo que el usuario tildó" a traer datos reales.
 *
 * Uso futuro típico:
 *  - syncGenresFromTMDB(): trae /genre/movie/list y hace upsert en la tabla `genres`
 *    seteando `tmdb_genre_id`.
 *  - syncProvidersFromTMDB(): trae /watch/providers/movie y hace upsert en
 *    `streaming_providers` seteando `tmdb_provider_id` y `logo_url`.
 *  - getWatchProvidersForTitle(tmdbMovieId, region): para mostrar dónde ver
 *    una película específica.
 *
 * Por ahora queda sin implementar (requiere TMDB_API_KEY en .env) para no
 * bloquear el resto del backend.
 */

const TMDB_BASE_URL = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';

function assertConfigured() {
  if (!process.env.TMDB_API_KEY) {
    throw new Error(
      'TMDB_API_KEY no configurada. Definila en .env para habilitar la integración real.'
    );
  }
}

async function syncGenresFromTMDB() {
  assertConfigured();
  // TODO: fetch(`${TMDB_BASE_URL}/genre/movie/list?api_key=...&language=es`)
  //       y hacer upsert en la tabla `genres` (name, tmdb_genre_id)
  throw new Error('syncGenresFromTMDB: no implementado todavía.');
}

async function syncProvidersFromTMDB() {
  assertConfigured();
  // TODO: fetch(`${TMDB_BASE_URL}/watch/providers/movie?api_key=...&watch_region=AR`)
  //       y hacer upsert en `streaming_providers` (name, tmdb_provider_id, logo_url)
  throw new Error('syncProvidersFromTMDB: no implementado todavía.');
}

module.exports = { syncGenresFromTMDB, syncProvidersFromTMDB, TMDB_BASE_URL };
