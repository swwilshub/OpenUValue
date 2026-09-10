import type { UValueResult } from '@openuvalue/engine';
import { roundResistanceForReporting } from '@openuvalue/engine';
import { MATERIALS, findMaterialById, toEngineMaterial } from '@openuvalue/materials';
import { type UiLayer, blankAirLayer, blankSolidLayer } from '../state/model.js';

export interface LayerTableProps {
  readonly layers: readonly UiLayer[];
  readonly result: UValueResult;
  readonly onChange: (layers: readonly UiLayer[]) => void;
}

const VENTILATION_LABELS = {
  unventilated: 'Unventilated',
  'slightly-ventilated': 'Slightly ventilated',
  'well-ventilated': 'Well ventilated',
} as const;

export function LayerTable({ layers, result, onChange }: LayerTableProps): JSX.Element {
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
        return (
          <fieldset
            key={layer.id}
            className={isDisregarded ? 'layer-row layer-row-disregarded' : 'layer-row'}
          >
            <legend>
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
                <label>
                  Material
                  <select
                    value={layer.materialId ?? ''}
                    onChange={(event) => applyMaterial(index, event.target.value)}
                  >
                    <option value="">(λ typed in directly)</option>
                    {MATERIALS.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.name}
                      </option>
                    ))}
                  </select>
                </label>
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
                <label>
                  Bridged, %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={layer.bridgedPercent}
                    onChange={(event) =>
                      update(index, {
                        bridgedPercent: Math.min(100, Math.max(0, Number(event.target.value))),
                      })
                    }
                  />
                </label>
              )}

              <div className="layer-resistance">
                <span className="resistance-label">R</span>
                <span className="resistance-value">
                  {reported === undefined
                    ? '—'
                    : roundResistanceForReporting(reported.combinedResistanceM2KPerW).toFixed(3)}
                </span>
                <span className="resistance-unit">m²K/W</span>
              </div>
            </div>

            {layer.kind === 'solid' && layer.bridgedPercent > 0 && (
              <div className="layer-grid bridging-grid">
                <label>
                  Bridging material
                  <select
                    value={layer.bridgeMaterialId ?? ''}
                    onChange={(event) => applyBridgeMaterial(index, event.target.value)}
                  >
                    <option value="">(λ typed in directly)</option>
                    {MATERIALS.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Bridging λ, W/(m·K)
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
                <div className="layer-resistance">
                  <span className="resistance-label">R bridge</span>
                  <span className="resistance-value">
                    {reported?.bridgingResistanceM2KPerW === undefined
                      ? '—'
                      : roundResistanceForReporting(reported.bridgingResistanceM2KPerW).toFixed(3)}
                  </span>
                  <span className="resistance-unit">m²K/W</span>
                </div>
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
