#!/usr/bin/env bash
# Backup lógico do banco, criptografado. Uso: SUPABASE_DB_URL=... BACKUP_PASSPHRASE=... scripts/backup-db.sh <arquivo-de-saída.sql.gz.gpg>
# Os dados são pessoais (GDPR): o arquivo SEMPRE sai criptografado. Nunca imprime a URL nem a senha.
set -euo pipefail
out="${1:?informe o arquivo de saída}"
: "${SUPABASE_DB_URL:?defina SUPABASE_DB_URL}"
: "${BACKUP_PASSPHRASE:?defina BACKUP_PASSPHRASE}"
# Diagnóstico sem revelar segredos: usuário, host, porta e formato da senha.
python3 - <<'PY' >&2
import os, re
from urllib.parse import urlsplit
u = os.environ["SUPABASE_DB_URL"].strip()
p = urlsplit(u)
pw = p.password or ""
print(f"diag: esquema={p.scheme} usuario={p.username} host={p.hostname} porta={p.port} banco={p.path}")
print(f"diag: tamanho_da_senha={len(pw)} tem_colchetes={'[' in pw or ']' in pw} tem_YOUR={'YOUR' in pw.upper()} so_letras_e_numeros={bool(re.fullmatch(r'[A-Za-z0-9]+', pw))}")
print(f"diag: usuario_tem_codigo_do_projeto={'.' in (p.username or '')}")
PY
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --schema=public --schema=auth --schema=storage \
  | gzip -9 \
  | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 -o "$out" 3<<<"$BACKUP_PASSPHRASE"
test -s "$out"
echo "backup ok: $(wc -c < "$out") bytes"
