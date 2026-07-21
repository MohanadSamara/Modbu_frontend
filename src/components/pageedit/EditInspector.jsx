// ============================================================================
// EditInspector — the "heavy" style panel for the selected <Editable>.
//
// Reads/writes the selected element's override through PageEditContext. Every
// control maps to an inline-style key (camelCase) that <Editable> spreads onto
// the element, so anything here is applied live and persisted globally.
//
// Grouped into collapsible sections: Content, Typography, Colors, Spacing,
// Border, Effects, Visibility.
// ============================================================================

import { usePageEdit } from '../../context/PageEditContext.jsx';
import { isAutoId, autoIdLabel } from '../../context/pageEditDom.js';

// ── Option catalogs ─────────────────────────────────────────────────────────
const SWATCHES = [
  ['Auto', ''],
  ['White', '#ffffff'],
  ['Slate', '#94a3b8'],
  ['Ink', '#0f1117'],
  ['Surface', '#1a1d27'],
  ['Blue', '#3b82f6'],
  ['Green', '#10b981'],
  ['Amber', '#f59e0b'],
  ['Red', '#ef4444'],
  ['Purple', '#8b5cf6'],
  ['Cyan', '#06b6d4'],
];

const FONTS = [
  ['Default', ''],
  ['Sans', "'Inter', system-ui, sans-serif"],
  ['Mono', "'JetBrains Mono', ui-monospace, monospace"],
  ['Serif', "Georgia, 'Times New Roman', serif"],
];

const WEIGHTS = [
  ['Light', '300'],
  ['Normal', '400'],
  ['Medium', '500'],
  ['Semibold', '600'],
  ['Bold', '700'],
];

const ALIGNS = [
  ['Left', 'left'],
  ['Center', 'center'],
  ['Right', 'right'],
];

const TRANSFORMS = [
  ['None', 'none'],
  ['UPPER', 'uppercase'],
  ['Title', 'capitalize'],
];

const SHADOWS = [
  ['None', ''],
  ['Small', '0 1px 3px rgba(0,0,0,0.4)'],
  ['Medium', '0 6px 16px rgba(0,0,0,0.4)'],
  ['Large', '0 14px 40px rgba(0,0,0,0.5)'],
  ['Glow', '0 0 20px rgba(59,130,246,0.55)'],
];

// ── Reusable controls ───────────────────────────────────────────────────────
function Section({ title, open = false, children }) {
  return (
    <details open={open} className="group border-t border-white/5 pt-3">
      <summary className="flex items-center justify-between cursor-pointer list-none text-[11px] font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-200 select-none">
        {title}
        <svg className="w-3.5 h-3.5 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

function Label({ children }) {
  return <span className="block text-[11px] text-gray-500 mb-1">{children}</span>;
}

function Swatches({ value = '', onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SWATCHES.map(([name, hex]) => {
        const active = value === hex;
        return (
          <button
            key={name}
            title={name}
            onClick={() => onChange(hex)}
            className={`w-6 h-6 rounded-lg border transition-transform hover:scale-110 ${
              active ? 'border-white ring-2 ring-blue-500/60' : 'border-white/15'
            } ${hex ? '' : 'bg-white/5 flex items-center justify-center'}`}
            style={hex ? { background: hex } : undefined}
          >
            {!hex && <span className="text-[9px] text-gray-400">×</span>}
          </button>
        );
      })}
      <label className="w-6 h-6 rounded-lg border border-white/15 overflow-hidden cursor-pointer" title="Custom colour">
        <input
          type="color"
          value={value && value.startsWith('#') ? value : '#3b82f6'}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 -m-1 cursor-pointer"
        />
      </label>
    </div>
  );
}

function Slider({ value, onChange, min, max, step = 1, unit = 'px', fallback = 0 }) {
  const num = value != null && value !== '' ? parseFloat(value) : '';
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min} max={max} step={step}
        value={num === '' ? fallback : num}
        onChange={(e) => onChange(`${e.target.value}${unit}`)}
        className="flex-1 accent-blue-500"
      />
      <span className="w-10 text-right text-[11px] text-gray-400 tabular-nums">
        {num === '' ? 'auto' : `${num}`}
      </span>
      <button
        onClick={() => onChange('')}
        className="text-[10px] px-1.5 py-1 rounded-md bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
        title="Clear"
      >
        ×
      </button>
    </div>
  );
}

