import { vapourDiffusionThicknessSdM } from './resistance.js';
import type { BuildingElement } from './types.js';
import type { Metres } from './units.js';

/**
 * Quantities you get by adding the layers up: how thick the element is, what it weighs,
 * how much heat it can hold, and how hard it is for vapour to cross.
 *
 * None of these needs a calculation method — they are sums over the build-up — but two
 * of them are easy to mislabel, so:
 *
 * **Heat capacity here is the plain total**, the sum of rho x c x d over the layers. It
 * is *not* the areal heat capacity kappa of BS EN ISO 13786, which is a dynamic
 * quantity: under a daily cycle only material within a thermal penetration depth of the
 * surface takes part, so kappa is generally smaller than this total and depends on which
 * face the cycle is applied to. Anything that wants kappa — a SAP 10.3 calculation, a
 * decrement factor, a time shift — wants `calculateDynamicProperties` in dynamic.ts, not
 * this. The total is still worth showing: it is what sets how much heat a construction
 * can absorb in absolute terms, and it is honestly labelled as the total.
 *
 * **Mass is area-weighted across a bridged layer**: the unbridged section for the part
 * of the area it occupies, the bridging member for the rest. A dabbed cavity is the case
 * that makes this matter most, since its unbridged section is air and counting only that
 * would give the layer no mass at all.
 *
 * **Mass is the dry mass** of the materials as specified. It makes no allowance for
 * moisture content, fixings, finishes or the structure behind, so it indicates what a
 * build-up weighs rather than being a figure to size a lintel from.
 */

export interface ArealQuantities {
  readonly totalThicknessM: Metres;
  /** Dry mass per unit area, kg/m^2, over the layers whose density is known. */
  readonly massPerAreaKgPerM2: number;
  /**
   * Total heat capacity, kJ/(m^2*K): the sum of rho x c x d. See the note above — this
   * is not the ISO 13786 areal heat capacity kappa.
   */
  readonly totalHeatCapacityKJPerM2K: number;
  /** Total equivalent air layer thickness Sd, m, on the unbridged section. */
  readonly totalSdM: Metres;
  /**
   * Layers that could not contribute to the mass, because no density is known for them.
   * The caller should say so rather than presenting a total that silently omits them.
   */
  readonly layersMissingDensity: readonly string[];
  /** Layers that could not contribute to the heat capacity, for the same reason. */
  readonly layersMissingHeatCapacity: readonly string[];
  /** Layers whose mu is unknown, so they contributed nothing to Sd. */
  readonly layersMissingMu: readonly string[];
}

export function arealQuantities(element: BuildingElement): ArealQuantities {
  let totalThicknessM = 0;
  let massPerAreaKgPerM2 = 0;
  let heatCapacityJPerM2K = 0;
  let totalSdM = 0;
  const layersMissingDensity: string[] = [];
  const layersMissingHeatCapacity: string[] = [];
  const layersMissingMu: string[] = [];

  for (const layer of element.layers) {
    totalThicknessM += layer.thicknessM;

    const sd = vapourDiffusionThicknessSdM(layer);
    totalSdM += sd.sdM;
    if (!sd.muIsKnown) {
      layersMissingMu.push(layer.id);
    }

    if (layer.kind === 'fixed-resistance') {
      // A declared-resistance product carries no material properties at all, so its mass
      // and heat capacity are unknown rather than zero.
      layersMissingDensity.push(layer.id);
      layersMissingHeatCapacity.push(layer.id);
      continue;
    }

    /*
     * A layer weighs what its two sections weigh, in the proportion they occupy. Timber
     * studs are denser than the quilt between them and plaster dabs are a great deal
     * denser than the cavity around them, so counting only the unbridged section
     * under-states a bridged wall - by about 5 % on a timber frame, and by everything at
     * all on a dabbed cavity, where the unbridged section is air.
     */
    const bridging = layer.bridging;
    const bridgedFraction =
      bridging === undefined ? 0 : Math.min(1, Math.max(0, bridging.areaFraction));

    if (layer.kind === 'air') {
      /*
       * The air itself weighs nothing worth counting and stores no useful heat - a
       * physical fact rather than missing data, so an empty cavity is not reported as a
       * gap. Anything crossing it is a different matter.
       */
      if (bridging !== undefined && bridgedFraction > 0) {
        const memberDensity = bridging.material.densityKgPerM3;
        const memberHeat = bridging.material.specificHeatCapacityJPerKgK;
        if (memberDensity === undefined) {
          layersMissingDensity.push(layer.id);
          layersMissingHeatCapacity.push(layer.id);
        } else {
          massPerAreaKgPerM2 += bridgedFraction * memberDensity * layer.thicknessM;
          if (memberHeat === undefined) {
            layersMissingHeatCapacity.push(layer.id);
          } else {
            heatCapacityJPerM2K += bridgedFraction * memberDensity * layer.thicknessM * memberHeat;
          }
        }
      }
      continue;
    }

    const density = layer.material.densityKgPerM3;
    const specificHeat = layer.material.specificHeatCapacityJPerKgK;

    if (density === undefined) {
      layersMissingDensity.push(layer.id);
      layersMissingHeatCapacity.push(layer.id);
      continue;
    }

    massPerAreaKgPerM2 += (1 - bridgedFraction) * density * layer.thicknessM;

    if (specificHeat === undefined) {
      layersMissingHeatCapacity.push(layer.id);
    } else {
      heatCapacityJPerM2K +=
        (1 - bridgedFraction) * density * layer.thicknessM * specificHeat;
    }

    if (bridging === undefined || bridgedFraction <= 0) {
      continue;
    }
    const memberDensity = bridging.material.densityKgPerM3;
    const memberHeat = bridging.material.specificHeatCapacityJPerKgK;
    if (memberDensity === undefined) {
      layersMissingDensity.push(layer.id);
      layersMissingHeatCapacity.push(layer.id);
      continue;
    }
    massPerAreaKgPerM2 += bridgedFraction * memberDensity * layer.thicknessM;
    if (memberHeat === undefined) {
      layersMissingHeatCapacity.push(layer.id);
      continue;
    }
    heatCapacityJPerM2K += bridgedFraction * memberDensity * layer.thicknessM * memberHeat;
  }

  return {
    totalThicknessM,
    massPerAreaKgPerM2,
    totalHeatCapacityKJPerM2K: heatCapacityJPerM2K / 1000,
    totalSdM,
    layersMissingDensity,
    layersMissingHeatCapacity,
    layersMissingMu,
  };
}
