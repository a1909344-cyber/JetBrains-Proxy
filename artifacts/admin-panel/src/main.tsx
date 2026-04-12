import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import { getStoredToken } from "./lib/api";

// All API calls automatically include the admin token as a Bearer header
setAuthTokenGetter(() => getStoredToken());

createRoot(document.getElementById("root")!).render(<App />);
