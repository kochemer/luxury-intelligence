/**
 * Decorative masthead lockup with diamond-ornament rules above and below.
 * Two sizes: hero (white, large) and footer (accent, compact).
 */
export default function MastheadLockup({
  variant = 'hero',
}: {
  variant?: 'hero' | 'footer';
}) {
  // Use h1 only on hero (homepage). Footer appears on every page — a second h1
  // there would break the one-h1-per-page rule, so render a span instead.
  const Tag = variant === 'hero' ? 'h1' : 'span';
  const isHero = variant === 'hero';
  const lineColor = isHero ? 'bg-white/30' : 'bg-[var(--color-accent)]/30';
  const diamondColor = isHero ? 'text-white/50' : 'text-[var(--color-accent)]/60';
  const textColor = isHero ? 'text-white' : 'text-[#FAF9F6]';
  const textSize = isHero ? 'text-hero-masthead' : 'text-lg';
  const tracking = isHero ? 'tracking-[0.2em]' : 'tracking-wider';
  const bottomRuleWidth = isHero ? 'w-32' : 'w-20';

  return (
    <div className="flex flex-col items-start">
      {/* Top rule: line ◇ line */}
      <div className="flex items-center w-full max-w-xs mb-3" aria-hidden="true">
        <span className={`flex-1 h-px ${lineColor}`} />
        <span className={`${diamondColor} text-xs mx-3 select-none`}>◇</span>
        <span className={`flex-1 h-px ${lineColor}`} />
      </div>

      {/* Masthead text */}
      <Tag
        className={`font-serif ${textSize} ${tracking} ${textColor} uppercase font-bold`}
      >
        Luxury Intelligence
      </Tag>

      {/* Bottom rule: shorter, centred */}
      <div className={`flex items-center ${bottomRuleWidth} mt-3`} aria-hidden="true">
        <span className={`flex-1 h-px ${lineColor}`} />
        <span className={`${diamondColor} text-[10px] mx-2 select-none`}>◇</span>
        <span className={`flex-1 h-px ${lineColor}`} />
      </div>
    </div>
  );
}
