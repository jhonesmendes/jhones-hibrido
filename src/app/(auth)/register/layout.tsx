import { CenteredAuthShell } from "@/components/auth/centered-auth-shell";

export default function RegisterLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <CenteredAuthShell>{children}</CenteredAuthShell>;
}
