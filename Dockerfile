# syntax=docker/dockerfile:1
#
# Production image for Coolify (or any Docker host).
# Nginx + PHP-FPM in one container, listening on port 8080.
# Migrations and first-run setup happen when the container starts.

############################################
# 1. Front-end: build the React app
############################################
FROM node:22-alpine AS assets

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY vite.config.js tsconfig.json ./
COPY resources ./resources
RUN npm run build

############################################
# 2. The application
############################################
FROM serversideup/php:8.3-fpm-nginx

# gd: product photo resizing · exif: upright phone photos · intl: Laravel number/date helpers
USER root
RUN install-php-extensions gd exif intl
USER www-data

# AUTORUN: on every start, run migrations and cache config/routes/views (serversideup automations).
ENV PHP_OPCACHE_ENABLE=1 \
    PHP_UPLOAD_MAX_FILE_SIZE=16M \
    PHP_POST_MAX_SIZE=20M \
    PHP_MEMORY_LIMIT=256M \
    AUTORUN_ENABLED=true \
    AUTORUN_LARAVEL_MIGRATION=true

WORKDIR /var/www/html

# Dependencies first, so this layer is reused while only app code changes.
COPY --chown=www-data:www-data composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --prefer-dist --no-scripts --no-autoloader

COPY --chown=www-data:www-data . .
COPY --chown=www-data:www-data --from=assets /app/public/build ./public/build

RUN composer dump-autoload --optimize --no-dev \
    && mkdir -p public/uploads/products \
        storage/framework/cache/data storage/framework/sessions storage/framework/views \
        storage/logs bootstrap/cache

# Runs after the migrations: creates roles and the first owner on an empty database.
COPY --chmod=755 docker/entrypoint.d/ /etc/entrypoint.d/
