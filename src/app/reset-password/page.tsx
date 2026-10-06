import { ResetPasswordForm } from "@/components/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <div>
        <h1 className="text-xl font-semibold">Reset your password</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Enter your email, the recovery code you saved when you signed up, and a new password. If you can&apos;t find your code,
          ask whoever runs this site to reset it for you.
        </p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
