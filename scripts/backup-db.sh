#!/usr/bin/env bash
# Backup lógico do banco, criptografado. Uso: SUPABASE_DB_URL=... BACKUP_PASSPHRASE=... scripts/backup-db.sh <arquivo-de-saída.sql.gz.gpg>
# Os dados são pessoais (GDPR): o arquivo SEMPRE sai criptografado. Nunca imprime a URL nem a senha.
set -euo pipefail
out="${1:?informe o arquivo de saída}"
: "${SUPABASE_DB_URL:?defina SUPABASE_DB_URL}"
: "${BACKUP_PASSPHRASE:?defina BACKUP_PASSPHRASE}"
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --schema=public --schema=auth --schema=storage \
  | gzip -9 \
  | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 -o "$out" 3<<<"$BACKUP_PASSPHRASE"
test -s "$out"
echo "backup ok: $(wc -c < "$out") bytes"
