# Bifurcation Lab — Coronary Stent Simulator (Level 1 educational MVP)

Browser-based teaching and research tool for coronary bifurcation PCI. React + TypeScript + React Three Fiber, built with Vite.

> This application is intended for education and research. Illustrative visualizations are not validated predictions of device-specific mechanical behaviour. Calculated outputs depend on the available data and model assumptions. The application does not replace clinical judgment, device instructions for use or appropriate intravascular imaging.

## Run

```bash
npm install
npm run dev        # development server
npm test           # 74 automated tests (Vitest)
npm run build      # static build in dist/ (deploy to any web host)
SINGLE_FILE=1 npx vite build   # one self-contained dist-single/index.html
```

## Layout

| Module | File |
| --- | --- |
| Anatomy inputs and validation | `src/engine/anatomy.ts` |
| HuoKassabCalculator | `src/engine/huoKassab.ts` |
| BifurcationGeometry | `src/engine/bifurcationGeometry.ts` |
| VesselGeometry (meshes, ostium trimming) | `src/engine/vesselGeometry.ts` |
| StentMeshGenerator (generic illustrative pattern) | `src/engine/stentMeshGenerator.ts` |
| BalloonGeometry (rigid-cylinder contact rule) | `src/engine/balloonGeometry.ts` |
| ProceduralSequence (provisional, DK crush, culotte, TAP, T) | `src/engine/proceduralSequence.ts` |
| Deployment fold / warnings | `src/engine/simulation.ts` |
| MeasurementEngine (every output has a method and basis) | `src/engine/measurementEngine.ts` |
| Report export (HTML, Markdown, CSV, JSON) | `src/engine/report.ts` |
| Future FE solver interface | `src/engine/solver.ts` |
| Device registry (version-controlled JSON) | `src/data/registry.json` |
| Registry schema + runtime validator | `src/data/device-record.schema.json`, `src/data/deviceSchema.ts` |

## Page 1: sizing

Enter the distal main-vessel and side-branch diameters. The proximal main-vessel diameter is calculated by Huo–Kassab (default) or Finet's law (0.678 × (DMV + SB), as given in the EBC 2024 consensus). Each registry stent is sized to the distal main vessel (nearest size, preferring a nearby size with a documented limit) and grouped by whether its documented maximum expansion reaches the proximal diameter, cannot reach it, or has no documented limit. Groups are a filter, not a ranking. "Simulate techniques with this stent" loads the anatomy and stent into page 2 (techniques).

## Device data policy

* Evidence labels: VERIFIED MANUFACTURER SPECIFICATION, PUBLISHED BENCH MEASUREMENT, DERIVED FROM VERIFIED DATA, ILLUSTRATIVE ASSUMPTION, DATA UNAVAILABLE.
* Every value cites a source (URL, revision, access date 2026-10-19). Records failing validation never reach the simulator.
* No radial/longitudinal strength, recoil or foreshortening data are entered (no traceable source), so these show "Data unavailable".
* Bench data added 2026-10-20 from three user-supplied articles, each value cited and bound to the exact product named in the paper:
  * Öner et al., Eur J Med Res 2021;26:121 (doi 10.1186/s40001-021-00595-7): side-branch cell opening after 2.0–4.0 mm NC balloons, connectors/crowns/rings, cell perimeter and IFU Max ID for the 3.0 mm Orsiro, XIENCE Sierra, Resolute Integrity, Promus PREMIER Select and Supraflex Cruz.
  * Foin et al., EuroIntervention 2013;8:1315–1325 (doi 10.4244/EIJV8I11A200): workhorse designs, micro-CT overexpansion (MLD, MSA), crown angles and cell opening for BioMatrix Flex and Resolute Integrity. PROMUS Element, XIENCE PRIME, TAXUS Liberté and CYPHER SELECT were not added.
  * Mehmedbegović et al., Rev Cardiovasc Med 2023;24:266 (doi 10.31083/j.rcm2409266): design rows (strut, connectors, sizes, labelled limits) treated as a secondary source. Its bench rows are entered only as caveated bench tests, never as the SB cell-opening field, because its Table 1 attributes them to Öner 2021, which did not test those devices and reports different values. Its "Synergy" and "Ultimaster" columns name no generation and are recorded as limitations only.
  * New records: Orsiro (original), XIENCE Sierra, Resolute Integrity, Promus PREMIER, Promus PREMIER Select. Conflicts (e.g. Resolute Onyx MSID 5.0/6.0 mm vs the review's 4.75/5.75 mm) keep the manufacturer value and note the discrepancy.
* Expansion limits (max expansion and minimal expansion diameter at a stated pressure) for XIENCE Skypoint, Onyx Frontier, SYNERGY XD, SYNERGY MEGATRON, Ultimaster Nagomi and Orsiro Mission come from the EBC consensus, Table 3 (Burzotta et al., EuroIntervention 2024;20:e915–e926, doi 10.4244/EIJ-D-24-00160). Supraflex Cruz, BioMatrix Flex, Ultimaster Tansei and the 2015 SYNERGY record are not in that table.
* No transfer between generations: XIENCE Skypoint, Resolute Onyx, Onyx Frontier, SYNERGY (2015 spec sheet), SYNERGY XD, SYNERGY MEGATRON, Orsiro Mission, Supraflex Cruz, Ultimaster Tansei, Ultimaster Nagomi and BioMatrix Flex are separate records.
* Notable gaps: SYNERGY pressures (spec-sheet table ambiguous), Ultimaster strut thickness, BioMatrix Flex sizes and strut thickness (literature range 114–120 µm not size-specific), original Orsiro (only Orsiro Mission accessible).
* Add platforms in the app (Device registry → Administrator) or by adding a record to `registry.json`; `npm test` validates it.

## Modelling assumptions (all illustrative)

* Geometry mode A: generic sinusoidal-ring mesh mapped to the nominal diameter. Device-specific inputs are strut thickness, documented connector count and size only.
* Balloons are rigid cylinders at labelled diameter; pressure is recorded and checked against documented RBP, never converted into diameter.
* Struts inside an inflating balloon move to its surface; struts never recoil or move inward.
* Kissing overlap constraint: strut distance from the MV axis in the proximal side-by-side zone is capped at max(reference radius, radius of a circle with the combined balloon area).
* DK crush follows the published order (SB stent → balloon crush → first kiss → MV stent → POT → rewire → final kiss → final POT), not the order in the original brief.
* Lesion lengths may be 0 (no disease in that segment); diameters and angle must be > 0.
* Calcification/vessel rigidity is not offered because the illustrative engine has no vessel mechanics.
* Balloon/strut animation is visual only: folded balloon unfolds to its labelled diameter and struts move from the previous stage (or a 0.5 mm crimped radius) to the simulated position. The pressure readout ramps for timing only. Respects prefers-reduced-motion; compare viewers do not animate.
* Mechanical simulation is not available in this build.
