# MovieTo Backend

Backend en Node.js + Express + PostgreSQL para la app MovieTo/CineMatch.

## Setup

```bash
npm install
cp .env.example .env   # completar DATABASE_URL y JWT_SECRET
npm run db:init        # crea tablas + seed de genres/streaming_providers
npm run dev            # nodemon en http://localhost:4000
```

Requiere una base PostgreSQL ya creada (`createdb movieto` o equivalente).

## Mapeo con SettingsView.vue

| Dato en el front            | Endpoint                                    |
|------------------------------|----------------------------------------------|
| `userData`                   | `GET /api/users/me`                          |
| `genres[]`                   | `GET /api/users/me/genres`                   |
| `toggleGenre(genre)`         | `PUT /api/users/me/genres/:name` `{active}`  |
| `streamingServices[]`        | `GET /api/users/me/streaming-services`       |
| `toggleStreamingService(s)`  | `PUT /api/users/me/streaming-services/:name` `{active}` |
| `notificationsEnabled`       | `GET/PUT /api/users/me/notifications`        |
| `handleLogout`               | (client-side: borrar el JWT guardado)        |

Todos los endpoints de `/api/users/me/*` requieren header:
```
Authorization: Bearer <token>
```
El token se obtiene de `POST /api/auth/login` o `POST /api/auth/register`.

## Recomendaciones y Reviews

| Función                                  | Endpoint                                  |
|-------------------------------------------|--------------------------------------------|
| Película random (personalizada si hay JWT)| `GET /api/movies/random`                   |
| Detalle de película                       | `GET /api/movies/:id`                      |
| Listado con filtros                       | `GET /api/movies?genre=Drama&provider=Netflix` |
| Cargar película (seed manual)             | `POST /api/movies`                         |
| Reviews de una película                   | `GET /api/movies/:movieId/reviews`         |
| Crear/editar mi review de una película    | `POST /api/movies/:movieId/reviews` `{rating, comment}` (auth) |
| Mis reviews                               | `GET /api/reviews/me` (auth)               |
| Borrar una review mía                     | `DELETE /api/reviews/:id` (auth)           |

**Cómo funciona la personalización de `/api/movies/random`:**
Si mandás el `Authorization: Bearer <token>`, el query prioriza películas
que matcheen alguno de tus géneros activos (`user_genres`) o plataformas
activas (`user_streaming_services`) — las mismas tablas que ya usa
`SettingsView.vue`. Si no matchea nada, o no mandás token, cae a random
puro sobre toda la tabla `movies`. Nunca devuelve 404 salvo que la tabla
esté vacía.

Una review es única por `(user_id, movie_id)`: si el usuario ya calificó
esa película, el mismo POST la actualiza en vez de crear una duplicada.

## Integración real de streaming/géneros (a futuro)

Las tablas `genres` y `streaming_providers` son catálogos globales separados
de las preferencias del usuario (`user_genres`, `user_streaming_services`).
Cuando se quiera conectar TMDB/JustWatch:

1. Completar `TMDB_API_KEY` en `.env`.
2. Implementar `syncGenresFromTMDB()` / `syncProvidersFromTMDB()` en
   `src/services/tmdb.service.js` (ya tienen la firma y el TODO listos).
3. Correrlas una vez (cron o endpoint admin) para poblar `tmdb_genre_id` /
   `tmdb_provider_id` sin tocar el resto del código ni las tablas de
   preferencias del usuario.

## Próximos pasos sugeridos

- [ ] Middleware de validación de body (zod/joi) en vez de checks manuales.
- [ ] Endpoint de `handleAccountClick` / `handlePrivacyClick` reales
      (cambio de email, contraseña, visibilidad de perfil).
- [ ] Migraciones versionadas (node-pg-migrate) en vez de `schema.sql` plano,
      antes de que el equipo crezca.
- [ ] Tests de integración de los endpoints con supertest.
- [ ] Rol admin real para `POST /api/movies` (hoy cualquiera puede cargar
      películas, sirve para probar pero no para producción).
- [ ] Paginación en `GET /api/movies` y `GET /api/movies/:movieId/reviews`
      cuando la base crezca (hoy traen todo sin límite).
- [ ] Si en algún momento quieren "no repetir la misma recomendación 2 veces
      seguidas", se puede excluir por `movie_id` mandado desde el front en
      el query de `/api/movies/random`.
