import { loadEnv } from "./load-env";

async function main() {
  loadEnv();
  const { getDb, closeDb } = await import("./index");
  const { wipe } = await import("./wipe");
  const db = await getDb();
  await wipe(db);
  console.log("Database wiped.");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
