# Validation record: what has been checked against the outside world

This is a different question from `the verification document`, which resolves specific claims and
citations across the doc corpus (compliance thresholds, physics constants, a few contested
numbers). This file answers a narrower question a researcher asks first:
**which numbers this app produces have been compared against something outside the app, and
which have only ever been compared against the app's own earlier decisions.** Where the two
overlap, this file links to `the verification document` rather than repeating it.

Four bands, from most to least externally checked. A number moves between bands only by being
checked against something new; nothing here is upgraded on the strength of an argument.

## 1. Externally arbitrated: checked against a named physics oracle

Every step of the solar geometry and the PV chain is checked against a named external reference,
in a test file a reader can run.

| Step | Oracle | Test |
|---|---|---|
| Solar position | NREL/TP-560-34302 worked example; `pvlib.solarposition.spa_python` | `src/sim/solar.test.ts` (`< 0.001 deg` on every angle); `crates/agv-sim/tests/nrel_spa.rs` |
| Irradiance decomposition (Erbs, DISC, DIRINT, Engerer2) | Erbs 1982's published polynomial; `pvlib`'s published DIRINT and DISC output | `crates/agv-sim/tests/pvlib_decomposition.rs` |
| Plane-of-array transposition (Perez 1990) | `pvlib.irradiance.perez`, all eight sky-clearness bins | `crates/agv-sim/tests/pvlib_transposition.rs` (`< 0.1 W/m2`) |
| Ground/module view factor (degenerate infinite-row case) | `pvlib.bifacial.utils.vf_ground_sky_2d` | `src/sim/shading.test.ts` (`vfGroundSky2dOracle`, `0.002` absolute) |
| PV chain loss stack | PVWatts v5's own documented default combined loss (14.08%) | `src/sim/pv/chain.test.ts` (`combinedLossFraction(PVWATTS_DEFAULT_LOSSES)`) |
| Module temperature, inverter clipping | Faiman 2008; King et al. 2007 (Sandia inverter model), by formula | `src/sim/pv/*.ts`, cited inline and in `PV_CHAIN_PROVENANCE` |

Two things worth stating plainly rather than leaving implicit:

- The view-factor oracle is a **unit-test oracle only**. Decision Record 2.1 in `00-DECISIONS.md`
  is explicit that `vf_ground_sky_2d` is valid solely for the degenerate infinite-row case, and that
  the production ground-shading path is an explicit per-panel polygon projection. Pvlib doesn't
  ship a finite-array model, so there's no pvlib equivalent to diff the production path against.
  The polygon projection is checked against PVsyst and SketchUp by Zainali et al. 2023 (R² 0.99 to
  1.00, 0.3% daily error on a clear-sky day), which is literature backing for the method rather
  than a repo-level oracle test.
- The plane-of-array transposition (Perez 1990, `crates/agv-sim/src/transposition.rs`) was the
  one step in the chain with no oracle when this file was first written, and it has one now:
  `crates/agv-sim/tests/pvlib_transposition.rs` diffs fourteen skies against
  `pvlib.irradiance.perez` and agrees to better than a tenth of a watt on sky diffuse figures that
  run to 360 W/m2. The cases are chosen so every one of the eight coefficient rows is exercised,
  and `bins_are_all_covered` fails if a later edit thins them out.

  **Writing that test found a bug, and it is the reason this band is worth filling in rather than
  arguing about.** Perez 1990 is fitted against the sea-level air mass; DISC and DIRINT want the
  pressure-corrected one. `the solar geometry document` said in one line that Kasten-Young was
  "needed by Perez and DIRINT", the chain read both off the same field, and the transposition had
  been getting the pressure-corrected value since the model was written. Measured against pvlib
  over a clear-sky year, what that cost, as annual plane-of-array global on a fixed 30-degree
  south array and on a vertical east-west one:

  | Site | Elevation | Fixed 30 south | Vertical east |
  |---|---|---|---|
  | New Brunswick NJ | 26 m | +0.003% | +0.013% |
  | Tucson AZ | 728 m | +0.047% | +0.215% |
  | Boulder CO | 1,830 m | +0.297% | +1.012% |
  | Leadville CO | 3,094 m | +0.507% | +1.771% |

  So at the elevation this tool is most likely to be used at the error was invisible, and at a
  mountain site with vertical panels it reached 1.8%: smaller than the model's own uncertainty,
  large enough to be wrong for a reason nobody could have found by reading the output. The chain
  recomputes the sea-level air mass from the zenith now, the field on `TranspositionInput` is
  named for the convention it wants, and `src/sim/pv/chain.test.ts` pins that the
  pressure-corrected series cannot reach the transposition at all.

None of this bears on agronomy. A perfectly placed shadow says nothing about whether the plant
under it fruits, and the rest of this file is about the part that does.

## 2. Checked against published trials: the new work in this file

