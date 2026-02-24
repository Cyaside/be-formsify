import { createServer } from "node:http";
import app from "./app";
import { setupRealtimeServer } from "./realtime/socket";

const port = Number(process.env.PORT ?? 3000);
const httpServer = createServer(app);
const io = setupRealtimeServer(httpServer);

httpServer.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(
    `Form collaboration realtime: ${io ? "enabled" : "disabled"} (ENABLE_FORM_COLLAB)`,
  );
});
