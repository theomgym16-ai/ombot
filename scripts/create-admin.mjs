import "dotenv/config";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import bcrypt from "bcryptjs";
import { supabase } from "../utils/supabase.js";

// Provisions/updates a dashboard admin account. There is no public signup
// route on purpose — this is the only way to create one, run locally by
// someone with access to the Supabase service role key.
async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  const username = (await rl.question("Admin username: ")).trim();
  // Terminal echo is not suppressed here — run this in a private terminal.
  const password = await rl.question("Admin password (min 12 chars): ");
  rl.close();

  if (!username || password.length < 12) {
    console.error(
      "Username is required and password must be at least 12 characters.",
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const { error } = await supabase
    .from("admins")
    .upsert(
      { username, password_hash: passwordHash, failed_attempts: 0, locked_until: null },
      { onConflict: "username" },
    );

  if (error) {
    console.error("Failed to create/update admin:", error.message);
    process.exit(1);
  }

  console.log(`Admin '${username}' created/updated successfully.`);
}

main();
