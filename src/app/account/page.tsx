import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccountForms } from "@/components/account-forms";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-xl font-semibold">Account</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">{session.user.email}</p>
      </div>
      <AccountForms email={session.user.email ?? ""} />
    </div>
  );
}
