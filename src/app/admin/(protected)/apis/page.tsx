import { Plug } from "lucide-react";
import { AdminTopbar } from "@/components/admin/admin-topbar";

export const dynamic = "force-dynamic";

export default function AdminApisPage() {
  return (
    <>
      <AdminTopbar title="APIs" subtitle="Documentação e gestão das integrações do painel" />
      <div className="p-5">
        <div className="flex flex-col items-center gap-2 rounded-[10px] border border-[#1e2130] bg-[#13161f] p-10 text-center">
          <Plug className="h-6 w-6 text-[#3a4060]" />
          <p className="text-sm text-[#8890b0]">Aguardando a documentação das APIs pra montar esta tela.</p>
        </div>
      </div>
    </>
  );
}
