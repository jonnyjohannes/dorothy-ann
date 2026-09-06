import { createApp } from "../server/app.js";
import { loadConfig } from "../server/config.js";

export default createApp({ config: loadConfig() }).fetch;
