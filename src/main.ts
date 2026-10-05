import { mount } from "svelte";
import App from "./App.svelte";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shelf.css";
import "./styles/app.css";

export default mount(App, { target: document.getElementById("app")! });
