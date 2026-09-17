import { citedComputed } from '../../types/cited'
import type { Cited } from '../../types/cited'

/**
 * Every stage of the chain carries its own provenance, and `EnergyPanel` prints all of it.
 *
 * This file used to say, five times over, that Faiman 2008, King et al. 2004 and Dobos 2014 were
 * "not yet in docs/CITATIONS.csl.json" and name pvlib and the Sandia modelling guide as
 * surrogates. All four primaries are in the corpus and were when that sentence was written: it
 * was stale, and being stale it told every reader of the energy panel that this chain was more
 * loosely sourced than it is. The surrogates stay listed beside the primaries, because the
 * coefficient values here were in fact read out of pvlib's implementation rather than off the
 * papers, and that is a different claim from having no paper at all
 */
/**
 * The human half of a stage's description, without the equation.
 *
 * Every entry below is written as "what this stage is: how it is computed", or as prose with no
 * equation at all. `EnergyPanel` prints the whole thing, which is right for a reference section
 * somebody scrolled to. A conversational answer to "how many kWh will it make" is not that: an
 * equation in a chat bubble on a 375px phone is noise between a grower and the sentence that
 * actually qualifies the figure, and it is detail, which is the one thing this app allows to be
 * hidden. A caveat is never detail, so the caveat beside it always stays.
 *
 * It lives here, beside the strings, because it is a fact about how they are written
 */
export const stageOf = (cited: Cited<string>): string => cited.value.split(': ')[0] ?? cited.value

export const PV_CHAIN_PROVENANCE: readonly Cited<string>[] = [
  citedComputed(
    'Cell temperature, Faiman: T_cell = T_air + G_poa / (u0 + u1 * v_wind), u0 = 25.0, u1 = 6.84',
    'B',
    ['faiman2008-module-temperature', 'pvlib-python', 'sandia-pvpmc'],
    'faiman-2008',
    'Default model: it needs only air temperature and wind speed, its two coefficients are determined by the IEC 61853-2 procedure, with no per-module-construction figures needed, and a free-standing rack is what an elevated agrivoltaic structure is. The coefficient values are pvlib’s defaults, read from its implementation. The paper states none of them',
  ),
  citedComputed(
    'Cell temperature, Sandia/King: T_cell = G_poa exp(a + b v_wind) + T_air + (G_poa / 1000) dT',
    'B',
    ['king2004-sapm', 'pvlib-python', 'sandia-pvpmc'],
    'sapm-cell-temperature',
    'The default is Faiman instead: a, b and dT here are empirical per module construction and mounting, and this app has none of them for a user-entered module',
  ),
  citedComputed(
    'DC power, PVWatts v5: Pdc = (G_poa / 1000) Pdc0 (1 + gamma (T_cell - 25)), gamma = -0.0047 per degree C',
    'B',
    ['dobos2014-pvwatts-v5', 'pvlib-python'],
    'pvwatts-v5-dc',
    null,
  ),
  citedComputed(
    'Inverter, PVWatts v5 efficiency curve with a hard AC limit, eta_nom = 0.96 against eta_ref = 0.9637',
    'B',
    ['dobos2014-pvwatts-v5', 'king2007-sandia-inverter', 'pvlib-python'],
    'pvwatts-v5-inverter',
    'Clipping is modelled, because agrivoltaic layouts run high DC:AC ratios. The Sandia/CEC inverter model is cited here as the alternative that was left unused, it would need per-inverter coefficients this app lacks',
  ),
  citedComputed(
    'System losses, PVWatts v5 default stack combining multiplicatively to 14.08%, each component individually overridable',
    'B',
    ['dobos2014-pvwatts-v5', 'pvlib-python'],
    'pvwatts-v5-losses',
    'The shading component is set to zero by default because row-to-row shading is modelled geometrically instead. The snow component is zero because it’s about covered modules, which is a different question from the covered ground the albedo term below handles',
  ),
  citedComputed(
    'Rear-side irradiance from the pitch-averaged ground reflection seen through the rear view factor (1 + cos tilt) / 2',
    'B',
    ['marion2017-bifacial', 'pvlib-python'],
    'infinite-shed-rear-poa',
    // the 3-8% magnitude is the verification document item 4 and the GCR reading is Decision Record 2.1;
    // the pointers belong here rather than in a sentence somebody reads on a phone
    'The two-surface inter-reflection term it reuses has an unverifiable 3-8% magnitude: the formula is valid theory, and the range appears in no PV publication. The unshaded ground fraction is taken as 1 - GCR, which is the infinite-row case: a garden array is nearly all edge, so this understates the rear-side gain',
  ),
  citedComputed(
    'Ground albedo from the plot’s ground cover, blended hour by hour towards settled snow from the site’s monthly temperature and precipitation normals',
    'C',
    ['oke1987-boundary-layer-climates', 'thevenard2006-ground-reflectivity'],
    'ground-cover-albedo-with-seasonal-snow',
    // the values are in `src/data/albedo.ts` and the seasonal blend in `src/sim/snow.ts`
    'Both halves are this app’s own. The per-cover values are points chosen inside published ranges for the nearest tabulated surface, because no source measures a garden’s own mulch, and the snow weighting is a seasonal shape off monthly normals: it knows nothing about a particular winter, about melt and refreeze, or about drifting. It’s the same function the renderer draws the winter ground with, so the picture and the figure cannot disagree',
  ),
  citedComputed(
    'Land equivalent ratio, electricity term: agrivoltaic AC energy per unit land over a sole-use reference array on the same land',
    'B',
    ['dupraz2011-agrivoltaics'],
    'ler-electricity-term',
    'Dupraz et al. 2011 give the LER formulation. The reference system definition is this app’s own, and it’s stated with the report, because the ratio is meaningless without it',
  ),
]
