-- ============================================================
-- MovieTo (CineMatch) - Schema inicial
-- Diseñado para calzar 1:1 con SettingsView.vue:
--   userData, genres, streamingServices, notificationsEnabled
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- para gen_random_uuid()

-- ---------- Usuarios ----------
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(120) NOT NULL,
  email           VARCHAR(180) NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  avatar_url      TEXT DEFAULT 'img/avatar.jpg',
  level_label     VARCHAR(80) DEFAULT 'Cinéfilo Nivel 1',   -- "Cinéfilo Nivel 23"
  member_since    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Catálogo de géneros (global, no por usuario) ----------
CREATE TABLE IF NOT EXISTS genres (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(60) NOT NULL UNIQUE,     -- "Sci-Fi", "Drama", etc.
  tmdb_genre_id   INTEGER UNIQUE                   -- para futura integración TMDB
);

-- Relación usuario <-> género favorito (el "active" del front)
CREATE TABLE IF NOT EXISTS user_genres (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  genre_id        INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  active          BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, genre_id)
);

-- ---------- Catálogo de proveedores de streaming (global) ----------
CREATE TABLE IF NOT EXISTS streaming_providers (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(60) NOT NULL UNIQUE,    -- "Netflix", "HBO Max"
  icon_label       VARCHAR(10) NOT NULL,           -- "N", "H", "D+", "P" (fallback visual)
  color_hex        VARCHAR(7) NOT NULL,            -- "#E50914"
  tmdb_provider_id INTEGER UNIQUE,                 -- para futura integración TMDB/JustWatch
  logo_url         TEXT                            -- para cuando se sume el logo real
);

-- Relación usuario <-> servicio conectado/activo
CREATE TABLE IF NOT EXISTS user_streaming_services (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id     INTEGER NOT NULL REFERENCES streaming_providers(id) ON DELETE CASCADE,
  active          BOOLEAN NOT NULL DEFAULT true,
  connected_at    TIMESTAMPTZ,                     -- fecha real de conexión (cuando haya OAuth/API)
  last_synced_at  TIMESTAMPTZ,                      -- para cuando haya sync real
  PRIMARY KEY (user_id, provider_id)
);

-- ---------- Preferencias de notificaciones ----------
CREATE TABLE IF NOT EXISTS notification_settings (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled         BOOLEAN NOT NULL DEFAULT true
  -- a futuro: columnas granulares (estrenos, alertas, reseñas) si el front las separa
);

-- ---------- Seed mínimo de catálogos (idempotente) ----------
INSERT INTO genres (name) VALUES
  ('Sci-Fi'), ('Drama'), ('Thriller'), ('Acción'), ('Terror'), ('Comedia')
ON CONFLICT (name) DO NOTHING;

INSERT INTO streaming_providers (name, icon_label, color_hex) VALUES
  ('Netflix', 'N', '#E50914'),
  ('HBO Max', 'H', '#002be7'),
  ('Disney+', 'D+', '#0063e5'),
  ('Prime', 'P', '#ff9900')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- Películas, recomendaciones y reviews
-- ============================================================

-- ---------- Catálogo de películas ----------
CREATE TABLE IF NOT EXISTS movies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           VARCHAR(200) NOT NULL,
  overview        TEXT,
  poster_url      TEXT,
  release_year    INTEGER,
  duration_min    INTEGER,
  tmdb_id         INTEGER UNIQUE,          -- para futura integración TMDB (opcional)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Muchos-a-muchos: una película puede tener varios géneros
CREATE TABLE IF NOT EXISTS movie_genres (
  movie_id        UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  genre_id        INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, genre_id)
);

-- Muchos-a-muchos: una película puede estar en varias plataformas
CREATE TABLE IF NOT EXISTS movie_providers (
  movie_id        UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  provider_id     INTEGER NOT NULL REFERENCES streaming_providers(id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_movie_genres_genre ON movie_genres(genre_id);
CREATE INDEX IF NOT EXISTS idx_movie_providers_provider ON movie_providers(provider_id);

-- ---------- Reviews ----------
CREATE TABLE IF NOT EXISTS reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  movie_id        UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, movie_id)   -- una review por usuario por película (se edita, no se duplica)
);

CREATE INDEX IF NOT EXISTS idx_reviews_movie ON reviews(movie_id);

-- ---------- Seed de películas de prueba ----------
INSERT INTO movies (id, title, overview, poster_url, release_year, duration_min) VALUES
  (gen_random_uuid(), 'Nébula Roja', 'Una tripulación queda varada en una nebulosa que altera la mente.', NULL, 2023, 118),
  (gen_random_uuid(), 'El Último Testigo', 'Un detective retirado investiga un crimen que lo persigue hace 20 años.', NULL, 2021, 104),
  (gen_random_uuid(), 'Risas de Medianoche', 'Una comedia sobre cinco amigos atrapados en una cabaña una noche de tormenta.', NULL, 2022, 96)
ON CONFLICT DO NOTHING;
