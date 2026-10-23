import { hasValidLocation, locationFromEquipment } from "./location-fields";
export const importAreas = ["eletrica", "hidraulica", "refrigeracao", "civil"] as const;
export type ImportArea = typeof importAreas[number];
export type ImportedOrder = { osNumber: string; client: string; unit: string; environment: string; floor: string; openedAt: string; dueAt: string; originalStatus: string; description: string; equipment: string; importedText: string };
export type AssignmentHistory = { unit: string; equipment: string; assignedArea: string; assignedResponsible: string };
export const responsibleByArea: Record<string, string> = {
  eletrica: "Allan dos Santos Benides - Eletrotécnico",
  hidraulica: "EVERSON VICENTE FERREIRA - BOMBEIRO HIDRÁULICO",
  refrigeracao: "FABRICIO RODRIGO DA SILVA - MECÂNICO DE REFRIGERAÇÃO",
  civil: "IVAN RIVALDIR DE SOUZA SANTOS - AUXILIAR DE MANUTENÇÃO",
};
const civilEquipment = new Set(["16295","16297","16298","16299","16300","16301","16302","16304","16305","16306","16309","16311","16312","16369","16370","16371","16372","16373","16374","16375","16376","16377","16378","16379","16516","16517","16518","16519"]);
const refrigerationEquipment = new Set(["16345","16349","16351","16353","16356","16357","16358","16359","16360","16384","16385","16395","16396","16399"]);
const hydraulicEquipment = new Set(["16383","16444","16445","16482","16483","16484","16485","16486","16487","16488","16489","16490","16491","16492","16493","16494","16495","16496","16497","16498","16499","16500","16501","16502","16503","16504","16505","16506","16507","16508","16509","16510"]);

