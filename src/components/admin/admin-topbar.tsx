export function AdminTopbar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[#1e2130] bg-[#0f1117] px-5 py-3.5">
      <div>
        <p className="text-[15px] font-medium text-[#e8eaf2]">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-[#4a5070]">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function AdminButtonGhost(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  return (
    <button
      {...rest}
      className={`rounded-lg border border-[#1e2540] px-3 py-1.5 text-xs text-[#8890b0] transition-colors hover:bg-[#1a1e2e] hover:text-[#c0c8e8] ${className ?? ""}`}
    />
  );
}

export function AdminButtonPrimary(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  return (
    <button
      {...rest}
      className={`rounded-lg border border-[#2a4090] bg-[#1e3080] px-3 py-1.5 text-xs font-medium text-[#7c9ff5] transition-colors hover:bg-[#243898] disabled:opacity-50 ${className ?? ""}`}
    />
  );
}
