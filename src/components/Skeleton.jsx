// Shimmer placeholders shown while data loads, built on the existing
// `.skeleton` utility class (index.css). Keeps layouts stable instead of
// swapping empty space / "Loading…" text in and out.

// A stack of full-width bars — drop-in replacement for "Loading…" blocks.
export function SkeletonList({ rows = 5, height = 'h-10', className = '' }) {
  return (
    <div className={`space-y-2 p-4 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`skeleton ${height}`} />
      ))}
    </div>
  );
}

// Placeholder rows for a table body; column count should match the real table.
export function SkeletonTableRows({ rows = 5, cols = 4 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} aria-hidden="true">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-6 py-4">
              <div className="skeleton h-4" style={{ width: `${55 + ((r * 7 + c * 13) % 40)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
