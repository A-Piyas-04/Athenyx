import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <p>
        <Link href="/login">Sign in</Link> to see your groups.
      </p>
    );
  }

  const groups = await db.group.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { name: "asc" },
  });

  return (
    <section>
      <h1>Your groups</h1>
      <ul>
        {groups.map((group) => (
          <li key={group.id}>
            <Link href={`/groups/${group.id}`}>{group.name}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
