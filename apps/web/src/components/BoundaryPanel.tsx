import type { EnvironmentConditions, HeatFlowDirection } from '@openuvalue/engine';
import { surfaceResistances } from '@openuvalue/engine';

const DIRECTION_LABELS: Record<HeatFlowDirection, string> = {
  horizontal: 'Horizontal — wall',
  upward: 'Upward — roof or ceiling',
  downward: 'Downward — floor',
};

export interface BoundaryPanelProps {
  readonly heatFlowDirection: HeatFlowDirection;
  readonly conditions: EnvironmentConditions;
  readonly onDirectionChange: (direction: HeatFlowDirection) => void;
  readonly onConditionsChange: (conditions: EnvironmentConditions) => void;
}

export function BoundaryPanel({
  heatFlowDirection,
  conditions,
  onDirectionChange,
  onConditionsChange,
}: BoundaryPanelProps): JSX.Element {
  const { rsiM2KPerW, rseM2KPerW } = surfaceResistances(heatFlowDirection);
  const set = (patch: Partial<EnvironmentConditions>): void => {
    onConditionsChange({ ...conditions, ...patch });
  };

  return (
    <section className="panel">
      <h2>Boundary conditions</h2>
      <div className="boundary-grid">
        <label className="span-2">
          Direction of heat flow
          <select
            value={heatFlowDirection}
            onChange={(event) => onDirectionChange(event.target.value as HeatFlowDirection)}
          >
            {(Object.keys(DIRECTION_LABELS) as HeatFlowDirection[]).map((direction) => (
              <option key={direction} value={direction}>
                {DIRECTION_LABELS[direction]}
              </option>
            ))}
          </select>
        </label>

        <label>
          Inside, °C
          <input
            type="number"
            step={0.5}
            value={conditions.internalAirTemperatureC}
            onChange={(event) => set({ internalAirTemperatureC: Number(event.target.value) })}
          />
        </label>
        <label>
          Inside RH, %
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={conditions.internalRelativeHumidityPercent}
            onChange={(event) =>
              set({
                internalRelativeHumidityPercent: Math.min(
                  100,
                  Math.max(0, Number(event.target.value)),
                ),
              })
            }
          />
        </label>
        <label>
          Outside, °C
          <input
            type="number"
            step={0.5}
            value={conditions.externalAirTemperatureC}
            onChange={(event) => set({ externalAirTemperatureC: Number(event.target.value) })}
          />
        </label>
        <label>
          Outside RH, %
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={conditions.externalRelativeHumidityPercent}
            onChange={(event) =>
              set({
                externalRelativeHumidityPercent: Math.min(
                  100,
                  Math.max(0, Number(event.target.value)),
                ),
              })
            }
          />
        </label>
      </div>
      <p className="footnote">
        Surface resistances for this direction: R<sub>si</sub> {rsiM2KPerW.toFixed(2)}, R
        <sub>se</sub> {rseM2KPerW.toFixed(2)} m²K/W (BS EN ISO 6946, adopted by BR 443).
      </p>
    </section>
  );
}
