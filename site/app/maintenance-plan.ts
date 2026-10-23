// Plano operacional aprovado para a janela solicitada de outubro/2026.
// Datas de abertura e conclusão do IMAS são preservadas separadamente.
export const OCTOBER_PLAN = [
  { date: "2026-10-05", focus: "Bombas de incêndio e quadros; acessos principais; climatização da sala online", orders: [323167,323168,323164,323165,323080,323081,323082,323126,323127] },
  { date: "2026-10-06", focus: "Bombas e recalque; iluminação de emergência; portões internos; sala administrativa", orders: [323096,323097,323174,323166,323162,323140,323083,323084,323085,323108,323109] },
  { date: "2026-10-07", focus: "Bomba e quadro do poço; vestiários; hidrante externo; almoxarifado", orders: [323094,323093,323163,323136,323137,323156,323157,323087,323088,323089,323133] },
  { date: "2026-10-08", focus: "Quadros e detecção de fumaça da sala online; portões dos depósitos; ares das salas RCO e Bombeiros", orders: [323101,323102,323125,323090,323091,323092,323134,323135] },
  { date: "2026-10-09", focus: "Nobreaks 1 a 9; central de alarme; pintura de portão e exaustor do depósito; AR 11 e AR 10", orders: [323124,323138,323086,323170,323103,323104] },
  { date: "2026-10-13", focus: "Estabilizador e telefonia; hidrantes e botoeiras da área interna, gaiola e vestiário; ventilação da cozinha", orders: [323123,323128,323142,323143,323144,323145,323146,323147,323171,323172,323105] },
  { date: "2026-10-14", focus: "Quadros de iluminação e escritórios; hidrantes do almoxarifado e gaiola; ventiladores dos galpões; AR 05", orders: [323098,323099,323100,323148,323149,323150,323151,323173,323106] },
  { date: "2026-10-15", focus: "DVR 1, câmera e emergência da sala online; hidrantes do depósito; bebedouros das salas e guarita; AR 15", orders: [323129,323131,323132,323152,323153,323154,323155,323112,323113,323114,323115,323107] },
  { date: "2026-10-16", focus: "DVR 2 e interfone; hidrantes dos galpões 1 e 2; bebedouros predial e depósito; AR 08", orders: [323130,323169,323158,323159,323160,323161,323116,323117,323120,323121,323110] },
  { date: "2026-10-19", focus: "Oficina e iluminação de emergência; hidrante e botoeira da recepção; bebedouros do refeitório e gerente; AR 09; conferência final", orders: [323095,323175,323139,323141,323118,323119,323122,323111] },
] as const;
const scheduledDates = new Map(OCTOBER_PLAN.flatMap(day => day.orders.map(os => [String(os), day.date] as const)));
export function scheduledExecutionDate(competence: string, osNumber: string): string {
  return competence === "2026-10" ? scheduledDates.get(osNumber) || "" : "";
}

// Atividades da elétrica: prazo só a partir de 16/10/2026 (supervisor focado na automação). Aplicado no cálculo, sem alterar o banco.
export const ELECTRICAL_NOT_BEFORE = "2026-10-16";
export function effectiveExecutionDate(competence: string, osNumber: string, area: string, status = ""): string {
  const date = scheduledExecutionDate(competence, osNumber);
  if (competence !== "2026-10" || area !== "eletrica" || /conclu[ií]da/i.test(status)) return date;
  return !date || date < ELECTRICAL_NOT_BEFORE ? ELECTRICAL_NOT_BEFORE : date;
}
