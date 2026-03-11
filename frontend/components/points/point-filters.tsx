"use client";

import { Filter } from "lucide-react";

import type { PointClassificationRecord } from "@/types/domain";

interface PointFiltersProps {
  classifications: PointClassificationRecord[];
  value: string;
  onChange: (value: string) => void;
}

export function PointFilters({ classifications, value, onChange }: PointFiltersProps) {
  return (
    <div className="field toolbar-field">
      <label className="toolbar-label" htmlFor="point-filter">
        <Filter aria-hidden="true" size={15} />
        <span>Classificacao</span>
      </label>
      <select id="point-filter" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">Todas as classificacoes</option>
        {classifications.map((classification) => (
          <option key={classification.id} value={classification.id}>
            {classification.name}
          </option>
        ))}
      </select>
    </div>
  );
}
