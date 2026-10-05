import { mount } from "svelte";
import App from "./App.svelte";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shelf.css";
import "./styles/reader.css";
import "./styles/dialog.css";

const target = document.getElementById("app")!;

// /demo/sync só existe no build demo. Em produção a condição é falsa em tempo de build e o
// Vite descarta o import, então a página (e o servidor em memória) nem entra no bundle.
if (import.meta.env.VITE_DEMO === "true" && location.pathname.replace(/\/+$/, "") === "/demo/sync") {
  void import("./demo/SyncDemo.svelte").then(({ default: SyncDemo }) => mount(SyncDemo, { target }));
} else {
  mount(App, { target });
}
