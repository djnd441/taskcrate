import React from "react";
import ReactDOM from "react-dom/client";
import "@task-manager/ui/tokens.css";
import "@task-manager/ui/styles.css";
import App from "./App";
import "./styles.css";
import "./ui-refresh.css";
import "./ui-refresh-mobile.css";
import "./ui-refresh-board.css";
import "./ui-refresh-detail.css";
import "./ui-refresh-pages.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
