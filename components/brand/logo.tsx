/**
 * The mark: an aperture.
 *
 * Brand Book §14 rules out the leaf, the checkmark, the shield, the basket and
 * the magnifying glass, and points instead at light, at a lens, at seeing
 * beneath the surface. Noura means light.
 *
 * So: a ring with an opening, and a point of focus at its centre. The opening
 * is where light gets in; the dot is the thing brought into it. It is two
 * shapes, which is what lets it survive at 16px in a browser tab and at 200px
 * on a wall, and what would let it live one day as a single ambient glyph in
 * someone else's interface.
 */

export function NouraMark({
  className = "",
  title,
}: {
  className?: string;
  /** Supply only when the mark stands alone; beside the wordmark it is decorative. */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {/* The lens, opened at the upper right. Drawn as one 310° arc so the gap
          stays put at every size — a dasharray would drift with the stroke. */}
      <path
        d="M19.75 9.18 A 8.25 8.25 0 1 1 14.82 4.25"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* The point of focus. */}
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    </svg>
  );
}

/**
 * The wordmark. Lowercase, in the display serif — soft and considered rather
 * than corporate (§14). The mark sits slightly optically low against it because
 * the serif's x-height runs high.
 */
export function NouraWordmark({
  className = "",
  markClassName = "",
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <NouraMark className={`h-[1.15em] w-[1.15em] text-brand ${markClassName}`} />
      <span className="font-display text-[1.375em] leading-none tracking-[-0.01em]">noura</span>
    </span>
  );
}
