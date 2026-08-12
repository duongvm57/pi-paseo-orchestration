export default function (pi) {
  pi.registerCommand("pi-paseo-orchestration", {
    description: "Show Pi Paseo Orchestration package status",
    handler: (_args, ctx) => {
      ctx.ui.notify("Pi Paseo Orchestration skeleton loaded; v0.1 orchestration is not implemented.", "info");
    },
  });
}
