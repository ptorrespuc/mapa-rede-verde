import { notFound } from "next/navigation";

import { PointEditFormHarness } from "@/components/test-harness/point-edit-form-harness";

export default function PointEditHarnessPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <PointEditFormHarness />;
}
