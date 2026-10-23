import { STANDARD_PHOTOS } from "./photo-policy";

// Update with CONTRATO.md whenever the integration contract or app release changes.
export const IMAS_CONTRACT = {
  schemaVersion: 1,
  appVersion: "2026-10-23.140",
  minExtensionVersion: "2.3.0",
  config: {
    maxFotosSemRevisao: STANDARD_PHOTOS,
    osProtegidas: ["323902", "324279"],
    publicIdsProtegidos: ["4e9bd0d3-5e4f-4f25-8301-2942d04dc0d1", "4d2fcf45-fbce-4c0c-9a02-688f1fe24000"],
    osTestesAnteriores: ["323080", "323081", "323082", "323140", "323145", "323157", "323162", "323164", "323165", "323166", "323930", "323963", "323964"],
  },
};
