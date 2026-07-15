import { supabase } from "../../utils/supabase.js";
import LogoutButton from "./LogoutButton.js";

export const dynamic = "force-dynamic";

async function getMembers() {
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, name, phone_number, role, status, created_at")
    .order("created_at", { ascending: false });

  if (usersError) throw usersError;

  const { data: subscriptions, error: subsError } = await supabase
    .from("subscriptions")
    .select("user_id, status, end_date, plans(name)")
    .order("end_date", { ascending: false });

  if (subsError) throw subsError;

  const latestSubByUser = new Map();
  for (const sub of subscriptions) {
    if (!latestSubByUser.has(sub.user_id)) {
      latestSubByUser.set(sub.user_id, sub);
    }
  }

  return users.map((user) => ({
    ...user,
    subscription: latestSubByUser.get(user.id) || null,
  }));
}

export default async function AdminDashboardPage() {
  const members = await getMembers();

  return (
    <main style={{ maxWidth: 960, margin: "40px auto", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Members</h1>
        <LogoutButton />
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
            <th style={{ padding: 8 }}>Name</th>
            <th style={{ padding: 8 }}>Phone</th>
            <th style={{ padding: 8 }}>Status</th>
            <th style={{ padding: 8 }}>Plan</th>
            <th style={{ padding: 8 }}>Expires</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{member.name || "—"}</td>
              <td style={{ padding: 8 }}>{member.phone_number}</td>
              <td style={{ padding: 8 }}>{member.status}</td>
              <td style={{ padding: 8 }}>{member.subscription?.plans?.name || "—"}</td>
              <td style={{ padding: 8 }}>
                {member.subscription?.end_date
                  ? new Date(member.subscription.end_date).toLocaleDateString()
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
