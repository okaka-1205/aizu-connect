import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {db} from "../lib/firebaseAdmin";

export const deletionLockRef = (type: "user" | "event", id: string) =>
  db.doc(`deletionLocks/${type}_${id}`);

export const isLiveResource = (snapshot: FirebaseFirestore.DocumentSnapshot) =>
  snapshot.exists && snapshot.data()?.status !== "deleting";

export const readLiveEvent = async (
  transaction: FirebaseFirestore.Transaction,
  eventId: string,
  status?: string,
) => {
  const event = await transaction.get(db.doc(`events/${eventId}`));
  const data = event.data();
  if (
    !isLiveResource(event) ||
    typeof data?.createdBy !== "string" ||
    (status && data.status !== status)
  ) {
    return null;
  }
  const owner = await transaction.get(db.doc(`users/${data.createdBy}`));
  return isLiveResource(owner) ? event : null;
};

export const readLiveApplication = async (
  transaction: FirebaseFirestore.Transaction,
  applicationId: string,
) => {
  const application = await transaction.get(
    db.doc(`eventApplications/${applicationId}`),
  );
  const data = application.data();
  if (
    !data ||
    ![data.eventId, data.studentId, data.organizationId].every(
      (id) => typeof id === "string" && id.length > 0,
    )
  ) {
    return null;
  }
  const [event, student, organizer] = await transaction.getAll(
    db.doc(`events/${data.eventId}`),
    db.doc(`users/${data.studentId}`),
    db.doc(`users/${data.organizationId}`),
  );
  return [event, student, organizer].every(isLiveResource) ?
    {application, event, student, organizer} :
    null;
};

// Keep the lock after physical deletion so late requests cannot recreate IDs.
export const runResourceDeletion = async (
  type: "user" | "event",
  id: string,
  operationId: string,
  cleanup: () => Promise<void>,
) => {
  await db.runTransaction(async (transaction) => {
    const ref = db.doc(`${type === "user" ? "users" : "events"}/${id}`);
    const lockRef = deletionLockRef(type, id);
    const roomRef = db.doc(`chatRooms/event_${id}`);
    const [resource, lock, room] = await transaction.getAll(
      ref,
      lockRef,
      ...(type === "event" ? [roomRef] : []),
    );
    const leaseUntil = lock.data()?.leaseUntil;
    if (
      lock.data()?.state === "running" &&
      leaseUntil instanceof Timestamp &&
      leaseUntil.toMillis() > Date.now()
    ) {
      throw new HttpsError(
        "aborted",
        "この対象の削除を処理中です。完了後に再試行してください。",
      );
    }
    transaction.set(
      lockRef,
      {
        resourceType: type,
        resourceId: id,
        operationId,
        state: "running",
        startedAt: FieldValue.serverTimestamp(),
        leaseUntil: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
      },
      {merge: true},
    );
    if (resource.exists && resource.data()?.status !== "deleting") {
      transaction.update(ref, {
        status: "deleting",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (room?.exists) {
      transaction.update(roomRef, {
        status: "read_only",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
  try {
    await cleanup();
    await deletionLockRef(type, id).set(
      {state: "completed"},
      {merge: true},
    );
  } catch (error) {
    await deletionLockRef(type, id).set({state: "failed"}, {merge: true});
    throw error;
  }
};
