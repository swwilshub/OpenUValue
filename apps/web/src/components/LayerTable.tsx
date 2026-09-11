import { useState } from 'react';
import type { UValueResult } from '@openuvalue/engine';
import {
  roundResistanceForReporting,
  vapourClassForSd,
  vapourPermeabilityKgPerMSPa,
  vapourResistanceMNsPerG,
} from '@openuvalue/engine';
import { findMaterialById, toEngineMaterial } from '@openuvalue/materials';
import { MaterialPicker } from './MaterialPicker.js';
import {
  DEFAULT_STUD_SPACING_MM,
  DEFAULT_STUD_WIDTH_MM,
  type UiLayer,
  blankAirLayer,
  blankSolidLayer,
  bridgedPercentFromDimensions,
} from '../state/model.js';

export interface LayerTableProps {
  readonly layers: readonly UiLayer[];
  readonly result: UValueResult;
  readonly onChange: (layers: readonly UiLayer[]) => void;
  /** Layer highlighted from the cross-section, so the two views stay in step. */
  readonly selectedLayerId?: string | undefined;
  readonly onSelectLayer?: ((layerId: string | undefined) => void) | undefined;
}


/**
 * Permeability runs from about 2e-10 for air down to 2e-15 for polythene, so it is
 * only readable in scientific notation. Rendered as "2.0e-10" rather than with a
 * superscript, because it sits inline in a dense row of numbers.
 */
function formatPermeability(deltaKgPerMSPa: number): string {
  return deltaKgPerMSPa.toExponential(1);
}

const VAPOUR_CLASS_LABELS = {
  'vapour-open': 'vapour open',
  'vapour-retarding': 'vapour retarding',
  'vapour-barrier': 'vapour barrier',
} as const;

const VENTILATION_LABELS = {
  unventilated: 'Unventilated',
  'slightly-ventilated': 'Slightly ventilated',
  'well-ventilated': 'Well ventilated',
} as const;

