import { notFound } from "next/navigation";

import { PendingReviewHarness } from "@/components/test-harness/pending-review-harness";

export default function PendingReviewHarnessPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <PendingReviewHarness />;
}
