import { ModalSheet } from "@/src/components/ui/modal-sheet";
import { PointForm } from "@/src/components/points/point-form";
import type {
  CreatePointPayload,
  GroupRecord,
  PointClassificationRecord,
  SpeciesRecord,
} from "@/src/types/domain";

interface PointFormModalProps {
  open: boolean;
  title: string;
  groups: GroupRecord[];
  classifications: PointClassificationRecord[];
  speciesCatalog: SpeciesRecord[];
  initialValues?: Partial<CreatePointPayload>;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (payload: CreatePointPayload) => Promise<void>;
}

export function PointFormModal({
  open,
  title,
  groups,
  classifications,
  speciesCatalog,
  initialValues,
  submitLabel,
  onClose,
  onSubmit,
}: PointFormModalProps) {
  return (
    <ModalSheet onClose={onClose} open={open} title={title}>
      <PointForm
        classifications={classifications}
        groups={groups}
        initialValues={initialValues}
        onCancel={onClose}
        onSubmit={onSubmit}
        speciesCatalog={speciesCatalog}
        submitLabel={submitLabel}
      />
    </ModalSheet>
  );
}