Before this revision, `src/recommend/` had no external oracle at all: `yield.test.ts` checks that a
caveat code doesn't collide with another caveat code, which is a real regression to guard but not
a check against anything outside the code. `src/recommend/shade-validation.test.ts` is new, and it
drives the same functions `season.ts` calls in production (`laubCurve`, `laubCentralRelativeYield`,
`laubRelativeYield`) at a real trial's shade level, for the crop the trial grew, and compares.

**The Laub et al. 2022 anchor data itself** (`laub2022-shade-meta`, the meta-analysis this app's
whole shade-response model is built on) was read directly from the open-access PDF,
rather than taken on the repo's own word. Seven of the nine crop groups' 40%-RSR figures, three
groups' benefit-optimum RSR, and the full ANOVA table (every degrees-of-freedom, F and p value)
match the paper's own printed numbers to within one percentage point, most exactly. The other two
groups (tubers/root crops, C3 cereals) aren't spelled out as prose sentences in the paper's main
text, only in a supplementary Table S2 that was not fetched, so they carry the repo's existing
derivation rather than a claim of fresh verification.

| Trial | Crop(s) | Site, water status | Shade level | Trial finding | This app predicts | Agreement |
|---|---|---|---|---|---|---|
| Marrou et al. 2013a (`marrou2013-lettuce-rue`) | Lettuce | Montpellier FR, irrigated, **not** water-limited by design | RSR 30% and 50% | Relative yield >= relative available radiation at both levels (paper's own headline finding) | 94% at 30% RSR, 76% at 50% RSR (leafy-vegetables curve) | **Agrees**, with room to spare: the app predicts a smaller loss than the paper's own floor at both levels |
| Barron-Gafford et al. 2019 (`barron-gafford2019-arizona`) | Chiltepin pepper, jalapeno, cherry tomato | Biosphere 2, Tucson AZ, irrigated desert, water-limited | Not stated numerically in the paper (Fig. 2A shows PAR roughly halved, graphically only) | Chiltepin 3x control, cherry tomato 2x control (both P<0.01), jalapeno statistically unchanged | At most 108% central, 161% at the very top of its own 95% band, at any RSR the app defines, water-limited gate open | **Agrees on direction** (shade can help), **disagrees on magnitude by roughly 2 to 3x**. Laub's meta-analysis pools mostly non-desert sites, so it can't see the size of relief a semi-arid, high-VPD, irrigated site gets, which the agrivoltaics document section 2.2 already flags as this trial's least generalisable feature |
| Weselek et al. 2021 (`weselek2021-potato`) | Potato | Heggelbach DE, ~30% RSR, 2018 drought year read as water-limited | RSR ~30% | Potato +11% (2018 drought), roughly -7% (2017 normal) | 72% central regardless of the water-limitation flag; 103% at the very top of the water-limited 95% band | **Disagrees**, in a specific, structural way: see finding 1 below |
| Weselek et al. 2021 (`weselek2021-potato`) | Winter wheat (catalogue stand-in: spring wheat, same species) | Heggelbach DE, ~30% RSR, 2018 drought year read as water-limited | RSR ~30% | Wheat +2.7% (2018 drought), roughly -8% (2017 normal) | 73% central regardless of the water-limitation flag; 88% at the top of the water-limited 95% band | **Disagrees**, same structural reason |

**Looked for, and couldn't use.** Marrou et al. 2013b (`marrou2013-microclimate`), the companion
cucumber trial, reports growth-rate differences confined to the juvenile
phase rather than a final per-area yield ratio, so it can't be reduced to the yield-ratio comparison
this file makes for the other trials. Amaducci et al. 2018 (`amaducci2018-maize`), the rainfed-maize
paper Decision Record 6 itself cites, reports that shaded maize yield was "higher and more stable"
under drought stress, without a comparison yield ratio a test could pin; it appears below as a
qualitative check rather than a numeric one.

## 3. What the water-limitation gate can and cannot do

Decision Record 6 gates the shade-benefit pathway on water limitation, citing Barron-Gafford's
Arizona gains as the reason it exists at all, and citing the Amaducci-vs-Laub tension over maize as
part of the motivation. `laubRelativeYield` implements the gate as a single ceiling: at a
non-water-limited site the predicted band is clipped so it can never exceed 100%; at a
water-limited site the clip lifts and the raw Laub curve passes through unchanged.

That's the whole mechanism, and it has a consequence the decision record doesn't state: **the clip
can only matter for a crop group whose raw curve rises above 100% somewhere in its own range.**
Checked directly against the shipped data across every RSR the app defines (5% to 90%):

- **Berries, fruits, fruity vegetables and forages** do rise above 100% at low RSR. For these four
  groups the gate does what Decision Record 6 describes: a water-limited site can show a modelled
  benefit, and a non-water-limited site is held at parity.
- **Maize and grain legumes** never rise above 100% at any RSR, central estimate or 95% upper
  bound. For these two groups, water limitation changes nothing: `shade-validation.test.ts` asserts
  the two bands are bit-for-bit identical at every RSR level. The gate leaves this app exactly as
  far from Amaducci's rainfed-maize finding either way, because the ceiling it lifts is one the
  curve never reaches.
- **Tubers/root crops and C3 cereals** sit in between: the central estimate never exceeds 100%
  (so potato and wheat's central predictions are also unmoved by the gate, which is the Weselek
  disagreement in the table above), but the *upper* 95% bound briefly does, by a few percentage
  points, between roughly 5% and 30% RSR for tubers. That's why the water-limited potato band's top
  edge (103%) lands closer to Weselek's +11% than the maize case gets to Amaducci's finding, though
  it still falls short.

The arithmetic behind the cap is applied correctly and consistently. The gap sits between what the
decision record's prose implies the gate can do (move this app toward Amaducci's maize finding, and
by extension toward Weselek's drought-year potato and wheat) and what a ceiling-only gate on Laub's
*pooled, mostly non-water-limited* curves can actually produce for crop groups whose pooled curve
never predicted a benefit in the first place. Closing that gap would mean sourcing a response curve
specific to water-limited sites for these four groups (a search found none, since
Laub's meta-analysis doesn't stratify by water status), or moving the gate from a ceiling to a
shift. Both are modelling decisions this file surfaces rather than resolves.

## 4. Internally consistent only: no external oracle exists

These rest on this project's own decisions, checked against each other and against internal
regression tests, and nowhere else:

- **The crop ranking and scoring weights** in `src/recommend/stages/rank.ts` and the design-search
  scoring in `src/recommend/design.ts` (`DEFAULT_WEIGHTS`, the min-max normalised score terms).
  Nothing in the literature ranks agrivoltaic garden layouts; these are this app's own trade-off
  choices, tested for internal properties (determinism, `scoreResolution`) rather than against a
  published ranking.
- **The polyculture and companion-planting rules**, graded A through E in `docs/00-DECISIONS.md`
  section 11. Grades A and B carry a real citation and a measured effect size; C is a single study
  or lab-only result, rendered as "experimental"; D and E are folklore, rendered only in a labelled
  panel and never scored. The grading itself, and which claim gets which grade, comes from this
  project's own literature reading; no external body has audited the classification.
- **Pest pressure and suppression** in `src/simulation/pests.ts`. Decision Record 14.2 says this
  plainly: "the share of a harvest lost at full pressure is the one unsourced number in the mode,"
  carried through `unsourcedClaim` so it stays visible in the provenance ledger rather than reading
  as measured. The spatial dilution mechanism has a named source (`undersown-cover-host-finding`);
  the magnitude doesn't.
- **The drought penalty inside a season** (`soilWaterStage`, `droughtPenalty`) is this app's own
  FAO-56 water-balance implementation, a real, cited method, but the specific yield penalty it
  imposes for a given depletion hasn't been checked against a field trial's actual drought-year
  yield loss the way the shade curve now has been.
- **The seeded random draw** a season takes inside a crop's Laub band (`drawInBand` in
  `src/simulation/season.ts`) is a modelling choice (uniform in log space, because the confidence
  interval is symmetric in log space) with no external check possible: a trial reports a mean and
  an interval across replicate plots rather than the single-season realisation a random draw would
  need something to compare against.
