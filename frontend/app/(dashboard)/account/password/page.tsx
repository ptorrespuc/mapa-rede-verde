import { PasswordChangeForm } from "@/components/auth/password-change-form";
import { requireUserContext } from "@/lib/auth";

export default async function AccountPasswordPage() {
  await requireUserContext();

  return <PasswordChangeForm />;
}
