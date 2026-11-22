// Must run before anything creates the Supabase client (view-only tracker links).
import "./lib/trackerShareFetch";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { installPreloadErrorRecovery } from "./lib/chunkRecovery";
import { installErrorReporter } from "./lib/errorReporter";
import "@fontsource-variable/hanken-grotesk/index.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "./index.css";

installPreloadErrorRecovery();
installErrorReporter();

createRoot(document.getElementById("root")!).render(<App />);