function Segmented({ value = '', onChange, options }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([label, val]) => (
        <button
          key={val}
          onClick={() => onChange(value === val ? '' : val)}
          className={`px-1 py-1.5 rounded-lg text-[11px] transition-colors ${
            value === val ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Inspector ────────────────────────────────────────────────────────────────
export default function EditInspector() {
  const { selectedId, overrides, setOverride, clearOverride, setSelectedId } = usePageEdit();
  if (!selectedId) return null;

  const ov = overrides[selectedId] || {};
  const style = ov.style || {};
  const patch = (p) => setOverride(selectedId, { style: { ...style, ...p } });
  // Synthesised (clicked-any-element) selections are style-only: their text is
  // owned by React and would revert on the next render, so we hide the text box.
  const auto = isAutoId(selectedId);

  // Border width also toggles borderStyle so a border actually renders.
  const setBorderWidth = (v) => {
    if (!v || parseFloat(v) === 0) patch({ borderWidth: '', borderStyle: '' });
    else patch({ borderWidth: v, borderStyle: 'solid' });
  };

  return (
    <div className="fixed top-20 right-4 z-[60] w-72 max-h-[82vh] overflow-y-auto rounded-2xl bg-[#13151c] border border-white/10 shadow-2xl p-4 space-y-3 animate-scale-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Edit element</p>
          <p className="text-[11px] text-gray-500 truncate font-mono">
            {auto ? autoIdLabel(selectedId) : selectedId}
          </p>
        </div>
        <button
          onClick={() => setSelectedId(null)}
          className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close inspector"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content — only for wrapped <Editable> elements. A synthesised (any-
          element) selection is style-only; its text is React-owned. */}
      {auto ? (
        <p className="text-[11px] text-gray-500 leading-relaxed rounded-xl bg-white/5 px-3 py-2">
          Styling any element on the page. Text content of this element can't be
          changed here — only its look (colours, size, spacing, borders…) and
          visibility.
        </p>
      ) : (
        <div>
          <Label>Text content</Label>
          <textarea
            rows={2}
            value={ov.text ?? ''}
            onChange={(e) => setOverride(selectedId, { text: e.target.value })}
            placeholder="Leave empty to keep original"
            className="w-full px-3 py-2 rounded-xl bg-[#0f1117] border border-white/10 text-gray-200 text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-y"
          />
        </div>
      )}

      {/* Typography */}
      <Section title="Typography" open>
        <div>
          <Label>Font</Label>
          <Segmented value={style.fontFamily ?? ''} onChange={(v) => patch({ fontFamily: v })} options={FONTS} />
        </div>
        <div>
          <Label>Size</Label>
          <Slider value={style.fontSize} onChange={(v) => patch({ fontSize: v })} min={10} max={64} fallback={16} />
        </div>
        <div>
          <Label>Weight</Label>
          <Segmented value={style.fontWeight ?? ''} onChange={(v) => patch({ fontWeight: v })} options={WEIGHTS} />
        </div>
        <div>
          <Label>Align</Label>
          <Segmented value={style.textAlign ?? ''} onChange={(v) => patch({ textAlign: v })} options={ALIGNS} />
        </div>
        <div>
          <Label>Transform</Label>
          <Segmented value={style.textTransform ?? ''} onChange={(v) => patch({ textTransform: v })} options={TRANSFORMS} />
        </div>
        <div>
          <Label>Line height</Label>
          <Slider value={style.lineHeight} onChange={(v) => patch({ lineHeight: v })} min={1} max={3} step={0.1} unit="" fallback={1.5} />
        </div>
        <div>
          <Label>Letter spacing</Label>
          <Slider value={style.letterSpacing} onChange={(v) => patch({ letterSpacing: v })} min={-2} max={8} step={0.5} fallback={0} />
        </div>
        <label className="flex items-center justify-between cursor-pointer select-none pt-1">
          <span className="text-[13px] text-gray-300">Italic</span>
          <input
            type="checkbox"
            checked={style.fontStyle === 'italic'}
            onChange={(e) => patch({ fontStyle: e.target.checked ? 'italic' : '' })}
            className="w-4 h-4 accent-blue-500"
          />
        </label>
      </Section>

      {/* Colors */}
      <Section title="Colours">
        <div>
          <Label>Text colour</Label>
          <Swatches value={style.color ?? ''} onChange={(v) => patch({ color: v })} />
        </div>
        <div>
          <Label>Background</Label>
          <Swatches value={style.backgroundColor ?? ''} onChange={(v) => patch({ backgroundColor: v })} />
        </div>
      </Section>

      {/* Spacing */}
      <Section title="Spacing">
        <div>
          <Label>Padding</Label>
          <Slider value={style.padding} onChange={(v) => patch({ padding: v })} min={0} max={48} fallback={0} />
        </div>
        <div>
          <Label>Margin</Label>
          <Slider value={style.margin} onChange={(v) => patch({ margin: v })} min={0} max={48} fallback={0} />
        </div>
      </Section>

      {/* Border */}
      <Section title="Border">
        <div>
          <Label>Width</Label>
          <Slider value={style.borderWidth} onChange={setBorderWidth} min={0} max={8} fallback={0} />
        </div>
        <div>
          <Label>Colour</Label>
          <Swatches value={style.borderColor ?? ''} onChange={(v) => patch({ borderColor: v })} />
        </div>
        <div>
          <Label>Radius</Label>
          <Slider value={style.borderRadius} onChange={(v) => patch({ borderRadius: v })} min={0} max={40} fallback={0} />
        </div>
      </Section>

      {/* Effects */}
      <Section title="Effects">
        <div>
          <Label>Opacity</Label>
          <Slider value={style.opacity} onChange={(v) => patch({ opacity: v })} min={0} max={1} step={0.05} unit="" fallback={1} />
        </div>
        <div>
          <Label>Shadow</Label>
          <Segmented value={style.boxShadow ?? ''} onChange={(v) => patch({ boxShadow: v })} options={SHADOWS} />
        </div>
      </Section>

      {/* Visibility + reset */}
      <div className="border-t border-white/5 pt-3 space-y-3">
        <label className="flex items-center justify-between cursor-pointer select-none">
          <span className="text-[13px] text-gray-300">Hide from users</span>
          <input
            type="checkbox"
            checked={!!ov.hidden}
            onChange={(e) => setOverride(selectedId, { hidden: e.target.checked })}
            className="w-4 h-4 accent-blue-500"
          />
        </label>
        <button
          onClick={() => clearOverride(selectedId)}
          className="w-full px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors"
        >
          Reset this element
        </button>
      </div>
    </div>
  );
}
