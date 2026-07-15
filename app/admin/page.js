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
    <main className="admin-shell">
      <div className="admin-header">
        <h1>Members</h1>
        <LogoutButton />
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Plan</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td>{member.name || "—"}</td>
                <td>{member.phone_number}</td>
                <td>
                  <span
                    className={`badge ${
                      member.status === "active" ? "badge-active" : "badge-inactive"
                    }`}
                  >
                    {member.status}
                  </span>
                </td>
                <td>{member.subscription?.plans?.name || "—"}</td>
                <td>
                  {member.subscription?.end_date
                    ? new Date(member.subscription.end_date).toLocaleDateString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
