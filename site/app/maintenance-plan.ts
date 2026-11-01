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
// Plano operacional de novembro/2026: execução dividida em dias úteis de 03 a 17; a conclusão segue o prazo do IMAS (dia 20).
export const NOVEMBER_PLAN = [
  { date: "2026-11-03", focus: "Portão do corredor; sala online (no-break, detector de fumaça, DVR 1 e 2); bebedouros das salas RCO e Bombeiros", orders: [329528,329550,329551,329552,329553,329539,329540] },
  { date: "2026-11-04", focus: "Sala online (câmera, iluminária de emergência, quadros QDLT 4 e 5); bebedouros da recepção e guarita", orders: [329554,329555,329537,329538,329541,329542] },
  { date: "2026-11-05", focus: "Quadros do refeitório, poço caipira e oficina; banheiros dos vestiários; bebedouro predial", orders: [329529,329530,329531,329556,329557,329543] },
  { date: "2026-11-06", focus: "Quadros das bombas de hidrante, iluminação e galpão; bebedouros do depósito e refeitório 1", orders: [329532,329533,329534,329535,329544,329545] },
  { date: "2026-11-09", focus: "Quadro do escritório BB; central de alarme, botoeira e hidrante da recepção; bebedouros do refeitório 2 e depósito", orders: [329536,329558,329559,329561,329546,329547] },
  { date: "2026-11-10", focus: "Guarita (botoeira e válvula de recalque); interfone; hidrante H2 e botoeira da área interna; bebedouro do depósito", orders: [329560,329589,329582,329562,329563,329548] },
  { date: "2026-11-11", focus: "Gaiola de apreensão e vestiário masculino: hidrantes H3, H4, H6 e botoeiras", orders: [329564,329565,329566,329567,329570,329571] },
  { date: "2026-11-12", focus: "Almoxarifado e depósito: hidrantes H5, H7, H8 e botoeiras; bebedouro da sala do gerente", orders: [329568,329569,329572,329573,329574,329575,329549] },
  { date: "2026-11-13", focus: "Área externa, galpões 1 e 2 e depósito 2: hidrantes H9, H10, H11 e botoeiras", orders: [329576,329577,329578,329579,329580,329581] },
  { date: "2026-11-16", focus: "Bombas (uma OS para a Elétrica e outra para a Hidráulica, juntas); quadros da sala de bombas", orders: [329583,329584,329585,329586,329587,329588] },
  { date: "2026-11-17", focus: "Exaustores e ventiladores; iluminação de emergência do galpão", orders: [329590,329591,329592,329593,329594,329595] },
] as const;
const scheduledDates = new Map([...OCTOBER_PLAN, ...NOVEMBER_PLAN].flatMap(day => day.orders.map(os => [String(os), day.date] as const)));
export function scheduledExecutionDate(competence: string, osNumber: string): string {
  return competence === "2026-10" || competence === "2026-11" ? scheduledDates.get(osNumber) || "" : "";
}

// Atividades da elétrica: prazo só a partir de 16/10/2026 (supervisor focado na automação). Aplicado no cálculo, sem alterar o banco.
export const ELECTRICAL_NOT_BEFORE = "2026-10-16";
export function effectiveExecutionDate(competence: string, osNumber: string, area: string, status = ""): string {
  const date = scheduledExecutionDate(competence, osNumber);
  if (competence !== "2026-10" || area !== "eletrica" || /conclu[ií]da/i.test(status)) return date;
  return !date || date < ELECTRICAL_NOT_BEFORE ? ELECTRICAL_NOT_BEFORE : date;
}
