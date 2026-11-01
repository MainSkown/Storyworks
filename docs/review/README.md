# Screenshot review page

To add a milestone or figure, edit data only:

1. Add figures to `docs/review/review.json` (milestone -> sections -> figures; a `"note"` section for the Checked box).
2. Run `node scripts/build-review.mjs <outDir> --shots <dir> --prefix shots/m2` (the prefix matches the figure paths).
3. Publish `<outDir>` as the Artifact with `root=<outDir>` and the printed `files` map.

Files: `review.json` (content), `review.css` (styles), `../../scripts/build-review.mjs` (builder). Without `--shots`, the script only writes `index.html`.
