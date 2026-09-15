import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AirGapLevel,
  EnvironmentConditions,
  ExternalEnvironmentKind,
  InternalSurfaceCondition,
  ProfileSection,
} from '@openuvalue/engine';
import {
  assessInterstitialCondensation,
  calculateDynamicProperties,
  calculateTemperatureProfile,
  calculateUValue,
  computeCorrections,
  condensationMarkers,
} from '@openuvalue/engine';
import { BoundaryPanel } from './components/BoundaryPanel.js';
import { LocationPanel } from './components/LocationPanel.js';
import { HatchLegend, IntroTour } from './components/IntroTour.js';
import { MoistureTab } from './components/MoistureTab.js';
import { EnergyTab } from './components/EnergyTab.js';
import { RetrofitTab } from './components/RetrofitTab.js';
import {
  DEFAULT_DRYING_SETTINGS,
  type DryingSettings,
  assessDryOut,
} from './state/drying.js';
import { HatchDefs } from './components/hatches.js';
import { CrossSection } from './components/CrossSection.js';
import { SummaryStrip } from './components/SummaryStrip.js';
import { DynamicPanel } from './components/DynamicPanel.js';
import { Layup3D } from './components/Layup3D.js';
import { Guide, HelpButton } from './components/guide/Guide.js';
import { LayerTable } from './components/LayerTable.js';
import { ResultsPanel } from './components/ResultsPanel.js';
import {
  type UiFasteners,
  type UiLayer,
  type UiState,
  type UiElementKind,
  bridgedPercentFromDimensions,
  conditionsForEnvironment,
  defaultState,
  directionForElement,
  partLKindForElement,
  layerDrawCategory,
  environmentForDirection,
  hasBridging,
  coldRoofExample,
  timberFrameExample,
  toBuildingElement,
} from './state/model.js';
import { decodeState, encodeState } from './url/codec.js';

/**
 * Linked from the footer and the phase banner so anyone landing on the published site
 * can reach the caveats, not just people who cloned the repository.
 */
const REPOSITORY_URL = 'https://github.com/swwilshub/OpenUValue';

/** Marks the walkthrough as seen, so it opens once rather than on every visit. */
const TOUR_SEEN_KEY = 'openuvalue.tour.seen';

/**
 * The cross-section stays above the tabs, because it is the thing being worked on
 * whichever analysis is open. The tabs switch what is said *about* it.
 */
type TabId = 'buildup' | 'moisture' | 'energy' | 'retrofit';

/**
 * How far to lay the 3D model back from upright, in radians.
 *
 * A wall stands up. A roof is laid back by (90° − its pitch), so a flat roof lies flat
 * and a steep one stands almost upright; a floor lies flat with the room above it, which
 * is the same quarter turn the other way. Nothing about the build-up changes, only the
 * angle the model is seen from.
 */
function layupTiltRadians(kind: UiElementKind, roofPitchDegrees: number): number {
  const degrees =
    kind === 'wall' ? 0 : kind === 'floor' ? 90 : 90 - roofPitchDegrees;
  return (degrees * Math.PI) / 180;
}

const TABS: readonly { readonly id: TabId; readonly label: string }[] = [
  { id: 'buildup', label: 'Build-up and U-value' },
  { id: 'moisture', label: 'Moisture' },
  { id: 'energy', label: 'Energy and carbon' },
  { id: 'retrofit', label: 'Retrofit' },
];

const SECTION_LABELS: Record<ProfileSection, string> = {
  combined: 'Combined (area weighted)',
  unbridged: 'Unbridged section',
  bridged: 'Bridging section',
};

