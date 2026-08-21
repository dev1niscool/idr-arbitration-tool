# Federal IDR Offer Console

A local decision-support web app for reviewing Federal IDR arbitration outcomes by CPT code, geography, certified IDR entity, place of service, and data period.

The app uses a compact JSON dataset generated from the local CMS Federal IDR PUF files plus the billing-code files in this project. It is decision support only, not legal, coding, reimbursement, or valuation advice.

## Local Development

From this folder:

```bash
pnpm install
pnpm run dev
```

Open the local URL printed by the dev server, usually:

```text
http://localhost:3000/
```

The app reads:

```text
public/idr-data.json
```

That file is intentionally uncompressed so local development and GitHub Pages both behave predictably.

## Refresh the Data

If the CMS source files or billing-code mappings change, rebuild the JSON dataset:

```bash
python3 scripts/build_idr_data.py
```

Then restart the dev server or refresh the browser.

## GitHub Pages Upload

GitHub Pages only serves static files, so use the static export command:

```bash
pnpm run build:pages
```

This creates:

```text
docs/
```

The `docs/` folder contains a static `index.html`, compiled assets, and `idr-data.json`.

To publish:

1. Create a GitHub repository.
2. Commit and push this project, including the generated `docs/` folder.
3. In GitHub, open `Settings` -> `Pages`.
4. Under `Build and deployment`, choose `Deploy from a branch`.
5. Select branch `main` and folder `/docs`.
6. Save, then wait for GitHub to show the Pages URL.

The JSON dataset is about 33 MB, which is below GitHub's single-file limit. The first page load can take a moment because the browser downloads that data before rendering the dashboard.

## Entity-Specific Data

Confirmed from the local CMS PUF documentation: `Certified IDR Entity` is available beginning with 2025 Q3. The 2025 Q3/Q4 source files include that field; earlier years and 2025 Q1/Q2 are pooled as `Not reported in selected source`.

Use the `Entity-labeled only: 2025 Q3 and Q4` checkbox in the app when you want the analysis to use only rows where certified IDR entities are labeled.

## Notes

- CMS-suppressed dollar cells are counted in outcome totals, but excluded from amount statistics and recommendation modeling.
- The recommendation model estimates win probability from comparable historical provider-offer-to-QPA ratios.
- Expected value uses the proposed provider offer if the provider wins and the median issuer offer as the loss-side proxy.
