import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AirGapLevel,
  EnvironmentConditions,
  ExternalEnvironmentKind,
  HeatFlowDirection,
  InternalSurfaceCondition,
  ProfileSection,
} from '@openuvalue/engine';
import {
  calculateDynamicProperties,
  calculateTemperatureProfile,
  calculateUValue,
  computeCorrections,
} from '@openuvalue/engine';
import { BoundaryPanel } from './components/BoundaryPanel.js';
import { HatchLegend, IntroTour } from './components/IntroTour.js';
import { MoistureTab } from './components/MoistureTab.js';
import { HatchDefs } from './components/hatches.js';
import { CrossSection } from './components/CrossSection.js';
import { SummaryStrip } from './components/SummaryStrip.js';
import { DynamicPanel } from './components/DynamicPanel.js';
import { LayerTable } from './components/LayerTable.js';
import { ResultsPanel } from './components/ResultsPanel.js';
import {
  type UiLayer,
  type UiState,
  conditionsForEnvironment,
  defaultState,
  layerDrawCategory,
  environmentForDirection,
  hasBridging,
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
type TabId = 'buildup' | 'moisture';

const TABS: readonly { readonly id: TabId; readonly label: string }[] = [
  { id: 'buildup', label: 'Build-up and U-value' },
  { id: 'moisture', label: 'Moisture' },
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
  const setDirection = useCallback((heatFlowDirection: HeatFlowDirection) => {
    setState((current) => {
      // Turning a wall into a roof leaves "rear ventilated cladding" selected, which
      // the engine refuses outright, so the environment moves with the direction.
      const externalEnvironmentKind = environmentForDirection(
        current.externalEnvironment,
        heatFlowDirection,
      );
      return {
        ...current,
        heatFlowDirection,
        externalEnvironment: externalEnvironmentKind,
        conditions:
          externalEnvironmentKind === current.externalEnvironment
            ? current.conditions
            : conditionsForEnvironment(externalEnvironmentKind, current.conditions),
      };
    });
  }, []);
  const setAirGapLevel = useCallback((airGapLevel: AirGapLevel) => {
    setState((current) => ({ ...current, airGapLevel }));
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
    });
  }, [result, state.layers, state.heatFlowDirection, state.airGapLevel]);

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
          <button type="button" onClick={() => setState(defaultState())}>
            Masonry example
          </button>
          <button type="button" onClick={() => setState(timberFrameExample())}>
            Timber frame example
          </button>
          <button type="button" className="primary" onClick={() => void copyLink()}>
            {copied ? 'Link copied' : 'Copy share link'}
          </button>
        </div>
      </header>

      <p className="phase-banner">
        <strong>Phase 1.</strong> Steady-state only. Material values and several clause
        references still need checking against printed standards — see{' '}
        <a href={`${REPOSITORY_URL}/blob/HEAD/VERIFY.md`}>VERIFY.md</a>. BR 443's
        mechanical-fastener correction is not implemented, so a build-up with insulation
        fixed through is under-reported.
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
            <h2>Cross-section and temperature</h2>
            <label className="inline-select">
              Show
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
          <CrossSection
            layers={state.layers}
            result={result}
            profile={profile}
            section={state.section}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
            onReorder={reorderLayers}
          />

          <div className="section-legend">
            <HatchLegend />
            <button type="button" className="link-button" onClick={() => setTourOpen(true)}>
              How to read this drawing
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
          element={element}
          result={result}
          corrections={corrections}
          profile={profile}
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

      {tab === 'moisture' && result !== undefined && profile !== undefined && (
        <MoistureTab
          element={element}
          layers={state.layers}
          conditions={state.conditions}
          profile={profile}
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
              heatFlowDirection={state.heatFlowDirection}
              conditions={state.conditions}
              internalSurfaceCondition={state.internalSurfaceCondition}
              externalEnvironmentKind={state.externalEnvironment}
              result={result}
              onDirectionChange={setDirection}
              onConditionsChange={setConditions}
              onInternalSurfaceConditionChange={setInternalSurfaceCondition}
              onExternalEnvironmentChange={setExternalEnvironment}
            />
          )}
        </div>

        <div className="column-right">
          {result !== undefined && profile !== undefined ? (
            <ResultsPanel
              result={result}
              profile={profile}
              corrections={corrections}
              airGapLevel={state.airGapLevel}
              onAirGapLevelChange={setAirGapLevel}
            />
          ) : (
            <section className="panel">
              <h2>Result</h2>
              <p className="engine-error">{engineError}</p>
            </section>
          )}

          {dynamic !== undefined && <DynamicPanel dynamic={dynamic} />}
        </div>
      </main>

      <footer className="app-footer">
        <p>
          Open source, MIT licensed. Runs entirely in your browser — the build-up is
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
