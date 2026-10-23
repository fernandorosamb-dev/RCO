"use client";
import type { WorkOrder } from "./Assignments";
import { OCTOBER_PLAN } from "./maintenance-plan";
import { formatPlanDate } from "./order-deadlines";
const areas = [["eletrica", "Elétrica"], ["hidraulica", "Hidráulica"], ["civil", "Civil"], ["refrigeracao", "Refrigeração"]] as const;
export default function MaintenancePlan({ orders, area, selectedDay, onSelectDay }: { orders: WorkOrder[]; area: string; selectedDay: string; onSelectDay: (date: string) => void }) {
  if (!orders.some(order=>order.competence==="2026-10")) return null;
  const columns = areas.filter(([key])=>(!area || area===key) && orders.some(order=>order.assignedArea===key));
  return <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold">Plano de manutenção · 05 a 19/10</h3>{selectedDay && <button type="button" className="text-sm font-bold text-blue-900 underline" onClick={()=>onSelectDay("")}>Ver todos os dias</button>}</div>
    <p className="mt-2 text-sm text-slate-600">10 dias úteis. Sem atividades em 12/10. Clique no dia para consultar as OS programadas. Menos ordens nos dias com serviços mais extensos; 19/10 inclui conferência final.</p>
    <div className="mt-3 overflow-x-auto"><table className="w-full border-collapse text-sm"><caption className="sr-only">Distribuição diária das ordens por área</caption><thead><tr className="bg-blue-950 text-white"><th scope="col" className="p-3 text-left">Data</th>{columns.map(([key,label])=><th scope="col" className="p-3 text-left" key={key}>{label}</th>)}<th scope="col" className="p-3 text-left">Total</th></tr></thead><tbody>{OCTOBER_PLAN.map(plan=>{
      const daily = orders.filter(order=>order.plannedExecutionAt===plan.date && (!area || order.assignedArea===area));
      return <tr key={plan.date} className={`border-t border-slate-200 align-top ${selectedDay===plan.date?"bg-blue-50":""}`}><th scope="row" className="p-3 text-left"><button type="button" aria-pressed={selectedDay===plan.date} className="min-h-11 whitespace-nowrap font-bold text-blue-900 underline" onClick={()=>onSelectDay(selectedDay===plan.date?"":plan.date)}>{formatPlanDate(plan.date)}</button></th>{columns.map(([key])=>{
        const list = daily.filter(order=>order.assignedArea===key);
        return <td className="min-w-32 p-3" key={key}><b>{list.length} OS</b><p className="mt-1 leading-6 text-slate-600">{list.map(order=>order.osNumber).join(", ") || "—"}</p></td>;
      })}<td className="p-3 font-bold">{daily.length}</td></tr>;
    })}</tbody></table></div>
    {selectedDay && <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm font-semibold text-blue-950">{OCTOBER_PLAN.find(plan=>plan.date===selectedDay)?.focus}</p>}
    <p className="mt-3 text-sm text-slate-600">Agrupamento por equipamento e local. Bombas e quadros correspondentes no mesmo dia. Nobreaks 1 a 9 em uma única OS; ventilação dos galpões com carga diária reduzida.</p>
  </div>;
}
