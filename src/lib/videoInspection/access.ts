import type { SessionPayload } from '@/lib/auth';
import { getRlsDb } from '@/lib/apex/rlsContext';
import { effectiveRole } from '@/lib/apex/viewAs';

/** Managers / owners in dealership scope see all rooftop inspections; techs see own. */
export function canListAllInspections(session: SessionPayload): boolean {
  const role = effectiveRole(session);
  return role === 'manager' || role === 'owner' || Boolean(session.isAdmin);
}

export async function findInspectionForSession(session: SessionPayload, id: string) {
  const db = getRlsDb();
  const row = await db.videoInspection.findFirst({
    where: {
      id: id.trim(),
      dealershipId: session.dealershipId,
      ...(canListAllInspections(session) ? {} : { technicianId: session.technicianId }),
    },
    include: {
      technician: { select: { name: true } },
      dealership: { select: { name: true } },
    },
  });
  return row;
}
