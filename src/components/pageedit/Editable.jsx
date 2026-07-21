// ============================================================================
// <Editable> — a piece of page content an admin can restyle in Edit Mode.
//
//   <Editable id="dashboard.quickAccess" as="h2" className="...">
//     Quick Access
//   </Editable>
//
//   <Editable id="hero.image" type="image">/img/hero.png</Editable>
//
// Outside edit mode it renders exactly like the wrapped tag, with any saved
// override (text / style / hidden) applied. In edit mode (admins only) it gets
// a dashed highlight and becomes clickable to select for the inspector panel.
//
// `id` must be unique and STABLE — it's the persistence key. Use a
// "page.section" convention so ids stay readable.
// ============================================================================

import { usePageEdit } from '../../context/PageEditContext.jsx';

export default function Editable({
  id,
  as: As = 'span',
  type = 'text',            // 'text' | 'image'
  className = '',
  children,
  ...rest
}) {
  const { isAdmin, editMode, overrides, selectedId, setSelectedId } = usePageEdit();
  const ov = overrides[id] || {};
  const active = isAdmin && editMode;     // interactive editing on?
  const selected = active && selectedId === id;

  // Hidden elements vanish for everyone — except in edit mode, where they stay
  // visible (dimmed) so an admin can un-hide them.
  if (ov.hidden && !active) return null;

  const style = { ...(ov.style || {}) };
  if (ov.hidden && active) style.opacity = 0.4;

  const content =
    type === 'image'
      ? <img src={ov.text || children} alt="" className="max-w-full h-auto" />
      : (ov.text ?? children);

  // Passive render (normal app / non-admin / edit mode off).
  if (!active) {
    return <As className={className} style={style} {...rest}>{content}</As>;
  }

  // Interactive render — clicking selects this element for the inspector.
  const onSelect = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(id);
  };

  return (
    <As
      className={`pe-editable ${selected ? 'pe-selected' : ''} ${className}`}
      style={style}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(e); }}
      title={`Edit “${id}”`}
      {...rest}
    >
      {content}
    </As>
  );
}