- **The DLI gate** that decides whether a crop can grow in a bed at all is a different mechanism
  from the shade-yield curve this file checks, and it rests on thinner evidence.
  `the verification document`'s "Searched and not found" section already states it: 167 of the 174
  per-crop DLI rows are Tier C, inferred from the crop's garden sun label through the app's own
  conversion and citing only the class methodology, and the three Tier A rows (leaf and head
  lettuce, basil) are read from per-crop trials that place no failure point and say so on the
  record (Decision Record 23). This file's new test doesn't touch the DLI gate; a crop that
  clears it can still have its realised yield checked here, but whether it clears the gate at
  all is a separate, thinner claim.

## 5. Not validated at all: measured in no garden

No number in this app, before or after this revision, has been compared against an actual garden's
harvest. Every trial in section 2 is a research field plot: fenced, instrumented, replicated, run
by agronomists. None is a home garden, and none matches the scale, management style or climate
range this app targets. A grower reading their own harvest tally against this app's prediction
would be doing something this project has never done for them.

## The one-line answer

Solar position, irradiance decomposition and the plane-of-array energy chain are checked against
named physics oracles (pvlib, NREL, PVWatts v5) in the test suite; the shade-to-yield curve is now
checked against three published field trials, agreeing with one, agreeing on direction but not
magnitude with a second, and disagreeing with a third for a specific, now-documented structural
reason; the crop ranking, polyculture rules, pest and drought terms, and the DLI gate that decides
whether a crop grows at all rest on this project's own literature reading with no external check;
and nothing anywhere in the app has been compared against a real garden's harvest.
