import type { PointTagRecord } from "@/types/domain";

interface PointTagBadgesProps {
  tags?: PointTagRecord[] | null;
  limit?: number;
  className?: string;
}

export function PointTagBadges({
  tags,
  limit = 4,
  className = "point-tag-list",
}: PointTagBadgesProps) {
  const visibleTags = (tags ?? []).filter((tag) => tag.is_active).slice(0, limit);
  const hiddenTagCount = Math.max((tags ?? []).filter((tag) => tag.is_active).length - visibleTags.length, 0);

  if (!visibleTags.length && hiddenTagCount === 0) {
    return null;
  }

  return (
    <div className={className}>
      {visibleTags.map((tag) => (
        <span className="badge point-tag-badge" key={tag.id}>
          {tag.name}
        </span>
      ))}
      {hiddenTagCount > 0 ? (
        <span className="badge point-tag-badge">+{hiddenTagCount}</span>
      ) : null}
    </div>
  );
}
