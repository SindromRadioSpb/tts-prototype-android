# LinguistPro UI sprite provenance

> Date: 2026-08-15  
> ROOM-UX-VF slice: `VF0`  
> Source repository: `https://github.com/lucide-icons/lucide`  
> Upstream: Lucide `1.27.0`  
> Upstream commit: `4aec3f892fd6c23063bc2fead83c899b5d412b1c`  
> Upstream licence blob SHA-256: `b495047bd93a9b06913511076f504daba17d5bbeb3e0650f3bb53a4220329c57`

## Policy

`linguistpro-ui.svg` contains only the 23 audited system icons below and four first-party LinguistPro marks. Lucide source geometry is copied into same-origin SVG `<symbol>` elements; symbol IDs are renamed to the `lp-icon-*` contract. There is no npm/runtime dependency and no unlisted pack content.

The complete upstream ISC licence and Feather-derived MIT notice are stored verbatim in `lucide-LICENSE.txt`. The first-party `lp-mark-product`, `lp-mark-room`, `lp-mark-studio` and `lp-mark-mentor` symbols were authored for LinguistPro and are not Lucide derivatives.

## Exact upstream sources

| LinguistPro symbol | Upstream source | Source SVG SHA-256 |
|---|---|---|
| `lp-icon-sync` | `icons/refresh-cw.svg` | `2e10dd403c85a24f163d59fc6151aa21147fe9402e1305dfc8979208caee8944` |
| `lp-icon-theme` | `icons/sun-moon.svg` | `d1b183b301763d4674e784fab326cf26c3e6dea7192a0b1e1af3709c8cae73db` |
| `lp-icon-search` | `icons/search.svg` | `283d371c2e433817bb9c0c8310caa6c77fa4177c0f4f1168d9c83b97af7389dc` |
| `lp-icon-settings` | `icons/sliders-horizontal.svg` | `e43a00e5eb684e6cbb61083bed2528d7a3fa5f265693eb2b5f314cd432aa65f4` |
| `lp-icon-play` | `icons/play.svg` | `d7c34786135922a92b6896f6c2384ceeb0346afbf6041dc79982011411409833` |
| `lp-icon-pause` | `icons/pause.svg` | `f122ec4ea7f5693a0b1baafa9c708b53980dc87b4aacb297c6e6f71c1a4c115c` |
| `lp-icon-stop` | `icons/square.svg` | `bd979354f0ab184b95cecf03eedefe40c2dc65830ac6d7e60017b2b25a354acb` |
| `lp-icon-audio` | `icons/volume-2.svg` | `fb404f9c128a0579de67b399177631e5edb3502fdc247ceb30e8b15754b46071` |
| `lp-icon-bookmark` | `icons/bookmark.svg` | `1d5023760db81f21c3b5a63f012ef540acc01932731c733e4645012a876d39f4` |
| `lp-icon-note` | `icons/notebook-pen.svg` | `56705c35e839977bd6f133d7ca4e9c93a6eea563c89e4be125efd0a32e1fa041` |
| `lp-icon-list-add` | `icons/list-plus.svg` | `416b579ca6f60752c31769fced8b30d6271940775dacf980ab85ec8c15268b0c` |
| `lp-icon-train` | `icons/target.svg` | `96a6b16628825a1a207a77e9a5818f74c3e74ea3664783ff5c2a44e6347b90df` |
| `lp-icon-info` | `icons/info.svg` | `bc977a64eb96f3e9c1041ffd09a3fceb70e3e65c02b571f76064062ed31f3cb9` |
| `lp-icon-success` | `icons/circle-check.svg` | `3e519680ab8e2a8ad8f56a340c10d61957d872237aaa868cf324b0900a74f384` |
| `lp-icon-warning` | `icons/triangle-alert.svg` | `4866f38b8560d410f21e3226413e0b77997b6dfbb6931fadfe0a0d5aef9ffeb4` |
| `lp-icon-error` | `icons/circle-x.svg` | `bcd8788901e6f29e1b231a81ba5e707d083d06cb4848a28f29407fab4f8e0b64` |
| `lp-icon-loading` | `icons/loader-circle.svg` | `043021bb903919668804bdb6fee0342072e4ffea5f03fbd857774c440179ad3b` |
| `lp-icon-chevron-left` | `icons/chevron-left.svg` | `83b0681aa38bf55e9d52a1e4b4cced624abe1fe7678ecafda133a574f1161d93` |
| `lp-icon-chevron-right` | `icons/chevron-right.svg` | `2758143d7b2434e4aa7307dfd34405c87909ff4052f21b5f3f40d45224b4f19b` |
| `lp-icon-chevron-down` | `icons/chevron-down.svg` | `66ea878e72ed3488bb3b464c39dfdccee8d1f78e560dccea40e5e12da0e87e87` |
| `lp-icon-chevron-up` | `icons/chevron-up.svg` | `d09f13fcbef3c493ead7e4663b5ee91804fec38d5edb5e7cc3acfbd547641cf4` |
| `lp-icon-close` | `icons/x.svg` | `4a9cdab38fbb96162e7dace28e33f4ca0e49d8963a6162abc3d4691b7d675117` |
| `lp-icon-offline` | `icons/cloud-off.svg` | `f1fa323fe513c96400971a5dac55823d88e41cc2c8cc9219c3ca4c62d46ebe62` |

## Reproduction

1. Check out the upstream commit above.
2. Hash each listed `icons/*.svg` with SHA-256 and compare it to this ledger.
3. Copy only the child geometry into the corresponding 24×24 sprite symbol; keep `fill="none"`, `stroke="currentColor"`, round line caps and joins.
4. Run `node --test tests/visualFoundations.test.js` to verify IDs, executable-content exclusions, subset size and licence/provenance coverage.
