import type { HeatingSettings } from '../state/heating.js';
import { heatingSummary } from '../state/heating.js';

/**
 * The settings a tab is using, named in one line with a way to change them. They are
 * asked for once, on the Conditions tab; repeating the form here would let two tabs
 * drift apart.
 */
export function HeatingSummary({
  settings,
  onEdit,
}: {
  readonly settings: HeatingSettings;
  readonly onEdit: () => void;
}): JSX.Element {
  return (
    <p className="heating-summary">
      <span>
        Using: <strong>{heatingSummary(settings)}</strong>
      </span>
      <button type="button" className="link-button" onClick={onEdit}>
        Change on the Conditions tab
      </button>
    </p>
  );
}
