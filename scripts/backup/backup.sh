#!/usr/bin/env bash
# Dump + bundle + encrypt. Prints the path of the encrypted file on the last line;
# also writes <work-dir>/<name>.summary.txt (no secrets, no student data).
#
#   DATABASE_URL=... scripts/backup/backup.sh <work-dir> [name]
#
# Plaintext (the dump holds login hashes and student records) exists only inside
# <work-dir> on the throwaway runner and is deleted before this returns.
# Encrypted to every public key in age-recipients.txt (the private key stays
# offline with Hassan; see docs/backup-restore.md).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=${1:?usage: backup.sh <work-dir> [name]}
name=${2:-school-db-$(date -u +%Y%m%d-%H%MZ)}
recipients=${AGE_RECIPIENTS_FILE:-$here/age-recipients.txt}

if ! grep -q '^age1' "$recipients"; then
  echo "No public key in $recipients. Add the age public key (age1...) first: docs/backup-restore.md step 1." >&2
  exit 1
fi

mkdir -p "$work/$name"
trap 'rm -rf "${work:?}/${name:?}" "${work:?}/${name:?}.tar"' EXIT
"$here/dump.sh" "$work/$name" >&2
# Non-sensitive summary (versions, table names, row counts) for the release notes.
{ cat "$work/$name/meta.txt"; echo; echo "rows per table:"; cat "$work/$name/counts.tsv"; } > "$work/$name.summary.txt"
tar -C "$work" -cf "$work/$name.tar" "$name"
age --encrypt --recipients-file "$recipients" --output "$work/$name.tar.age" "$work/$name.tar"
echo "$work/$name.tar.age"
