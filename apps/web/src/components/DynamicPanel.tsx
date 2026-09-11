import type { DynamicResult } from '@openuvalue/engine';

/**
 * Summer performance: what the construction does to a temperature that swings, as
 * opposed to one that sits still.
 *
 * The three figures are the ones a designer actually argues about — how much of the
 * afternoon peak gets through, how long it takes to arrive, and how much heat the inside
 * face can soak up overnight — and they are the reason two walls with the same U-value
 * can behave completely differently in August.
 */

export interface DynamicPanelProps {
  readonly dynamic: DynamicResult;
}

function formatHours(hours: number): string {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return minutes === 60 ? `${whole + 1} h 00 m` : `${whole} h ${String(minutes).padStart(2, '0')} m`;
}

export function DynamicPanel({ dynamic }: DynamicPanelProps): JSX.Element {
  const main = dynamic.main;
  const hours = dynamic.periodS / 3600;

  return (
    <section className="panel">
      <h2>Summer performance</h2>
      <p className="footnote">
        How the build-up handles a temperature that swings over {hours} hours, rather than
        one held steady. Two walls with the same U-value can be far apart here — it is the
        mass, and where in the build-up it sits, that decides it.
      </p>

      <dl className="dynamic-grid">
        <div>
          <dt>Decrement factor</dt>
          <dd>
            <strong>{main.decrementFactor.toFixed(3)}</strong>
            <span className="dynamic-gloss">
              {(main.decrementFactor * 100).toFixed(0)} % of the outside swing reaches the
              inside surface. Lower is calmer indoors.
            </span>
          </dd>
        </div>
        <div>
          <dt>Time shift</dt>
          <dd>
            <strong>{formatHours(main.timeShiftHours)}</strong>
            <span className="dynamic-gloss">
              How much later the indoor peak arrives. Push it past the evening and the heat
              lands when you can open a window.
            </span>
          </dd>
        </div>
        <div>
          <dt>
            Areal heat capacity <span className="symbol-label">κ</span>
            <sub>i</sub>
          </dt>
          <dd>
            <strong>{main.internalArealHeatCapacityKJPerM2K.toFixed(1)} kJ/(m²·K)</strong>
            <span className="dynamic-gloss">
              Heat the inside face can absorb and give back over a cycle. This is the figure
              SAP 10.3 uses for thermal mass.
            </span>
          </dd>
        </div>
        <div>
          <dt>
            Areal heat capacity <span className="symbol-label">κ</span>
            <sub>e</sub>
          </dt>
          <dd>
            <strong>{main.externalArealHeatCapacityKJPerM2K.toFixed(1)} kJ/(m²·K)</strong>
            <span className="dynamic-gloss">
              The same for the outside face. A big gap between the two means the insulation
              is cutting one side off from the mass.
            </span>
          </dd>
        </div>
        <div>
          <dt>Periodic transmittance Y</dt>
          <dd>
            <strong>
              {main.periodicThermalTransmittanceWPerM2K.toFixed(3)} W/(m²·K)
            </strong>
            <span className="dynamic-gloss">
              The swinging counterpart of the U-value: {main.uValueWPerM2K.toFixed(2)} steady
              against {main.periodicThermalTransmittanceWPerM2K.toFixed(3)} swinging.
            </span>
          </dd>
        </div>
      </dl>

      {dynamic.perPath.length > 1 && (
        <>
          <h3>Between the studs, and through them</h3>
          <p className="footnote">
            BS EN ISO 13786 is a method for layers that run right across the element. This
            one is bridged, so each section is calculated on its own and the figures above
            are the section between the members — timber stores far more heat than the
            insulation it displaces, so the two differ.
          </p>
          <table className="dynamic-table">
            <thead>
              <tr>
                <th scope="col">Section</th>
                <th scope="col">Area</th>
                <th scope="col">Decrement</th>
                <th scope="col">Time shift</th>
                <th scope="col">
                  <span className="symbol-label">κ</span>
                  <sub>i</sub>
                </th>
              </tr>
            </thead>
            <tbody>
              {dynamic.perPath.map((path) => (
                <tr key={path.pathId}>
                  <th scope="row">{path.label}</th>
                  <td>{(path.areaFraction * 100).toFixed(1)} %</td>
                  <td>{path.decrementFactor.toFixed(3)}</td>
                  <td>{formatHours(path.timeShiftHours)}</td>
                  <td>{path.internalArealHeatCapacityKJPerM2K.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {dynamic.warnings.length > 0 && (
        <ul className="warning-list">
          {dynamic.warnings.map((warning, index) => (
            <li key={`${warning.code}-${index}`} className={`warning warning-${warning.code}`}>
              {warning.message}
            </li>
          ))}
        </ul>
      )}

      <details className="explain">
        <summary>Where these come from</summary>
        <p className="tour-caveat">
          The method treats the outside temperature as a sine wave and solves the heat
          equation for the oscillation that settles down inside the construction. Each
          layer becomes a 2×2 complex matrix relating temperature and heat flow at its two
          faces; multiplying them in order gives the element, and the four figures above
          are read off the result. The scale that matters is the <em>periodic penetration
          depth</em> — how far into a material a {hours}-hour cycle reaches, which is
          around 100 mm for masonry. Mass buried deeper than that contributes almost
          nothing to the daily cycle, which is why a very thick wall is not proportionally
          better at damping one. OpenUValue derives the layer matrix from the heat
          equation rather than transcribing it, and the tests check it against the
          massless limit, a thin slab and a semi-infinite solid; the clause numbers in
          BS EN ISO 13786 are still to be verified (VERIFY.md V23).
        </p>
      </details>
    </section>
  );
}