const electricalEquipment = new Set(["16313","16314","16316","16317","16318","16320","16321","16322","16323","16324","16381","16382","16387","16388","16390","16391","16393","16511","16512","16515","16520","16521"]);
export function normalizeText(value: string) { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
function section(text: string, start: RegExp, end: RegExp) {
  const from = text.search(start); if (from < 0) return "";
  const rest = text.slice(from).replace(start, ""); const to = rest.search(end);
  return (to < 0 ? rest : rest.slice(0, to)).trim();
}
function tidy(value: string) { return value.split(/\n+/).map(line=>line.trim()).filter(line=>line && line!=="-" && !/^(Periodicidade(?:\s+Descrição)?|Descrição|Equipamento\s+TAG\s+Prioridade)$/i.test(line)).join("\n"); }
const orderHeading = /Ordem de servi[cç]o\s*\/\s*Chamado t[eé]cnico\s*N[º°o]\.?\s*:\s*(\d+)/gi;
export function parseOrders(fullText: string): { orders: ImportedOrder[]; duplicateCount: number } {
  const text = fullText.replace(/\r\n?/g, "\n").replace(/\u000c/g, "\n").replace(/[\uFB00-\uFB06]/g, char=>char.normalize("NFKD"));
  const headings = [...text.matchAll(orderHeading)];
  const orders = new Map<string, ImportedOrder>(); let duplicateCount = 0;
  for (const [index, heading] of headings.entries()) {
    const block = text.slice(heading.index, headings[index+1]?.index ?? text.length);
    const unit = block.match(/Local\s*\/\s*Unidade[ \t]*\n+([^\n]+)/i)?.[1]?.trim() || "";
    const local = block.match(/Ambiente:[ \t]*([^\n/]*?)[ \t]*\/[ \t]*Pavimento:[ \t]*([^\n]*)/i);
    const description = tidy(section(block, /^\s*ITENS DA ORDEM DE SERVIÇO\s*$/im, /^\s*(?:EQUIPAMENTOS|COLABORADORES\s*\/\s*TÉCNICOS|OBSERVAÇÕES|FOTOS|HISTÓRICO DE STATUS)\s*$/im));
    const equipment = tidy(section(block, /^\s*EQUIPAMENTOS\s*$/im, /^\s*COLABORADORES\s*\/\s*TÉCNICOS\s*$/im));
    const inferred = locationFromEquipment(equipment);
    const clientLines = block.slice(0, Math.max(0, block.search(/CPF\s*\/\s*CNPJ/i))).split(/\n+/).map(line=>line.trim()).filter(Boolean);
    const order = { osNumber: heading[1], unit, client: clientLines.at(-1)||"", environment: hasValidLocation(local?.[1]||"",unit) ? local![1].trim() : inferred?.environment || "", floor: hasValidLocation(local?.[2]||"") ? local![2].trim() : inferred?.floor || "", openedAt: block.match(/(?:^|\n)[ \t]*Data:[ \t]*([\d/]+(?:[ \t]+[\d:]+)?)/i)?.[1]||"", dueAt: block.match(/Data de conclusão:[ \t]*([\d/]+(?:[ \t]+[\d:]+)?)/i)?.[1]||"", originalStatus: block.match(/Status:[ \t]*([^\n]+)/i)?.[1]?.trim()||"Aberta", description, equipment, importedText: block.trim() };
    const previous = orders.get(order.osNumber);
    if (previous) { duplicateCount++; if (normalizeText(previous.unit)!==normalizeText(order.unit) || normalizeText(previous.equipment)!==normalizeText(order.equipment)) throw new Error(`A OS ${order.osNumber} aparece com unidades ou equipamentos diferentes. Revise o PDF.`); if (order.importedText.length>previous.importedText.length) orders.set(order.osNumber, order); }
    else orders.set(order.osNumber, order);
  }
  return { orders: [...orders.values()].sort((a,b)=>a.osNumber.localeCompare(b.osNumber,"pt-BR",{numeric:true})), duplicateCount };
}
export function equipmentKey(unit: string, equipment: string): string {
  const codes = [...equipment.matchAll(/(?:^|[^\d])(\d{5})(?!\d)/g)].map(match=>match[1]);
  return codes.length ? `${normalizeText(unit)}|${[...new Set(codes)].sort().join(",")}` : "";
}
function textAreas(text: string): ImportArea[] {
  const value=normalizeText(text); const found: ImportArea[]=[];
  if (/bebedouro|portao|exaustor|ventilador|alvenaria|pintura|telhado|serralher|carrinho|piso|porta\b/.test(value)) found.push("civil");
  if (/ar[- ]?condicionado|split|climatiza|refriger|evaporadora|condensadora/.test(value)) found.push("refrigeracao");
  if (/quadro|eletric|tomada|ilumin|lampada|gerador|disjuntor|nobreak|no[ -]?break|estabilizador|cftv|dvr|interfone|central telefon/.test(value) || (/camera/.test(value) && !/pneus?|carrinho|rodas?/.test(value))) found.push("eletrica");
  if (/hidraul|torneira|vaso sanit|esgoto|ralo|caixa d.?agua|bomba|hidrante|botoeira|central de alarme|detector de fumaca|banheiro|valvula|recalque/.test(value) && !/quadro/.test(value)) found.push("hidraulica");
  return found;
}
export function classifyOrder(order: ImportedOrder, history: ReadonlyMap<string, AssignmentHistory> = new Map()): { assignedArea: string; assignedResponsible: string; reason: string } {
  if (!order.unit) return { assignedArea:"", assignedResponsible:"", reason:"Unidade não reconhecida no PDF." };
  const key=equipmentKey(order.unit,order.equipment); const learned=key?history.get(key):undefined;
  if (learned && importAreas.includes(learned.assignedArea as ImportArea)) return { assignedArea:learned.assignedArea, assignedResponsible:learned.assignedResponsible||responsibleByArea[learned.assignedArea], reason:"Atribuição anterior do mesmo equipamento." };
  const matches = new Set<ImportArea>();
  for(const match of order.equipment.matchAll(/(?:^|[^\d])(\d{5})(?!\d)/g)) { const code=match[1]; if(civilEquipment.has(code))matches.add("civil");if(refrigerationEquipment.has(code))matches.add("refrigeracao");if(hydraulicEquipment.has(code))matches.add("hidraulica");if(electricalEquipment.has(code))matches.add("eletrica"); }
  let candidates=[...matches];
  if (!candidates.length) candidates=textAreas(order.equipment);
  if (!candidates.length) candidates=textAreas(order.description);
  const assignedArea=candidates.length===1?candidates[0]:"";
  return { assignedArea, assignedResponsible:assignedArea?responsibleByArea[assignedArea]:"", reason:assignedArea?"Cargo identificado pelo equipamento ou serviço.":candidates.length>1?"A OS envolve mais de um cargo. Defina o responsável.":"Equipamento ou serviço sem cargo identificado." };
}
export function isSorocabaUnit(unit: string): boolean { return /deposito.*sorocaba|sorocaba.*deposito/.test(normalizeText(unit)); }