export function LayerTable({
  layers,
  result,
  onChange,
  selectedLayerId,
  onSelectLayer,
}: LayerTableProps): JSX.Element {
  /** Index being dragged, and the gap it would drop into. Null when not dragging. */
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const update = (index: number, patch: Partial<UiLayer>): void => {
    onChange(layers.map((layer, i) => (i === index ? { ...layer, ...patch } : layer)));
  };

  const applyMaterial = (index: number, materialId: string): void => {
    if (materialId === '') {
      update(index, { materialId: null });
      return;
    }
    const material = findMaterialById(materialId);
    if (material === undefined) {
      return;
    }
    const engineMaterial = toEngineMaterial(material);
    update(index, {
      materialId,
      label: material.name,
      lambdaWPerMK: engineMaterial.lambdaWPerMK,
      vapourResistanceFactorMu: engineMaterial.vapourResistanceFactorMu,
    });
  };

  const applyBridgeMaterial = (index: number, materialId: string): void => {
    const material = findMaterialById(materialId);
    if (material === undefined) {
      update(index, { bridgeMaterialId: null });
      return;
    }
    update(index, {
      bridgeMaterialId: materialId,
      bridgeLabel: material.name,
      bridgeLambdaWPerMK: material.lambdaWPerMK,
    });
  };

  /**
   * Move a layer from one position to another. Drag-and-drop and the arrow buttons
   * both come through here, so a dragged reorder and a keyboard reorder can never
   * disagree about what the ordering means.
   */
  const reorder = (from: number, to: number): void => {
    if (from === to || from < 0 || from >= layers.length || to < 0 || to > layers.length) {
      return;
    }
    const next = [...layers];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) {
      return;
    }
    // Removing the dragged layer shifts everything after it down by one, so a drop
    // position taken from the original list has to be corrected before inserting.
    next.splice(from < to ? to - 1 : to, 0, moved);
    onChange(next);
  };

  const move = (index: number, delta: number): void => {
    const target = index + delta;
    if (target < 0 || target >= layers.length) {
      return;
    }
    const next = [...layers];
    const moved = next[index];
    const displaced = next[target];
    if (moved === undefined || displaced === undefined) {
      return;
    }
    next[index] = displaced;
    next[target] = moved;
    onChange(next);
  };

  /** Start bridging a layer, at a common stud size and spacing. */
  const addStuds = (index: number): void => {
    update(index, {
      bridgeSizing: 'dimensions',
      bridgeWidthMm: DEFAULT_STUD_WIDTH_MM,
      bridgeSpacingMm: DEFAULT_STUD_SPACING_MM,
      bridgedPercent: bridgedPercentFromDimensions(
        DEFAULT_STUD_WIDTH_MM,
        DEFAULT_STUD_SPACING_MM,
      ),
    });
  };

  /**
   * Change a member's width or spacing, keeping the bridged percentage derived from
   * them. Passing null leaves that dimension alone.
   */
  const setDimensions = (index: number, widthMm: number | null, spacingMm: number | null): void => {
    const layer = layers[index];
    if (layer === undefined) {
      return;
    }
    const width = widthMm ?? layer.bridgeWidthMm;
    const spacing = spacingMm ?? layer.bridgeSpacingMm;
    update(index, {
      bridgeWidthMm: width,
      bridgeSpacingMm: spacing,
      bridgedPercent: bridgedPercentFromDimensions(width, spacing),
    });
  };

  /**
   * Switching to width-and-spacing recomputes the percentage from the dimensions, so
   * the figure on screen always matches the inputs that are visible beside it.
   */
  const setSizing = (index: number, sizing: UiLayer['bridgeSizing']): void => {
    const layer = layers[index];
    if (layer === undefined) {
      return;
    }
    update(index, {
      bridgeSizing: sizing,
      ...(sizing === 'dimensions'
        ? {
            bridgedPercent: bridgedPercentFromDimensions(
              layer.bridgeWidthMm,
              layer.bridgeSpacingMm,
            ),
          }
        : {}),
    });
  };

  const remove = (index: number): void => {
    onChange(layers.filter((_layer, i) => i !== index));
  };

  const insert = (index: number, layer: UiLayer): void => {
    const next = [...layers];
    next.splice(index, 0, layer);
    onChange(next);
  };

  return (
    <div className="layer-table">
      <div className="layer-table-head">
        <span>Layer, inside to outside</span>
        <span className="layer-actions-head">
          <button type="button" onClick={() => insert(layers.length, blankSolidLayer())}>
            + layer
          </button>
          <button type="button" onClick={() => insert(layers.length, blankAirLayer())}>
            + cavity
          </button>
        </span>
      </div>

      {layers.length === 0 && (
        <p className="empty-note">No layers yet. Add one to start.</p>
      )}

      {layers.map((layer, index) => {
        const reported = result.layers[index];
        const isDisregarded = reported !== undefined && !reported.includedInCalculation;
        const classes = ['layer-row'];
        if (isDisregarded) {
          classes.push('layer-row-disregarded');
        }
        if (dragIndex === index) {
          classes.push('layer-row-dragging');
        }
        if (layer.id === selectedLayerId) {
          classes.push('layer-row-selected');
        }
        // The gap this layer would drop into: above it, or below the last one.
        if (dropIndex === index) {
          classes.push('layer-row-drop-before');
        } else if (dropIndex === layers.length && index === layers.length - 1) {
          classes.push('layer-row-drop-after');
        }
        return (
          <fieldset
            key={layer.id}
            className={classes.join(' ')}
            onClick={() => onSelectLayer?.(layer.id)}
            onDragOver={(event) => {
              if (dragIndex === null) {
                return;
              }
              // Without preventDefault the browser refuses the drop outright.
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              // Drop above or below this layer depending on which half is hovered, so
              // the last position in the list stays reachable.
              const box = event.currentTarget.getBoundingClientRect();
              const below = event.clientY > box.top + box.height / 2;
              setDropIndex(below ? index + 1 : index);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragIndex !== null && dropIndex !== null) {
                reorder(dragIndex, dropIndex);
              }
              setDragIndex(null);
              setDropIndex(null);
            }}
          >
            <legend>
              <span
                className="drag-handle"
                draggable
                role="button"
                tabIndex={-1}
                aria-hidden="true"
                title="Drag to reorder"
                onDragStart={(event) => {
                  setDragIndex(index);
                  setDropIndex(index);
                  event.dataTransfer.effectAllowed = 'move';
                  // Firefox ignores a drag that carries no data.
                  event.dataTransfer.setData('text/plain', layer.id);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDropIndex(null);
                }}
              >
                ⠿
              </span>
              <span className="layer-index">{index + 1}</span>
              <input
                type="text"
                aria-label="Layer name"
                className="layer-name"
                value={layer.label}
                onChange={(event) => update(index, { label: event.target.value })}
              />
              {isDisregarded && <span className="badge">disregarded</span>}
            </legend>

            <div className="layer-grid">
              {layer.kind === 'solid' ? (
                <MaterialPicker
                  label="Material"
                  materialId={layer.materialId}
                  fallbackLabel="λ typed in directly"
                  onSelect={(id) => applyMaterial(index, id)}
                />
              ) : (
                <label>
                  Ventilation
                  <select
                    value={layer.ventilation}
                    onChange={(event) =>
                      update(index, {
                        ventilation: event.target.value as UiLayer['ventilation'],
                      })
                    }
                  >
                    {Object.entries(VENTILATION_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label>
                Thickness, mm
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={layer.thicknessMm}
                  onChange={(event) =>
                    update(index, { thicknessMm: Math.max(0, Number(event.target.value)) })
                  }
                />
              </label>

              {layer.kind === 'solid' ? (
                <label>
                  λ, W/(m·K)
                  <input
                    type="number"
                    min={0.001}
                    step={0.001}
                    value={layer.lambdaWPerMK}
                    onChange={(event) =>
                      update(index, {
                        lambdaWPerMK: Math.max(0.001, Number(event.target.value)),
                        materialId: null,
                      })
                    }
                  />
                </label>
              ) : (
                <label>
                  Openings, mm²/m
                  <input
                    type="number"
                    min={0}
                    step={100}
                    disabled={layer.ventilation === 'unventilated'}
                    value={layer.openingAreaMm2PerM}
                    onChange={(event) =>
                      update(index, {
                        openingAreaMm2PerM: Math.max(0, Number(event.target.value)),
                      })
                    }
                  />
                </label>
              )}

              {layer.kind === 'solid' && (
                <label
                  className="symbol-label"
                  title="Water vapour resistance factor, dimensionless"
                >
                  μ
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={layer.vapourResistanceFactorMu}
                    onChange={(event) =>
                      update(index, {
                        vapourResistanceFactorMu: Math.max(1, Number(event.target.value)),
                        materialId: null,
                      })
                    }
                  />
                </label>
              )}

              <div className="layer-readout">
                <span className="readout">
                  <span className="readout-label">R</span>
                  <span className="readout-value">
                    {reported === undefined
                      ? '—'
                      : roundResistanceForReporting(reported.combinedResistanceM2KPerW).toFixed(3)}
                  </span>
                  <span className="readout-unit">m²K/W</span>
                </span>
                {layer.kind === 'solid' && reported !== undefined && (
                  <>
                    <span
                      className="readout"
                      title={
                        `Equivalent air layer thickness: this layer holds back as much ` +
                        `water vapour as ${reported.vapourDiffusionThicknessSdM.toFixed(2)} m ` +
                        `of still air (${vapourResistanceMNsPerG(
                          reported.vapourDiffusionThicknessSdM,
                        ).toFixed(1)} MN·s/g)`
                      }
                    >
                      <span className="readout-label">
                        S<sub>d</sub>
                      </span>
                      <span className="readout-value">
                        {reported.vapourDiffusionThicknessSdM.toFixed(2)}
                      </span>
                      <span className="readout-unit">m</span>
                    </span>
                    <span
                      className="readout"
                      title="Water vapour permeability, δ = δ of still air ÷ μ"
                    >
                      <span className="readout-label">δ</span>
                      <span className="readout-value">
                        {formatPermeability(vapourPermeabilityKgPerMSPa(
                          layer.vapourResistanceFactorMu,
                        ))}
                      </span>
                      <span className="readout-unit">kg/(m·s·Pa)</span>
                    </span>
                    <span className={`vapour-chip vapour-${vapourClassForSd(
                      reported.vapourDiffusionThicknessSdM,
                    )}`}>
                      {VAPOUR_CLASS_LABELS[
                        vapourClassForSd(reported.vapourDiffusionThicknessSdM)
                      ]}
                    </span>
                  </>
                )}
              </div>
            </div>

            {layer.kind === 'solid' && layer.bridgedPercent <= 0 && (
              <div className="layer-actions">
                <button type="button" onClick={() => addStuds(index)}>
                  + studs or rafters
                </button>
              </div>
            )}

            {layer.kind === 'solid' && layer.bridgedPercent > 0 && (
              <div className="bridging-block">
                <div className="bridging-head">
                  <input
                    type="text"
                    aria-label="Bridging member name"
                    className="layer-name"
                    value={layer.bridgeLabel}
                    onChange={(event) => update(index, { bridgeLabel: event.target.value })}
                  />
                  <span className="bridged-share">
                    {layer.bridgedPercent.toFixed(1)}% of the face
                  </span>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => update(index, { bridgedPercent: 0 })}
                  >
                    remove
                  </button>
                </div>

                <div className="layer-grid">
                  <MaterialPicker
                    label="Member material"
                    materialId={layer.bridgeMaterialId}
                    fallbackLabel="λ typed in directly"
                    onSelect={(id) => applyBridgeMaterial(index, id)}
                  />
                  <label>
                    Member λ, W/(m·K)
                    <input
                      type="number"
                      min={0.001}
                      step={0.001}
                      value={layer.bridgeLambdaWPerMK}
                      onChange={(event) =>
                        update(index, {
                          bridgeLambdaWPerMK: Math.max(0.001, Number(event.target.value)),
                          bridgeMaterialId: null,
                        })
                      }
                    />
                  </label>
                  <label>
                    Set by
                    <select
                      value={layer.bridgeSizing}
                      onChange={(event) =>
                        setSizing(index, event.target.value as UiLayer['bridgeSizing'])
                      }
                    >
                      <option value="dimensions">Size &amp; spacing</option>
                      <option value="fraction">Percentage</option>
                    </select>
                  </label>

                  {layer.bridgeSizing === 'dimensions' ? (
                    <>
                      <label>
                        Member width, mm
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={layer.bridgeWidthMm}
                          onChange={(event) =>
                            setDimensions(index, Math.max(0, Number(event.target.value)), null)
                          }
                        />
                      </label>
                      <label>
                        Spacing, mm centres
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={layer.bridgeSpacingMm}
                          onChange={(event) =>
                            setDimensions(index, null, Math.max(1, Number(event.target.value)))
                          }
                        />
                      </label>
                    </>
                  ) : (
                    <label>
                      Bridged, %
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={Number(layer.bridgedPercent.toFixed(2))}
                        onChange={(event) =>
                          update(index, {
                            bridgedPercent: Math.min(
                              100,
                              Math.max(0, Number(event.target.value)),
                            ),
                          })
                        }
                      />
                    </label>
                  )}

                  <div className="layer-readout">
                    <span className="readout">
                      <span className="readout-label">R through member</span>
                      <span className="readout-value">
                        {reported?.bridgingResistanceM2KPerW === undefined
                          ? '—'
                          : roundResistanceForReporting(
                              reported.bridgingResistanceM2KPerW,
                            ).toFixed(3)}
                      </span>
                      <span className="readout-unit">m²K/W</span>
                    </span>
                  </div>
                </div>

                {layer.bridgeSizing === 'dimensions' && (
                  <p className="footnote">
                    {layer.bridgeWidthMm} mm every {layer.bridgeSpacingMm} mm is{' '}
                    {layer.bridgedPercent.toFixed(1)}% of the face. That is the repeating
                    members only — plates, noggins and lintels are extra, so switch to a
                    percentage to use a whole-element allowance instead.
                  </p>
                )}
              </div>
            )}

            <div className="layer-actions">
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0}>
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === layers.length - 1}
              >
                ↓
              </button>
              <button type="button" onClick={() => insert(index + 1, blankSolidLayer())}>
                insert below
              </button>
              <button type="button" className="danger" onClick={() => remove(index)}>
                delete
              </button>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