export function App(): JSX.Element {
  const initial = useMemo(() => decodeState(window.location.hash), []);
  const [state, setState] = useState<UiState>(initial.state);
  const [linkProblem, setLinkProblem] = useState<string | undefined>(initial.problem);
  const [copied, setCopied] = useState(false);
  /** Layer picked in either the table or the drawing; the other view follows. */
  const [selectedLayerId, setSelectedLayerId] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<TabId>('buildup');
  /*
   * The feature guide. `guideTopic` is what a help button beside a box passes in, so the
   * guide opens at that box rather than at the beginning.
   */
  /** Which view the hero panel shows: the section, or the axonometric indicator. */
  const [heroView, setHeroView] = useState<'section' | 'layup'>('section');
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideTopic, setGuideTopic] = useState<string | undefined>(undefined);
  const openGuide = useCallback((topicId?: string) => {
    setGuideTopic(topicId);
    setGuideOpen(true);
  }, []);
  /**
   * The walkthrough opens by itself the first time, and not again. localStorage can
   * throw outright in a private window or with site data blocked, so a failure to read
   * it means "show the tour" and a failure to write it means the tour opens again next
   * time — annoying, but never a blank page.
   */
  const [tourOpen, setTourOpen] = useState<boolean>(() => {
    if (window.location.hash !== '') {
      // Someone arriving on a shared link came to see that build-up, not a tutorial.
      return false;
    }
    try {
      return window.localStorage.getItem(TOUR_SEEN_KEY) === null;
    } catch {
      return true;
    }
  });

  const closeTour = useCallback(() => {
    setTourOpen(false);
    try {
      window.localStorage.setItem(TOUR_SEEN_KEY, '1');
    } catch {
      // Nothing to do: the tour is dismissed for this visit either way.
    }
  }, []);
  /** The hash this component last wrote, so an incoming change can be told apart. */
  const writtenHash = useRef<string>('');

  // Keep the hash in step with the build-up, so the address bar is always shareable.
  // replaceState rather than pushState: editing a thickness should not fill the
  // browser's back stack with intermediate states.
  useEffect(() => {
    const encoded = `#${encodeState(state)}`;
    writtenHash.current = encoded;
    window.history.replaceState(null, '', encoded);
  }, [state]);

  // A hash change we did not write means someone navigated: pasted a share link into
  // an open tab, followed one from another page, or used back/forward. Without this
  // the app would keep showing the previous build-up, because changing only the hash
  // does not reload the document.
  useEffect(() => {
    const onHashChange = (): void => {
      if (window.location.hash === writtenHash.current) {
        return;
      }
      const decoded = decodeState(window.location.hash);
      setState(decoded.state);
      setLinkProblem(decoded.problem);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const element = useMemo(() => toBuildingElement(state), [state]);

  const { result, profile, engineError } = useMemo(() => {
    try {
      return {
        result: calculateUValue(element),
        profile: calculateTemperatureProfile(element, state.conditions, state.section),
        engineError: undefined,
      };
    } catch (error) {
      return {
        result: undefined,
        profile: undefined,
        engineError: error instanceof Error ? error.message : String(error),
      };
    }
  }, [element, state.conditions, state.section]);

  const setLayers = useCallback((layers: readonly UiLayer[]) => {
    setState((current) => ({ ...current, layers }));
  }, []);

  /**
   * Reorder from the drawing. Same rule as the layer table: the drop index is taken
   * from the list before the layer is lifted out, so it is corrected once it has been.
   */
  const reorderLayers = useCallback((from: number, to: number) => {
    setState((current) => {
      if (from === to || from < 0 || from >= current.layers.length) {
        return current;
      }
      const next = [...current.layers];
      const [moved] = next.splice(from, 1);
      if (moved === undefined) {
        return current;
      }
      next.splice(from < to ? to - 1 : to, 0, moved);
      return { ...current, layers: next };
    });
  }, []);
  const setElement = useCallback((elementKind: UiElementKind, roofPitchDegrees: number) => {
    setState((current) => {
      // The direction is not stored independently: it is what the element and its pitch
      // imply, so it is recomputed here rather than left to drift out of step with them.
      const heatFlowDirection = directionForElement(elementKind, roofPitchDegrees);
      // Turning a wall into a roof leaves "rear ventilated cladding" selected, which
      // the engine refuses outright, so the environment moves with the direction.
      const externalEnvironmentKind = environmentForDirection(
        current.externalEnvironment,
        heatFlowDirection,
      );
      return {
        ...current,
        elementKind,
        roofPitchDegrees,
        heatFlowDirection,
        externalEnvironment: externalEnvironmentKind,
        conditions:
          externalEnvironmentKind === current.externalEnvironment
            ? current.conditions
            : conditionsForEnvironment(externalEnvironmentKind, current.conditions),
      };
    });
  }, []);
  /**
   * Set one layer's thickness, from the resize handles on the drawing. Fires on every
   * pointer move, which is why the hash is written with replaceState — a drag would
   * otherwise leave a hundred entries in the back button.
   */
  /**
   * Widen or narrow the members crossing a layer by dragging an edge in the drawing.
   *
   * Where the bridged percentage was derived from the geometry it is recomputed, so the
   * calculation follows the picture. Where it was stated outright — BR 443's conventional
   * allowances, which count plates and rails the pattern cannot show — the percentage is
   * left alone: a drag on a drawn member must not silently overwrite a figure taken from
   * a standard.
   */
  const setMemberWidth = useCallback((index: number, widthMm: number) => {
    setState((current) => {
      const layer = current.layers[index];
      if (layer === undefined || layer.bridgeWidthMm === widthMm) {
        return current;
      }
      const layers = [...current.layers];
      layers[index] = {
        ...layer,
        bridgeWidthMm: widthMm,
        ...(layer.bridgeSizing === 'dimensions'
          ? {
              bridgedPercent: bridgedPercentFromDimensions(
                widthMm,
                layer.bridgeSpacingMm,
                layer.bridgeDistanceBasis,
              ),
            }
          : {}),
      };
      return { ...current, layers };
    });
  }, []);

  /**
   * Turn the build-up back to front: what was the inside face becomes the outside one.
   *
   * The layers are reversed and nothing else is. The conditions, the heat flow direction
   * and the surface resistances stay where they are, because they describe the room and
   * the weather rather than the wall — so this answers "what if I built this the other
   * way round", which is the question worth asking, rather than quietly rebuilding the
   * whole model around the new orientation and changing two things at once.
   */
  const reverseLayers = useCallback(() => {
    setState((current) => ({ ...current, layers: [...current.layers].reverse() }));
  }, []);

  const setLayerThickness = useCallback((index: number, thicknessMm: number) => {
    setState((current) => {
      const layer = current.layers[index];
      if (layer === undefined || layer.thicknessMm === thicknessMm) {
        return current;
      }
      const layers = [...current.layers];
      layers[index] = { ...layer, thicknessMm };
      return { ...current, layers };
    });
  }, []);

  const setAirGapLevel = useCallback((airGapLevel: AirGapLevel) => {
    setState((current) => ({ ...current, airGapLevel }));
  }, []);
  const setFasteners = useCallback((fasteners: UiFasteners | undefined) => {
    setState((current) => {
      if (fasteners === undefined) {
        const { fasteners: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, fasteners };
    });
  }, []);
  const setConditions = useCallback((conditions: EnvironmentConditions) => {
    setState((current) => ({ ...current, conditions }));
  }, []);
  const setInternalSurfaceCondition = useCallback(
    (internalSurfaceCondition: InternalSurfaceCondition) => {
      setState((current) => ({ ...current, internalSurfaceCondition }));
    },
    [],
  );
  const setExternalEnvironment = useCallback(
    (externalEnvironmentKind: ExternalEnvironmentKind, conditions: EnvironmentConditions) => {
      setState((current) => ({
        ...current,
        externalEnvironment: externalEnvironmentKind,
        conditions,
      }));
    },
    [],
  );

  /*
   * The air gap correction is scaled by the share of the element's resistance the
   * insulation provides, so the insulation layers have to be identified. Anything the
   * catalogue calls insulation counts; a layer with a typed-in lambda does not, since
   * there is nothing to identify it by.
   */
  /**
   * The two seasons the dry-out check runs over, held here so the cross-section and the
   * Moisture tab cannot report different answers for the same wall.
   */
  const [dryingSettings, setDryingSettings] = useState<DryingSettings>(DEFAULT_DRYING_SETTINGS);

  const dryOut = useMemo(
    () => assessDryOut(element, state.conditions, dryingSettings),
    [element, state.conditions, dryingSettings],
  );

  /**
   * Per-interface moisture conditions for the drawing. Computed here rather than inside
   * CrossSection so that a failure in the vapour calculation costs the drawing its
   * drops and nothing else - the thermal side is still worth drawing without it.
   */
  const condensation = useMemo(() => {
    if (profile === undefined || profile === null) {
      return undefined;
    }
    try {
      return condensationMarkers(
        profile,
        assessInterstitialCondensation(element, state.conditions),
      );
    } catch {
      return undefined;
    }
  }, [element, state.conditions, profile]);

  const corrections = useMemo(() => {
    if (result === undefined || result.uValueWPerM2K === null) {
      return undefined;
    }
    const insulationResistanceM2KPerW = state.layers.reduce((total, layer, index) => {
      if (layerDrawCategory(layer.materialId, layer.kind) !== 'insulation') {
        return total;
      }
      return total + (result.layers[index]?.combinedResistanceM2KPerW ?? 0);
    }, 0);
    return computeCorrections({
      uncorrectedUValueWPerM2K: result.uValueWPerM2K,
      heatFlowDirection: state.heatFlowDirection,
      airGapLevel: state.airGapLevel,
      totalResistanceM2KPerW: result.totalResistanceM2KPerW,
      ...(insulationResistanceM2KPerW > 0 ? { insulationResistanceM2KPerW } : {}),
      /*
       * BR 443 4.8.3's exemption is for a flat roof, so the UI asks about that directly
       * rather than letting upward heat flow stand in for it — a ceiling under a loft
       * also flows upward and is not a flat roof.
       */
      ...(state.fasteners === undefined
        ? {}
        : {
            fasteners: {
              pointThermalTransmittanceWPerK:
                state.fasteners.pointThermalTransmittanceWPerK,
              fastenersPerM2: state.fasteners.fastenersPerM2,
              isFlatRoof: state.fasteners.recessedFlatRoof,
              metalRecessedAtLeastHalf: state.fasteners.recessedFlatRoof,
              bothEndsInMetalSheets: state.fasteners.bothEndsInMetalSheets,
            },
          }),
    });
  }, [
    result,
    state.layers,
    state.heatFlowDirection,
    state.airGapLevel,
    state.fasteners,
  ]);

  /*
   * BS EN ISO 13786. Kept separate from the U-value memo because it is a different
   * question about the same element, and because it can fail on its own (an unsupported
   * external environment) without taking the thermal result down with it.
   */
  const dynamic = useMemo(() => {
    try {
      return calculateDynamicProperties(element);
    } catch {
      return undefined;
    }
  }, [element]);

  const bridged = hasBridging(state);

  const copyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the URL is in the address bar regardless.
      setCopied(false);
    }
  };

  return (
    <div className="app">
      {/* Mounted once: every material hatch in the page resolves to these. */}
      <HatchDefs />
      <IntroTour open={tourOpen} onClose={closeTour} />
      <Guide open={guideOpen} topicId={guideTopic} onClose={() => setGuideOpen(false)} />

      <header className="app-header">
        <div>
          <h1>OpenUValue</h1>
          <p className="tagline">
            U-value, temperature profile and surface condensation, to BS EN ISO 6946
            with BR 443 conventions.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => setTourOpen(true)}>
            How to read this
          </button>
          <button type="button" onClick={() => openGuide()}>
            Guide to every feature
          </button>
          <button type="button" onClick={() => setState(defaultState())}>
            Masonry example
          </button>
          <button type="button" onClick={() => setState(timberFrameExample())}>
            Timber frame example
          </button>
          <button type="button" onClick={() => setState(coldRoofExample())}>
            Cold roof example
          </button>
          <button type="button" className="primary" onClick={() => void copyLink()}>
            {copied ? 'Link copied' : 'Copy share link'}
          </button>
        </div>
      </header>

      <p className="phase-banner">
        <strong>Still being checked.</strong> Material values and several clause
        references still need checking against printed standards; see{' '}
        <a href={`${REPOSITORY_URL}/blob/HEAD/VERIFY.md`}>VERIFY.md</a>. The mechanical
        fastener correction covers BR 443's detailed route, where you supply a point
        thermal transmittance; its approximate route is not implemented.
      </p>

      {linkProblem !== undefined && (
        <p className="link-problem">
          {linkProblem} The default build-up is shown instead.{' '}
          <button type="button" className="link-button" onClick={() => setLinkProblem(undefined)}>
            dismiss
          </button>
        </p>
      )}

      {result !== undefined && profile !== undefined && (
        <section className="panel hero-panel">
          <div className="section-header">
            <h2>
              Cross-section and temperature
              <HelpButton
                topicId="layers-to-scale"
                label="the cross-section drawing"
                onOpen={openGuide}
              />
            </h2>
            <div className="view-toggle" role="group" aria-label="Drawing">
              <button
                type="button"
                className={heroView === 'section' ? 'is-current' : ''}
                aria-pressed={heroView === 'section'}
                onClick={() => setHeroView('section')}
              >
                Section
              </button>
              <button
                type="button"
                className={heroView === 'layup' ? 'is-current' : ''}
                aria-pressed={heroView === 'layup'}
                onClick={() => setHeroView('layup')}
              >
                3D layup
              </button>
              <HelpButton topicId="layup-3d" label="the 3D layup view" onOpen={openGuide} />
            </div>
            <div className="view-toggle">
              {/*
                * A build-up operation rather than a view one, so it sits with the view
                * controls only because that is where both drawings can see it — it
                * changes the model, and the drawings follow.
                */}
              <button
                type="button"
                onClick={reverseLayers}
                disabled={state.layers.length < 2}
                title="Turn the build-up back to front: the inside face becomes the outside one. The conditions and heat flow direction stay as they are."
              >
                Reverse layers
              </button>
            </div>
            <label className="inline-select" hidden={heroView !== 'section'}>
              Show
              <HelpButton topicId="section-selector" label="the section selector" onOpen={openGuide} />
              <select
                value={state.section}
                disabled={!bridged}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    section: event.target.value as ProfileSection,
                  }))
                }
              >
                {(Object.keys(SECTION_LABELS) as ProfileSection[]).map((section) => (
                  <option key={section} value={section}>
                    {SECTION_LABELS[section]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {heroView === 'section' ? (
            <CrossSection
              layers={state.layers}
              elementKind={state.elementKind}
              result={result}
              profile={profile}
              section={state.section}
              selectedLayerId={selectedLayerId}
              onSelectLayer={setSelectedLayerId}
              onReorder={reorderLayers}
              onResizeLayer={setLayerThickness}
              onResizeMember={setMemberWidth}
              condensation={condensation}
              dryOut={dryOut}
            />
          ) : (
            <Layup3D
              layers={state.layers}
              included={result.layers.map((layer) => layer.includedInCalculation)}
              selectedLayerId={selectedLayerId}
              onSelectLayer={setSelectedLayerId}
              tiltRadians={layupTiltRadians(state.elementKind, state.roofPitchDegrees)}
            />
          )}

          <div className="section-legend" hidden={heroView !== 'section'}>
            <HatchLegend />
            <button type="button" className="link-button" onClick={() => setTourOpen(true)}>
              How to read this drawing
            </button>
            <button type="button" className="link-button" onClick={() => openGuide('layers-to-scale')}>
              Guide to every feature
            </button>
          </div>

          {bridged && state.section === 'combined' && (
            <p className="footnote">
              The combined profile is an OpenUValue convention, not a method from
              BS EN ISO 6946, which defines no temperature profile through a bridged
              element. The area-weighted layer resistances are scaled by{' '}
              k = {(profile.combinedScalingFactor ?? 1).toFixed(4)} so the profile sums
              to the reported R<sub>T</sub> rather than to the lower limit R″
              <sub>T</sub>. Vapour thicknesses follow the unbridged path.
            </p>
              )}
        </section>
      )}

      {/*
        Outside the tab panels on purpose: these are the figures you want in view
        whichever tab you are reading, and they move as layers are dragged.
      */}
      {result !== undefined && profile !== undefined && (
        <SummaryStrip
          onOpenGuide={openGuide}
          element={element}
          partLKind={partLKindForElement(state.elementKind)}
          result={result}
          corrections={corrections}
          conditions={state.conditions}
          dynamic={dynamic}
        />
      )}

      <nav className="tab-bar" role="tablist" aria-label="Analysis">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={tab === entry.id ? 'tab is-current' : 'tab'}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {tab === 'energy' && result !== undefined && (
        <EnergyTab
          onOpenGuide={openGuide}
          result={result}
          internalTemperatureC={state.conditions.internalAirTemperatureC}
        />
      )}

      {tab === 'retrofit' && <RetrofitTab onOpenGuide={openGuide} state={state} />}

      {tab === 'moisture' && result !== undefined && profile !== undefined && (
        <MoistureTab
          onOpenGuide={openGuide}
          element={element}
          layers={state.layers}
          conditions={state.conditions}
          profile={profile}
          dryingSettings={dryingSettings}
          onChangeDryingSettings={setDryingSettings}
        />
      )}

      <main className="layout" hidden={tab !== 'buildup'}>
        <div className="column-left">
          <section className="panel">
            <h2>
              <input
                type="text"
                aria-label="Element name"
                className="element-name"
                value={state.name}
                onChange={(event) =>
                  setState((current) => ({ ...current, name: event.target.value }))
                }
              />
            </h2>
            {result === undefined ? (
              <p className="engine-error">{engineError}</p>
            ) : (
              <LayerTable
                onOpenGuide={openGuide}
                heatFlowDirection={state.heatFlowDirection}
                layers={state.layers}
                result={result}
                onChange={setLayers}
                selectedLayerId={selectedLayerId}
                onSelectLayer={setSelectedLayerId}
              />
            )}
          </section>

          {result !== undefined && (
            <BoundaryPanel
              onOpenGuide={openGuide}
              heatFlowDirection={state.heatFlowDirection}
              elementKind={state.elementKind}
              roofPitchDegrees={state.roofPitchDegrees}
              conditions={state.conditions}
              internalSurfaceCondition={state.internalSurfaceCondition}
              externalEnvironmentKind={state.externalEnvironment}
              result={result}
              onElementChange={setElement}
              onConditionsChange={setConditions}
              onInternalSurfaceConditionChange={setInternalSurfaceCondition}
              onExternalEnvironmentChange={setExternalEnvironment}
            />
          )}

          <LocationPanel
            onOpenGuide={openGuide}
            zoneId={state.exposureZoneId}
            onChange={(exposureZoneId) =>
              setState((current) => ({ ...current, exposureZoneId }))
            }
            layers={state.layers}
          />
        </div>

        <div className="column-right">
          {result !== undefined && profile !== undefined ? (
            <ResultsPanel
              onOpenGuide={openGuide}
              result={result}
              profile={profile}
              corrections={corrections}
              airGapLevel={state.airGapLevel}
              onAirGapLevelChange={setAirGapLevel}
              fasteners={state.fasteners}
              onFastenersChange={setFasteners}
            />
          ) : (
            <section className="panel">
              <h2>Result</h2>
              <p className="engine-error">{engineError}</p>
            </section>
          )}

          {dynamic !== undefined && <DynamicPanel dynamic={dynamic} onOpenGuide={openGuide} />}
        </div>
      </main>

      <footer className="app-footer">
        <p>
          Open source, MIT licensed. Runs entirely in your browser. The build-up is
          encoded in the address bar and nothing is sent anywhere.
        </p>
        <p>
          <a href={REPOSITORY_URL}>Source on GitHub</a>
          {' · '}
          <a href={`${REPOSITORY_URL}/blob/HEAD/VERIFY.md`}>
            What still needs checking (VERIFY.md)
          </a>
          {' · '}
          <a href={`${REPOSITORY_URL}/blob/HEAD/ROADMAP.md`}>What is not built yet</a>
        </p>
      </footer>
    </div>
  );
}
