import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireAuth } from "@/lib/auth/requireAuth";
import { listPlayerGuardians, listPlayersForGuardian } from "@/modules/players/db/queries";
import { PlayersAccountPanel } from "@/modules/players/components/PlayersAccountPanel";

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
