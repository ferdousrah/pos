#!/bin/sh
# Runs on every container start, after serversideup's Laravel automations (50-*) have migrated the database.
# The seeder only acts on an empty database, so redeploys never touch existing data.

echo "Kontor: checking first-run setup..."
php /var/www/html/artisan db:seed --force --no-interaction || echo "Kontor: first-run setup failed — see the message above. The app will still start."
