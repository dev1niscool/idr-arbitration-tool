# Federal IDR Offer Console

A local decision-support web app for reviewing Federal IDR arbitration outcomes by CPT code, state and market geography, certified IDR entity, place of service, and data period.

The app uses an uncompressed JSON dataset generated from the local CMS Federal IDR PUF files plus the billing-code files in this project. It is decision support only, not legal, coding, reimbursement, or valuation advice.

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
- The historical outcome plot shows every exact-filter row with a reported provider offer and provider/plan outcome. Green dots are provider wins and red dots are plan wins; hovering shows the row details available in the local dataset.
- The offer bucket comparison sorts those exact-filter outcome rows by provider offer and divides them into six roughly equal-count groups. It compares each group's median provider offer, provider/plan win counts, and observed provider win rate.
- The offer curve estimates the local historical provider win rate among rows with nearby provider offer amounts, using adaptive nearest-neighbor smoothing and modest shrinkage toward the selected model cohort's base win rate. The supported curve may rise or fall with the observed outcomes and is not a causal estimate of changing the offer on the same case.
- The offer curve uses a linear dollar axis beginning at the lowest provider offer in the exact selected cohort. Its default endpoint is that cohort's 99th-percentile provider offer.
- `Show extrapolation` expands the solid curve through the highest observed exact-cohort offer, then reveals a dashed sensitivity tail beyond observed data that decays to zero. Extrapolated points are never eligible for recommendation.
- Double-click the offer curve's rightmost x-axis amount to enter a smaller maximum for the current view.
- Expected value uses the proposed provider offer if the provider wins and the median issuer offer as the loss-side proxy.
- Multi-state CMS markets appear under every state named in the geography. For example, Chicago-Naperville-Elgin, IL-IN-WI is available under Illinois, Indiana, and Wisconsin.
