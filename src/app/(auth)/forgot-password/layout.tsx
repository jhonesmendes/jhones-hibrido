import { CenteredAuthShell } from "@/components/auth/centered-auth-shell";

export default function ForgotPasswordLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <CenteredAuthShell>{children}</CenteredAuthShell>;
}
