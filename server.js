#!/usr/bin/env node

import { start } from "./server/start.js";

process.title = "panea-server";

start({ open: !process.env.PANEA_NO_OPEN }).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
