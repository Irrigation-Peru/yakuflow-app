# YakuFlow

Code, data and results for the paper *A Web Application with a Random Forest and a Surrogate Model for
Cropping-Season Project Formulation: Design and Verification* (Tongo Alejandro, Sosa Colca and Rosales Caururu,
Universidad Peruana de Ciencias Aplicadas).

The application guides agronomy students through the nine steps of a cropping-season project, from the site
studies to the irrigation network and its report. The calculation module, the 2D/3D simulation and both machine
learning models (crop recommendation and surrogate for design improvement) run in the browser.

The code comments and the developer guides are in Spanish.

## Contents

| Folder | What it holds |
|---|---|
| `packages/calculo` | Calculation module (water balance, hydraulics, uniformity, cost). No dependencies. |
| `packages/modelos` | The two models exported to ONNX and the code that uses them in the browser. |
| `apps/web`, `apps/api` | Web application (React + Vite) and API (Node + Express + Prisma). |
| `herramientas/verificacion` | Verification of the module against three independent sources (Table 3 of the paper). |
| `herramientas/redes` | Generation of the networks used to train the surrogate, and the contrast with random search and an expert rule (Fig. 4). |
| `entrenamiento` | Training of both models, the data derived from the 2024 National Agricultural Survey, and the results behind Table 4 and Figs. 3 to 5. |

## Reproducing the results

Requirements: Node 24.11.1 and pnpm 11.28.5 (via corepack); Python 3.12 for `entrenamiento`.

```bash
pnpm install
pnpm test        # all automated tests
pnpm verificar   # regenerates Table 3 in herramientas/verificacion/resultados/
```

The surrogate contrast (Fig. 4) is run with `herramientas/redes/src/contrastar.ts`; its header explains the
arguments, including the price variations of the sensitivity analysis. Training and the statistics of Table 4 and
Figs. 3 to 5 are described in `entrenamiento/README.md`. In that file, paths of the form `../crop-app/...` refer to
the root of this repository.

`DESARROLLO.md` explains how to run the application locally, with Docker, and how it is deployed.

## Licenses

- Code: MIT (`LICENSE`).
- Crop dataset (`entrenamiento/data/ena2024_sitio_cultivo.csv` and `entrenamiento/data/piloto`): ODbL 1.0.
- Generated networks and results: CC BY 4.0.

Details and attributions are in `LICENSE-DATA.md`.

## How to cite

See `CITATION.cff`.
