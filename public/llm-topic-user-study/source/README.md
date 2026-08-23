# Source snapshot

`single-image-eval.snapshot.csv` is a frozen export of the public Google Sheet tab
`single-image-eval` from spreadsheet
`16WWxJHgozxC7amFVVbz7Ywr4d4ovfXqJ-MA6pTiDliA`, captured on 2026-07-26.

The sheet contains 29 trial rows plus one author note row with no filename. Data loaders
explicitly ignore non-trial rows without a filename and then enforce the 10-image,
29-trial contract.

To check the live sheet without changing the snapshot:

```powershell
node scripts/sync-google-sheet.mjs
```

To intentionally update the snapshot:

```powershell
node scripts/sync-google-sheet.mjs --write
yarn study:prepare
```

Always review the resulting diff and rerun the data and browser tests.
