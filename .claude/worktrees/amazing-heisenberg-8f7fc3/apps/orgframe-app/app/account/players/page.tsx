import type { Metadata } from "next";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { requireAuth } from "@/src/features/core/auth/server/requireAuth";
import { listPlayerGuardians, listPlayersForGuardian } from "@/src/features/players/db/queries";
import { PlayersAccountPanel } from "@/src/features/players/components/PlayersAccountPanel";

export const metadata: Metadata = {
  title: "Players"
};

export default async function AccountPlayersPage() {
  const user = await requireAuth();
  const players = await listPlayersForGuardian(user.id);

  const playersWithGuardians = await Promise.all(
    players.map(async (player) => ({
      player,
      guardians: await listPlayerGuardians(player.id)
    }))
  );

  return (
    <>
      <PageHeader description="Manage player profiles and shared guardian access." showBorder={false} title="Players" />
      <PlayersAccountPanel currentUserId={user.id} initialPlayers={playersWithGuardians} />
    </>
  );
}
